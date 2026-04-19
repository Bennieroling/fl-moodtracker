# Pulse — Database Schema Reference

_Last updated: 2026-04-19_

Complete reference for every table, view, index, constraint, and RLS
policy in the `public` schema. For the big-picture data flow, see
`01-architecture.md`.

## Conventions used in this doc

- **🟢 Active** — table is part of the current data pipeline
- **🟡 App feature** — written by the app UI, not the sync pipeline
- **🟠 Operational** — internal/meta tables (logs, keep-alive, etc.)
- **🔴 Deprecated** — exists but isn't written to anymore; candidate for removal
- **⚠️ Known issue** — documented problems we haven't fixed yet

Columns marked _(legacy)_ were populated by the old HealthFit/n8n
pipeline and are not written by the current HAE sync. They're kept to
avoid breaking older queries but should not be relied on for new work.

## Table of contents

**HAE pipeline — staging** (append-only inbox from Edge Function)
- [`staging_hae_metrics`](#staging_hae_metrics)
- [`staging_hae_workouts`](#staging_hae_workouts)
- [`staging_hae_other`](#staging_hae_other)

**HAE pipeline — production** (typed, deduplicated)
- [`health_metrics_daily`](#health_metrics_daily)
- [`health_metrics_body`](#health_metrics_body)
- [`exercise_events`](#exercise_events)
- [`workout_routes`](#workout_routes)
- [`sleep_events`](#sleep_events)
- [`state_of_mind`](#state_of_mind)
- [`ecg_readings`](#ecg_readings)
- [`heart_rate_notifications`](#heart_rate_notifications)

**App features** (user-generated content)
- [`food_entries`](#food_entries)
- [`mood_entries`](#mood_entries)
- [`insights`](#insights)

**App state & settings**
- [`user_preferences`](#user_preferences)
- [`streaks`](#streaks)
- [`knowledge_documents`](#knowledge_documents)

**Operational**
- [`sync_log`](#sync_log)
- [`keep_alive`](#keep_alive)

**Deprecated**
- [`exercise_daily`](#exercise_daily)

**Views**
- [`v_daily_activity`](#v_daily_activity)
- [`v_day_summary`](#v_day_summary)

**Cross-cutting issues**
- [Schema-wide known issues](#schema-wide-known-issues)

---

## HAE pipeline — staging

Staging tables are the landing zone for HAE's Edge Function pushes. They
are append-only, loosely typed, and carry a `processed_at` column that
the sync function uses to skip already-promoted rows. Rows older than
30 days that have been processed are auto-purged by
`purge_old_staging_rows()` (see `03-functions-and-cron.md`).

### `staging_hae_metrics` 🟢

Every single metric sample (step count, heart rate, active energy, etc.)
HAE exports lands as one row here.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `metric_name` | `text` | NO |  | e.g. `step_count`, `heart_rate`, `weight_body_mass` |
| 3 | `metric_units` | `text` | YES |  | e.g. `count`, `count/min`, `kJ`, `%` |
| 4 | `date` | `timestamptz` | NO |  | Sample timestamp (UTC) — despite the column name this is a full timestamp, not a date |
| 5 | `qty` | `numeric` | YES |  | The measured value |
| 6 | `raw_payload` | `jsonb` | YES |  | Full HAE JSON for the sample (for debugging) |
| 7 | `received_at` | `timestamptz` | YES | `now()` | When the Edge Function wrote this row |
| 8 | `processed_at` | `timestamptz` | YES |  | When `sync_hae_to_production()` promoted this row; NULL = pending |

**Primary key:** `(id)`
**Unique:** `(metric_name, date)` — ⚠️ see known issue below
**Indexes:**
- `idx_staging_hae_metrics_unprocessed` — partial index on `processed_at WHERE processed_at IS NULL` (makes the sync function's unprocessed-row lookup O(new rows))

**RLS:** none — this is an internal table, only the Edge Function and
the sync function write/read it via service-role key.

**⚠️ Known issues**

- **Unique on `(metric_name, date)` is fragile.** HAE normally doesn't
  repeat the exact same second-level timestamp for the same metric, but
  if two watches ever ran or a manual re-push happened with matching
  timestamps, the second row would be rejected. For a single-user setup
  this hasn't bitten us, but multi-user will need either `(metric_name,
  date, user_id)` or no constraint at all.
- **No `user_id` column.** All rows are implicitly for the hardcoded
  test user in the sync function. Multi-user requires adding `user_id`
  here and attaching it at ingest time.

### `staging_hae_workouts` 🟢

One row per workout session HAE exports. Large because `raw_payload`
carries the full GPS route (often thousands of points).

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `workout_name` | `text` | NO |  | e.g. `Walking`, `Running`, `Functional Strength Training` |
| 3 | `start_time` | `timestamptz` | NO |  | Workout start |
| 4 | `end_time` | `timestamptz` | YES |  |  |
| 5 | `duration_seconds` | `numeric` | YES |  |  |
| 6 | `active_energy_qty` | `numeric` | YES |  | kJ (converted to kcal by sync function) |
| 7 | `active_energy_units` | `text` | YES |  |  |
| 8 | `distance_qty` | `numeric` | YES |  | km |
| 9 | `distance_units` | `text` | YES |  |  |
| 10 | `avg_heart_rate` | `numeric` | YES |  |  |
| 11 | `max_heart_rate` | `numeric` | YES |  |  |
| 12 | `raw_payload` | `jsonb` | YES |  | Full HAE JSON, including the `route` array |
| 13 | `received_at` | `timestamptz` | YES | `now()` |  |
| 14 | `processed_at` | `timestamptz` | YES |  |  |

**Primary key:** `(id)`
**Unique:** `(workout_name, start_time)`
**Indexes:**
- `idx_staging_hae_workouts_unprocessed` (partial on `processed_at IS NULL`)

**RLS:** none.

**⚠️ Known issues**

- Average row size ~170 KB due to GPS route data. ~84 rows currently use
  ~14 MB. For heavy runners/cyclists this could grow fast.

### `staging_hae_other` 🟢

Catch-all for state of mind, ECG, and heart rate notification pushes.
Each row carries the raw HAE payload in `raw_payload` with a
`data_type` discriminator.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `data_type` | `text` | NO |  | `stateOfMind` / `ecg` / `heartRateNotification` |
| 3 | `raw_payload` | `jsonb` | NO |  |  |
| 4 | `received_at` | `timestamptz` | YES | `now()` |  |
| 5 | `processed_at` | `timestamptz` | YES |  |  |

**Primary key:** `(id)`
**Indexes:**
- `idx_staging_hae_other_unprocessed` (partial on `processed_at IS NULL`)

**RLS:** none.

---

## HAE pipeline — production

These are the typed, deduplicated tables the frontend reads. Written
exclusively by `sync_hae_to_production()`. All are protected by RLS
tied to `auth.uid()`.

### `health_metrics_daily` 🟢

One row per user per day. All values are aggregated per user's local
day (from `user_preferences.timezone`). This is the core dashboard
table.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `date` | `date` | NO |  | User's local day |
| 2 | `active_energy_kcal` | `numeric(10,2)` | YES |  |  |
| 3 | `resting_energy_kcal` | `numeric(10,2)` | YES |  |  |
| 4 | `total_energy_kcal` | `numeric(10,2)` | YES |  | _(legacy — not written by HAE sync)_ |
| 5 | `steps` | `numeric` | YES |  |  |
| 6 | `distance_km` | `numeric` | YES |  | _(legacy)_ |
| 7 | `exercise_minutes` | `numeric` | YES |  | _(legacy — see exercise_time_minutes)_ |
| 8 | `stand_hours` | `numeric` | YES |  |  |
| 9 | `resting_heart_rate` | `numeric` | YES |  |  |
| 10 | `average_heart_rate` | `numeric` | YES |  | _(legacy)_ |
| 11 | `vo2max` | `numeric(5,2)` | YES |  | _(legacy — not written by HAE sync)_ |
| 12 | `source` | `text` | YES | `'healthfit'` | `'health_auto_export'` for HAE-synced rows |
| 13 | `updated_at` | `timestamptz` | YES | `now()` |  |
| 14 | `user_id` | `uuid` | YES |  |  |
| 15 | `hrv` | `numeric(6,2)` | YES |  | ms |
| 16 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 17 | `exercise_time_minutes` | `numeric` | YES |  | Written by HAE sync |

**Primary key:** `(id)`
**Unique constraints:**
- `(date)` — ⚠️ **only one row per date globally** (see known issue)
- `(user_id, date)` — correct form, enforced by several overlapping indexes

**Indexes (redundant — see known issue):**
- `health_metrics_daily_date_idx` on `(date)`
- `health_metrics_daily_pkey` on `(id)`
- `health_metrics_daily_unique_date` UNIQUE on `(date)`
- `health_metrics_daily_user_date` UNIQUE on `(user_id, date)`
- `health_metrics_daily_user_date_key` UNIQUE on `(user_id, date)`
- `uniq_health_daily_user_date` UNIQUE on `(user_id, date)`
- `ux_health_metrics_daily_user_date` UNIQUE on `(user_id, date)`

**RLS:** `Users manage own health metrics daily` — `ALL` where
`auth.uid() = user_id`.

**⚠️ Known issues**

- **`UNIQUE (date)` without `user_id` is a multi-user blocker.** Only
  one row per date globally. Must be dropped before multi-user launch.
- **Five identical indexes on `(user_id, date)`.** Created by successive
  migrations; all but one can be dropped.
- **Duplicate columns for the same metric:** `exercise_minutes` (legacy)
  and `exercise_time_minutes` (current); `total_energy_kcal` (legacy,
  never populated by HAE sync).
- `vo2max` has a type (`numeric(5,2)`) but no HAE sync code writes to
  it — will always be NULL for new data until the sync is extended.

### `health_metrics_body` 🟢

One row per user per day for weight, BMI, and body fat. Latest reading
of the day wins if multiple exist.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO |  | FK → `auth.users(id)` |
| 3 | `date` | `date` | NO |  | User's local day |
| 4 | `weight_kg` | `numeric` | YES |  |  |
| 5 | `body_fat_pct` | `numeric` | YES |  | 0–100 scale |
| 6 | `bmi` | `numeric` | YES |  |  |
| 7 | `source` | `text` | YES | `'healthfit'` | `'health_auto_export'` for HAE-synced rows |
| 8 | `updated_at` | `timestamptz` | YES | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, date)`
**Foreign key:** `user_id` → `auth.users(id) ON DELETE CASCADE`

**RLS:** `Users manage own body metrics` — `ALL` where `auth.uid() = user_id`.

### `exercise_events` 🟢

One row per workout session. **This table is messy** — it accumulated
columns from the HealthFit/Google Sheets pipeline that are no longer
populated. See known issues.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `workout_date` | `date` | NO |  | User's local day |
| 4 | `started_at` | `timestamptz` | YES |  |  |
| 5 | `workout_type` | `text` | YES |  | e.g. `Walking`, `Running` |
| 6 | `total_minutes` | `numeric` | YES |  | _(legacy — use `duration_seconds`)_ |
| 7 | `move_minutes` | `numeric` | YES |  | _(legacy)_ |
| 8 | `distance_km` | `numeric` | YES |  |  |
| 9 | `active_energy_kcal` | `numeric` | YES |  |  |
| 10 | `avg_hr` | `numeric` | YES |  | _(legacy — use `avg_heart_rate`)_ |
| 11 | `min_hr` | `numeric` | YES |  | _(legacy)_ |
| 12 | `max_hr` | `numeric` | YES |  | _(legacy)_ |
| 13 | `source` | `text` | NO | `'healthfit'` | Set to `'health_auto_export'` by HAE sync |
| 14 | `sheet_row_number` | `integer` | YES |  | _(legacy — Google Sheets row index)_ |
| 15 | `updated_at` | `timestamptz` | NO | `now()` |  |
| 16 | `ended_at` | `timestamptz` | YES |  |  |
| 17 | `duration_seconds` | `integer` | YES |  | Written by HAE sync |
| 18 | `elevation_gain_m` | `numeric` | YES |  |  |
| 19 | `total_energy_kcal` | `numeric` | YES |  | _(legacy)_ |
| 20 | `avg_heart_rate` | `numeric` | YES |  | Written by HAE sync |
| 21 | `max_heart_rate` | `numeric` | YES |  | Written by HAE sync |
| 22 | `hr_zone_type` | `text` | YES |  | _(legacy — HRZ computed by HealthFit)_ |
| 23-28 | `hrz0_seconds` … `hrz5_seconds` | `integer` | YES | `0` | _(legacy — HR zone durations)_ |
| 29 | `trimp` | `numeric` | YES |  | _(legacy — training impulse)_ |
| 30 | `mets` | `numeric` | YES |  | Written by HAE sync (from `intensity`) |
| 31 | `rpe` | `numeric` | YES |  | _(legacy — rate of perceived exertion)_ |
| 32 | `temperature` | `numeric` | YES |  |  |
| 33 | `humidity` | `numeric` | YES |  |  |
| 34 | `min_heart_rate` | `numeric` | YES |  | Set to NULL by HAE sync (HAE doesn't export it) |
| 35 | `avg_speed_kmh` | `numeric` | YES |  |  |
| 36 | `step_count` | `numeric` | YES |  |  |
| 37 | `step_cadence` | `numeric` | YES |  |  |
| 38 | `route_data` | `jsonb` | YES |  | Raw HAE route array; used to build `workout_routes` |

**Primary key:** `(id)`
**Unique:**
- `exercise_events_unique_workout` on `(user_id, workout_date, started_at)` — used by HAE sync's `ON CONFLICT`
- `uniq_exercise_events_user_row` on `(user_id, sheet_row_number)` — ⚠️ **breaks with HAE data** (see below)

**Indexes (multiple overlapping):**
- `idx_exercise_events_user_date` on `(user_id, workout_date)`
- `idx_exercise_events_user_started` on `(user_id, started_at)`
- `idx_exercise_events_user_started_at` on `(user_id, started_at DESC)`
- `idx_exercise_events_user_workout_date` on `(user_id, workout_date DESC)`

**RLS:** `Users manage own exercise events` — `ALL` where `auth.uid() = user_id`.

**⚠️ Known issues**

- **Duplicate HR columns** (`avg_hr`/`min_hr`/`max_hr` vs
  `avg_heart_rate`/`min_heart_rate`/`max_heart_rate`). HAE sync writes
  the `_heart_rate` flavour. The short `_hr` columns are legacy and
  should be dropped.
- **Duplicate time columns** (`total_minutes`, `move_minutes`,
  `total_energy_kcal`, `duration_seconds`). HAE sync writes
  `duration_seconds`. Others are legacy.
- **`uniq_exercise_events_user_row` on `(user_id, sheet_row_number)`
  prevents multiple HAE workouts with NULL sheet_row_number.** The
  constraint was designed for Google Sheets data where `sheet_row_number`
  was always populated. With HAE data, all rows have NULL — Postgres's
  default unique behavior treats NULLs as distinct, so this hasn't
  broken yet, but the constraint is meaningless for HAE data and adds
  confusion.
- Four redundant indexes on `user_id + date/started_at` combinations.

### `workout_routes` 🟢

GPS points for each `exercise_events` row that had route data. Separated
from `exercise_events` so the main table doesn't carry multi-megabyte
JSONB columns.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO | hardcoded test user UUID | ⚠️ see known issue |
| 3 | `exercise_event_id` | `bigint` | YES |  | FK → `exercise_events(id)` |
| 4 | `route_points` | `jsonb` | NO |  | Array of `{lat, lng, alt, speed, ts}` objects (short keys!) |
| 5 | `point_count` | `integer` | NO |  |  |
| 6-9 | `bounds_ne_lat` / `bounds_ne_lng` / `bounds_sw_lat` / `bounds_sw_lng` | `numeric` | YES |  | Precomputed bounding box for fast map fitting |
| 10 | `source` | `text` | NO | `'health_auto_export'` |  |
| 11 | `created_at` | `timestamptz` | YES | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(exercise_event_id)` — one routes row per workout
**Foreign keys:**
- `exercise_event_id` → `exercise_events(id) ON DELETE CASCADE`
- `user_id` → `auth.users(id) ON DELETE CASCADE`

**RLS:** `Users see own routes` — `ALL` where `auth.uid() = user_id`.

**⚠️ Notes**

- `route_points` uses **short key names** (`lat`, `lng`, `alt`, `ts`)
  — NOT HAE's raw keys (`latitude`, `longitude`, etc.). The sync
  function transforms the keys during insert. The frontend Map
  component depends on this short format — key mismatch causes a
  silent client-side render failure.

### `sleep_events` 🟢

One row per user per day. Includes overnight wrist temperature when
available.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO | hardcoded test user UUID | ⚠️ |
| 3 | `date` | `date` | NO |  | User's local day |
| 4 | `total_sleep_hours` | `numeric` | YES |  |  |
| 5-8 | `rem_hours` / `core_hours` / `deep_hours` / `awake_hours` | `numeric` | YES |  |  |
| 9-10 | `sleep_start` / `sleep_end` | `timestamptz` | YES |  |  |
| 11-12 | `in_bed_start` / `in_bed_end` | `timestamptz` | YES |  |  |
| 13 | `wrist_temperature` | `numeric` | YES |  | °C average over sleep window |
| 14 | `source` | `text` | YES |  |  |
| 15 | `created_at` | `timestamptz` | YES | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, date)`

**RLS:** `Users see own sleep` — `ALL` where `auth.uid() = user_id`.

**⚠️ Known issue**

- **Not defined via migration file.** Per your memory, this table was
  created directly via the Supabase SQL Editor, so the repo schema is
  out of sync with the live database. A migration should be backfilled
  so fresh environments can reproduce the DB.

### `state_of_mind` 🟢

Apple Watch "state of mind" logs (introduced iOS 17).

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO | hardcoded test user UUID | ⚠️ |
| 3 | `recorded_at` | `timestamptz` | NO |  | When the user logged the mood |
| 4 | `kind` | `text` | YES |  | e.g. `momentary`, `daily` |
| 5 | `valence` | `numeric` | YES |  | -1.0 to +1.0 |
| 6 | `valence_classification` | `text` | YES |  | e.g. `Pleasant`, `Unpleasant` |
| 7 | `labels` | `text[]` | YES |  | User-selected feeling labels |
| 8 | `associations` | `text[]` | YES |  | User-selected context tags |
| 9 | `source_id` | `text` | YES |  | HAE's stable ID for dedup |
| 10 | `raw_payload` | `jsonb` | YES |  |  |
| 11 | `received_at` | `timestamptz` | YES | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, recorded_at, source_id)` — three-part key required
because the same second can contain multiple mood logs

**RLS:** `Users see own state_of_mind` — `ALL` where `auth.uid() = user_id`.

### `ecg_readings` 🟢

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO | hardcoded test user UUID | ⚠️ |
| 3 | `recorded_at` | `timestamptz` | NO |  |  |
| 4 | `classification` | `text` | YES |  | e.g. `Sinus Rhythm`, `Atrial Fibrillation` |
| 5 | `average_heart_rate` | `numeric` | YES |  |  |
| 6 | `number_of_measurements` | `integer` | YES |  |  |
| 7 | `sampling_frequency` | `numeric` | YES |  | Hz |
| 8 | `source` | `text` | YES |  |  |
| 9 | `received_at` | `timestamptz` | YES | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, recorded_at)`

**RLS:** `Users see own ecg_readings` — `ALL` where `auth.uid() = user_id`.

### `heart_rate_notifications` 🟢

Apple Watch high/low/irregular HR alerts.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement | PK |
| 2 | `user_id` | `uuid` | NO | hardcoded test user UUID | ⚠️ |
| 3 | `recorded_at` | `timestamptz` | NO |  |  |
| 4 | `notification_type` | `text` | YES |  |  |
| 5 | `heart_rate` | `numeric` | YES |  |  |
| 6 | `threshold` | `numeric` | YES |  |  |
| 7 | `raw_payload` | `jsonb` | YES |  |  |
| 8 | `received_at` | `timestamptz` | YES | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, recorded_at)`

**RLS:** `Users see own hr_notifications` — `ALL` where `auth.uid() = user_id`.

---

## App features

### `food_entries` 🟡

Meal logs with photo/voice/AI-parsed nutrition data.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `date` | `date` | NO |  |  |
| 4 | `meal` | enum | NO |  | Custom enum type — see check via `\d` in psql |
| 5 | `photo_url` | `text` | YES |  |  |
| 6 | `voice_url` | `text` | YES |  |  |
| 7 | `food_labels` | `text[]` | YES |  |  |
| 8 | `calories` | `numeric` | YES |  |  |
| 9 | `macros` | `jsonb` | YES |  | `{protein, carbs, fat}` structure |
| 10 | `ai_raw` | `jsonb` | YES |  | Full LLM output for debugging |
| 11 | `note` | `text` | YES |  |  |
| 12 | `journal_mode` | `boolean` | NO | `false` | Excluded from `v_day_summary` calorie totals when true |
| 13 | `created_at` | `timestamptz` | NO | `now()` |  |
| 14 | `updated_at` | `timestamptz` | NO | `now()` |  |

**Primary key:** `(id)`
**Foreign key:** `user_id` → `auth.users(id) ON DELETE CASCADE`

**Indexes (redundant):**
- `idx_food_entries_meal` on `(meal)`
- `idx_food_entries_user_date`, `idx_food_entries_user_date_desc`, `idx_food_user_date` — three overlapping indexes on `(user_id, date)`
- `idx_food_user_meal` on `(user_id, meal)`

**RLS:** **highly redundant (11 policies — see known issue)**

Intended production policies:
- `food_select_own` / `food_insert_own` / `food_update_own` / `food_delete_own` — `user_id = auth.uid()`

Leftover/debug policies:
- `Users can view/insert/update their own food entries` — same as above, older naming
- `Allow anon read` — `SELECT` for anon, predicate `true` (⚠️ open read)
- `anon_can_read_food_entries` — duplicate of the above
- `allow_test_user_food_entries` / `allow_test_user_insert` /
  `allow_test_user_insert_food_entries` / `test_user_can_insert_food_entries`
  — hardcoded to user `97c22f4c-cbd3-43dc-8227-e7022cf990f3` (⚠️ **different UUID** than the one used by the sync function)

**⚠️ Known issues**

- **Massively redundant RLS policies.** 11 policies exist; 4 are the
  correct production ones, 7 are leftover debug/test overrides that
  should be cleaned up.
- **Some policies grant anon role SELECT access with predicate `true`**
  — functionally making food entries world-readable via the anon key.
  Probably unintended.

### `mood_entries` 🟡

Simple daily mood tracking.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `date` | `date` | NO |  |  |
| 4 | `mood_score` | `integer` | NO |  | 1–5, CHECK enforced |
| 5 | `note` | `text` | YES |  |  |
| 6 | `journal_mode` | `boolean` | NO | `false` |  |
| 7 | `created_at` | `timestamptz` | NO | `now()` |  |
| 8 | `updated_at` | `timestamptz` | NO | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, date)` — one mood per user per day
**Check:** `mood_score BETWEEN 1 AND 5`
**Foreign key:** `user_id` → `auth.users(id) ON DELETE CASCADE`

**Indexes (redundant):** three overlapping on `(user_id, date)`.

**RLS:** same pattern as `food_entries` — production policies plus
legacy debug/test policies referencing `97c22f4c-...`. Needs cleanup.

### `insights` 🟡

AI-generated weekly/monthly summaries.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `period_start` | `date` | NO |  |  |
| 4 | `period_end` | `date` | NO |  |  |
| 5 | `summary_md` | `text` | YES |  | Markdown body |
| 6 | `tips_md` | `text` | YES |  |  |
| 7 | `metrics` | `jsonb` | YES |  | Snapshot of underlying data used to generate the insight |
| 8 | `created_at` | `timestamptz` | NO | `now()` |  |
| 9 | `updated_at` | `timestamptz` | NO | `now()` |  |

**Primary key:** `(id)`
**Unique:** `(user_id, period_start, period_end)`
**Foreign key:** `user_id` → `auth.users(id) ON DELETE CASCADE`

**RLS:** same pattern — production + legacy test policies.

---

## App state & settings

### `user_preferences` 🟢

User-level settings. One row per user.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `user_id` | `uuid` | NO |  | FK → `auth.users(id)` |
| 3 | `units` | `text` | YES | `'metric'` | `'metric'` or `'imperial'` (CHECK enforced) |
| 4 | `reminder_enabled` | `boolean` | YES | `true` |  |
| 5 | `reminder_time` | `time` | YES | `09:00:00` |  |
| 6 | `journal_mode_default` | `boolean` | YES | `false` |  |
| 7 | `notifications_enabled` | `boolean` | YES | `true` |  |
| 8 | `created_at` | `timestamptz` | YES | `now()` |  |
| 9 | `updated_at` | `timestamptz` | YES | `now()` |  |
| 10 | `onboarding_completed` | `boolean` | NO | `false` |  |
| 11 | `onboarding_preferred_method` | `text` | YES |  | CHECK: `photo`/`voice`/`text`/`manual` |
| 12 | `onboarding_completed_at` | `timestamptz` | YES |  |  |
| 13 | `daily_targets` | `jsonb` | YES | `{"steps": 10000, "active_energy": 600, "calorie_intake": 2000, "exercise_minutes": 30}` | User-configurable goal targets |
| 14 | `timezone` | `text` | NO | `'UTC'` | IANA zone, e.g. `Europe/Madrid`. Read by `sync_hae_to_production()` for date bucketing. |

**Primary key:** `(id)`
**Unique:** `(user_id)`
**Foreign key:** `user_id` → `auth.users(id) ON DELETE CASCADE`

**RLS:** four policies (production only — clean).

### `streaks` 🟡

Gamification — consecutive-day tracking for mood/food logging.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `user_id` | `uuid` | NO |  |  |
| 3 | `current_streak` | `integer` | NO | `0` |  |
| 4 | `longest_streak` | `integer` | NO | `0` |  |
| 5 | `updated_at` | `timestamptz` | NO | `now()` |  |
| 6 | `last_entry_date` | `date` | YES |  |  |

**Primary key:** `(id)`
**Unique:** `(user_id)` — one streak row per user

**RLS:** same mixed pattern — production + legacy test policies.

### `knowledge_documents` 🟡

pgvector embeddings for RAG (retrieval-augmented generation). Used by
the AI insights feature to ground responses.

| # | Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| 2 | `content` | `text` | NO |  | Document chunk |
| 3 | `embedding` | `vector` | NO |  | pgvector embedding |
| 4 | `metadata` | `jsonb` | NO | `{}` |  |
| 5 | `created_at` | `timestamptz` | NO | `now()` |  |

**Primary key:** `(id)`
**Indexes:**
- `knowledge_documents_embedding_idx` — IVFFlat on `embedding` using `vector_cosine_ops`, 100 lists
- `knowledge_documents_metadata_idx` — GIN on `metadata` for JSONB containment queries

**RLS:** none configured in the policies we inspected — likely read-only
via service role.

---

## Operational

### `sync_log` 🟠

**Legacy.** Written by the old HealthFit/n8n pipeline. Not written by
the current HAE sync (which logs via the function's `RETURN` text
instead).

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | `bigint` | NO | autoincrement |
| 2 | `run_at` | `timestamptz` | YES | `now()` |
| 3 | `sheet_name` | `text` | NO |  |
| 4 | `rows_fetched` | `integer` | YES | `0` |
| 5 | `rows_upserted` | `integer` | YES | `0` |
| 6 | `error_message` | `text` | YES |  |
| 7 | `duration_ms` | `integer` | YES |  |

**Primary key:** `(id)`

**⚠️ Known issue:** unused by current pipeline. Candidate for deletion
or repurposing as a general sync audit log (would need schema changes).

### `keep_alive` 🟠

Pinged periodically to prevent Supabase free-tier pausing.

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `id` | `uuid` | NO | `gen_random_uuid()` |
| 2 | `pinged_at` | `timestamptz` | YES | `now()` |
| 3 | `timestamp` | `timestamptz` | YES | `now()` |

**Primary key:** `(id)`

**RLS:** permissive (`anon ALL, true`) — intentional, this table is
public ping-land.

**⚠️ Known issue:** duplicate columns (`pinged_at` and `timestamp`).
Pick one, drop the other.

---

## Deprecated

### `exercise_daily` 🔴

Intended as a pre-aggregated daily exercise table from the old
HealthFit pipeline. **Empty** (0 rows) and not written by the current
HAE sync — the frontend aggregates on the fly from `exercise_events`
instead.

| # | Column | Type | Nullable | Default |
|---|---|---|---|---|
| 1 | `date` | `date` | NO |  |
| 2 | `move_time_minutes` | `numeric` | YES |  |
| 3 | `exercise_time_minutes` | `numeric` | YES |  |
| 4 | `stand_time_minutes` | `numeric` | YES |  |
| 5 | `active_energy_kcal` | `numeric` | YES |  |
| 6 | `distance_km` | `numeric` | YES |  |
| 7 | `source` | `text` | YES | `'healthfit'` |
| 8 | `updated_at` | `timestamptz` | YES | `now()` |
| 9 | `user_id` | `uuid` | YES |  |
| 10 | `workouts` | `integer` | NO | `0` |

**Primary key:** `(date)` (⚠️ single-user bottleneck even if it were used)
**Constraints:** 4 separate UNIQUE indexes all on `(user_id, date)` — piled
up across migrations, none doing actual work since the table is empty.

**Still referenced by:** function `get_latest_exercise_date` (probably
safe to drop alongside the table).

**Recommendation:** drop the table and its helper function when
convenient. Kept here for historical clarity.

---

## Views

Views are what the frontend primarily reads from. Both views apply
`WHERE user_id = auth.uid()` (or similar implicit filtering), which
means **they will return zero rows when queried from the Supabase SQL
Editor** (where `auth.uid()` is NULL). To debug, query the underlying
tables with a hardcoded user ID.

### `v_daily_activity`

Joins `health_metrics_daily` with an on-the-fly aggregation of
`exercise_events` to produce one row per user per day with all
dashboard-relevant activity stats. Used by the frontend's dashboard,
calendar, and history views.

**Key behavior:**
- Groups `exercise_events` by `(user_id, workout_date)` summing
  duration, distance, and kcal
- `COALESCE`s `exercise_time_minutes` between HMD and computed ex
  aggregate, preferring HMD
- Multiplies `stand_hours` by 60 to give `stand_time_minutes`
- Filters by `hmd.user_id = auth.uid()` (RLS-style filter in the view
  definition)

**Full SQL:**

```sql
SELECT hmd.user_id,
    hmd.date,
    hmd.total_energy_kcal,
    hmd.active_energy_kcal,
    hmd.resting_energy_kcal,
    hmd.steps,
    COALESCE(hmd.exercise_time_minutes, ex.duration_minutes) AS exercise_time_minutes,
    COALESCE(ex.duration_minutes, hmd.exercise_time_minutes) AS move_time_minutes,
    CASE
        WHEN (hmd.stand_hours IS NULL) THEN NULL::numeric
        ELSE (hmd.stand_hours * 60::numeric)
    END AS stand_time_minutes,
    ex.distance_km,
    ex.total_exercise_kcal AS exercise_kcal,
    hmd.resting_heart_rate,
    hmd.hrv,
    hmd.vo2max,
    COALESCE(hmd.source, 'healthfit'::text) AS source
FROM health_metrics_daily hmd
LEFT JOIN (
    SELECT exercise_events.user_id,
        exercise_events.workout_date,
        (sum(COALESCE(exercise_events.duration_seconds, 0))::numeric / 60.0) AS duration_minutes,
        sum(COALESCE(exercise_events.distance_km, 0::numeric)) AS distance_km,
        sum(COALESCE(exercise_events.active_energy_kcal, 0::numeric)) AS total_exercise_kcal,
        count(*) AS workout_count
    FROM exercise_events
    GROUP BY exercise_events.user_id, exercise_events.workout_date
) ex ON ex.user_id = hmd.user_id AND ex.workout_date = hmd.date
WHERE hmd.user_id = auth.uid();
```

### `v_day_summary`

Per-user-per-day food/mood summary. Used by the dashboard's daily
cards.

**Key behavior:**
- Sums `calories` and macros from `food_entries`, **excluding rows with
  `journal_mode = true`** (those are private notes, not counted)
- Joins in the day's `mood_score` via correlated subquery

**Full SQL:**

```sql
SELECT user_id,
    date,
    COALESCE(sum(CASE WHEN NOT journal_mode THEN calories ELSE NULL::numeric END), 0::numeric) AS calories_total,
    jsonb_build_object(
        'protein', COALESCE(sum(((macros ->> 'protein'::text))::numeric) FILTER (WHERE NOT journal_mode), 0::numeric),
        'carbs',   COALESCE(sum(((macros ->> 'carbs'::text))::numeric)   FILTER (WHERE NOT journal_mode), 0::numeric),
        'fat',     COALESCE(sum(((macros ->> 'fat'::text))::numeric)     FILTER (WHERE NOT journal_mode), 0::numeric)
    ) AS macros_total,
    (SELECT m.mood_score
       FROM mood_entries m
      WHERE m.user_id = f.user_id AND m.date = f.date) AS mood_score
FROM food_entries f
GROUP BY user_id, date;
```

**⚠️ Known issue:** the `v_day_summary` view doesn't filter by
`auth.uid()` in its definition — it relies entirely on RLS on the
underlying `food_entries` and `mood_entries` tables to scope results.
This works correctly but is stylistically inconsistent with
`v_daily_activity`.

---

## Schema-wide known issues

These are issues that span multiple tables and need coordinated
cleanup:

### 1. Two different "test user" UUIDs in play

- **`a5dafd53-74d9-4492-9b60-944cfdf5d336`** — hardcoded in
  `sync_hae_to_production()` and in the `DEFAULT` clauses of several
  production table `user_id` columns (`ecg_readings`, `sleep_events`,
  `state_of_mind`, `heart_rate_notifications`, `workout_routes`).
- **`97c22f4c-cbd3-43dc-8227-e7022cf990f3`** — referenced in legacy RLS
  policies on `food_entries`, `mood_entries`, `insights`, `streaks`
  that grant the anon role write access for that specific user.

These are **two different users** pretending to be "the test user".
Cleanup before multi-user launch: drop the second UUID's policies
entirely, settle on one test user, or replace both with proper auth
scoping.

### 2. Hardcoded user_id defaults

Several tables have a `user_id DEFAULT 'a5dafd53-...'::uuid`, which
means any INSERT without an explicit `user_id` goes to the test user.
Safe today, foot-gun for multi-user. Remove the defaults when adding
`user_id` to ingest flows.

### 3. Overlapping / redundant indexes

Tables with the worst cases:
- `health_metrics_daily` — 5 identical indexes on `(user_id, date)`
- `exercise_events` — 4 overlapping indexes on `user_id + date/started_at`
- `exercise_daily` — 5 overlapping indexes on an empty table
- `food_entries`, `mood_entries` — 3 each on `(user_id, date)`

Consolidation could free significant write overhead and storage. Each
index costs ~2× per write.

### 4. Legacy columns from HealthFit era

Tables with stale columns:
- `health_metrics_daily`: `exercise_minutes`, `total_energy_kcal`, `average_heart_rate`, `vo2max`, `distance_km`
- `exercise_events`: `total_minutes`, `move_minutes`, `avg_hr`, `min_hr`, `max_hr`, `sheet_row_number`, `total_energy_kcal`, `hr_zone_type`, `hrz0_seconds`…`hrz5_seconds`, `trimp`, `rpe`
- `keep_alive`: `timestamp` (duplicate of `pinged_at`)

None are written by the HAE pipeline. If the frontend also doesn't
read them, they can be dropped. A `SELECT` audit of the codebase is
needed before actually dropping.

### 5. Legacy RLS policies and anon-read access

Multiple tables (`food_entries`, `mood_entries`, `insights`, `streaks`)
have legacy policies that either:
- Grant anon role unrestricted read access (e.g. `anon_can_read_food_entries`
  with predicate `true`)
- Reference the second test user UUID

Clean these up alongside (1).

### 6. Schema drift — `sleep_events` not in migrations

Per internal knowledge, `sleep_events` was created directly via the
Supabase SQL Editor after the initial migration set. A fresh clone of
the repo wouldn't reproduce this table. Need to backfill a migration
file.
