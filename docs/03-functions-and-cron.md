# Pulse — Database Functions, Triggers & Cron

_Last updated: 2026-04-19_

Complete reference for every PL/pgSQL function, trigger, and scheduled
cron job in the Pulse database. Excludes pgvector extension functions
(dozens of C-language internals for the `vector` / `halfvec` /
`sparsevec` types) and Supabase-shipped JWT helpers (`algorithm_sign`,
`sign`, `verify`, `url_encode`, `url_decode`) which are library code,
not ours to maintain.

For the surrounding tables and data flow, see `01-architecture.md` and
`02-database-schema.md`.

## Conventions used in this doc

- **🟢 Active** — used by the live pipeline or UI
- **🟡 Helper** — exists for the app UI to call
- **🔴 Deprecated / broken** — doesn't do anything useful today
- **⚠️ Known issue** — documented problems we haven't fixed yet

## Table of contents

**Core HAE pipeline**
- [`sync_hae_to_production()`](#sync_hae_to_production)
- [`purge_old_staging_rows()`](#purge_old_staging_rows)

**User lifecycle**
- [`create_user_preferences()`](#create_user_preferences) (trigger fn)
- [`ensure_user_preferences(uuid)`](#ensure_user_preferences)

**App feature helpers**
- [`add_food_entry(...)`](#add_food_entry)
- [`upsert_mood(...)`](#upsert_mood)
- [`insert_knowledge_document(...)`](#insert_knowledge_document)

**Aggregates & queries**
- [`get_activity_aggregates(...)`](#get_activity_aggregates)
- [`calculate_weekly_metrics(...)`](#calculate_weekly_metrics)
- [`get_latest_health_date(uuid)`](#get_latest_health_date)
- [`get_latest_exercise_date(uuid)`](#get_latest_exercise_date) 🔴

**Streaks (duplicated logic — see known issue)**
- [`update_streaks_on_entry()`](#update_streaks_on_entry) (trigger fn)
- [`recalc_streaks(uuid)`](#recalc_streaks)

**Small utilities**
- [`touch_updated_at()`](#touch_updated_at) (trigger fn)
- [`try_cast_double(text)`](#try_cast_double)

**Triggers**
- [Trigger inventory](#triggers)

**Scheduled jobs**
- [Cron jobs](#cron-jobs)

**Cross-cutting issues**
- [Function-level known issues](#function-level-known-issues)

---

## Core HAE pipeline

### `sync_hae_to_production()` 🟢

**Purpose.** The main sync function. Reads unprocessed rows from the
three staging tables, transforms them, and upserts into production
tables. Runs every 15 minutes via pg_cron.

**Signature:**
```
sync_hae_to_production() RETURNS text
```

**Returns:** A status string like
`Synced: 2 days metrics, 0 body, 1 workouts, 1 routes, 0 state_of_mind, 0 ecg, 0 hr_notifications, 1 sleep [tz=Europe/Madrid]`

**Hardcoded:** The function operates on a single hardcoded user UUID
(`a5dafd53-74d9-4492-9b60-944cfdf5d336`). All promoted rows land under
that user.

**Timezone-aware.** Reads the user's `timezone` from `user_preferences`
at the start of each run (falls back to `'UTC'` if missing). Uses it
for all `date AT TIME ZONE ...` bucketing, so an 00:30 Barcelona walk
doesn't land in yesterday's UTC bucket.

#### Processing order

The function processes data in this order. Each step only touches
rows where `processed_at IS NULL`.

1. **Metrics** (`staging_hae_metrics` → `health_metrics_daily`).
   Re-aggregates entire dates that have new unprocessed samples, then
   upserts one row per date. Covers: `step_count`, `active_energy`,
   `basal_energy_burned`, `resting_heart_rate`, `heart_rate_variability`,
   `apple_exercise_time`, `apple_stand_hour`. Step count filters out
   aggregate samples with `qty >= 500` to avoid double-counting.
2. **Body metrics** (same staging table → `health_metrics_body`).
   For each unprocessed date, picks the **latest** reading of
   `weight_body_mass`, `body_fat_percentage`, `body_mass_index` in the
   user's local day.
3. **Mark all metrics staging as processed.** This happens after both
   the metrics and body blocks, so they read the same snapshot.
4. **Workouts** (`staging_hae_workouts` → `exercise_events`). Full
   upsert keyed on `(user_id, workout_date, started_at)`. Units
   converted (kJ → kcal). Then marks workouts staging processed.
5. **Workout routes** (from newly-inserted `exercise_events.route_data`
   → `workout_routes`). Transforms HAE's long GPS keys (`latitude`,
   `longitude`, `altitude`, `timestamp`) to short keys (`lat`, `lng`,
   `alt`, `ts`) that the frontend Map component expects. Precomputes
   bounding box.
6. **State of mind** (`staging_hae_other` → `state_of_mind`).
   Deduplicated with `DISTINCT ON` on `(recorded_at, source_id)`.
7. **ECG** (`staging_hae_other` → `ecg_readings`). Deduplicated with
   `DISTINCT ON` on `recorded_at`.
8. **Heart rate notifications** (`staging_hae_other` →
   `heart_rate_notifications`).
9. **Mark all "other" staging as processed.**
10. **Sleep** (`staging_hae_metrics` → `sleep_events`). Only runs if
    there were unprocessed metrics. Deduplicated with `DISTINCT ON` on
    the local date. Wrist temperature is averaged across samples for
    the same date via a correlated subquery (not a JOIN — see "Sleep
    cannot affect row a second time" in the operations runbook for
    why).

#### Performance characteristics

- Each run is **O(new rows)**, not O(all staging), thanks to the
  `processed_at IS NULL` filter backed by partial indexes
  (`idx_staging_hae_metrics_unprocessed` etc).
- Typical run: <1 second when there's nothing new, 1–3 seconds with a
  normal HAE push (a few hundred new metric samples).
- Worst case observed: 8–10 seconds when force-reprocessing 17 days of
  staging data (~67k rows).
- Old version (pre-April 19, 2026) re-aggregated all staging every
  run. That's what caused manual invocations to time out.

#### ⚠️ Known issues

- **Hardcoded user_id.** Single-user only. Multi-user requires reading
  a per-row `user_id` from staging (which needs its own column first).
- **No error handling.** If an individual INSERT block fails, the
  function raises and rolls back the entire transaction; subsequent
  cron runs will retry. Generally fine because HAE pushes are
  idempotent, but a poison pill row could block progress indefinitely.

---

### `purge_old_staging_rows()` 🟢

**Purpose.** Deletes staging rows where `processed_at IS NOT NULL` and
`processed_at < NOW() - INTERVAL '30 days'`. Runs once a day at
03:00 UTC via pg_cron.

**Signature:**
```
purge_old_staging_rows() RETURNS text
```

**Returns:** A status string like
`Purged: 0 metrics, 0 workouts, 0 other (older than 30 days)`

**Retention:** 30 days. Tunable by editing the `INTERVAL '30 days'`
literal inside the function.

**Safety guarantees:**
- Only deletes rows the sync function has already promoted (where
  `processed_at IS NOT NULL`).
- Unprocessed rows are preserved regardless of age — safety net
  against accidentally losing data if sync ever stopped working for a
  long period.

---

## User lifecycle

### `create_user_preferences()` 🟢

**Type:** Trigger function.

**Purpose.** Auto-creates a `user_preferences` row when a new user
signs up. Intended to fire on `INSERT` into `auth.users`.

```sql
INSERT INTO user_preferences (user_id) VALUES (NEW.id);
```

Wrapped in an `EXCEPTION WHEN OTHERS` block that logs a warning and
swallows the error, so a failure here never breaks user signup.

**⚠️ Known issue:** The trigger attaching this function to
`auth.users` is not visible in the `public`-schema trigger inventory.
It lives in the `auth` schema. Future devs investigating user-signup
issues should check both schemas.

### `ensure_user_preferences(p_user_id uuid)` 🟡

**Purpose.** Idempotent "make sure this user has a preferences row"
call. Used by the app UI during onboarding / first login.

```sql
INSERT INTO user_preferences (user_id) VALUES (p_user_id)
ON CONFLICT (user_id) DO NOTHING;
```

Safe to call repeatedly.

---

## App feature helpers

These are thin wrappers over `INSERT` statements, invoked from the
frontend via `supabase.rpc(...)`. They use `auth.uid()` internally so
the caller doesn't need to supply it.

### `add_food_entry(...)` 🟡

Inserts a new row into `food_entries` with `user_id = auth.uid()`.
Returns the full inserted row.

**Parameters:** `p_date`, `p_meal`, `p_photo_url`, `p_voice_url`,
`p_food_labels`, `p_calories`, `p_macros`, `p_ai_raw`, `p_note`,
`p_journal`.

### `upsert_mood(p_date, p_mood, p_note, p_journal)` 🟡

Inserts or updates the mood entry for a given date. Unique key
`(user_id, date)` ensures one mood per day.

```sql
INSERT INTO mood_entries(...)
ON CONFLICT (user_id, date) DO UPDATE SET
  mood_score = excluded.mood_score,
  note = excluded.note,
  journal_mode = excluded.journal_mode,
  updated_at = now()
RETURNING *;
```

### `insert_knowledge_document(p_content, p_embedding, p_metadata)` 🟡

RAG helper. Accepts an embedding as `jsonb` (array of floats) and
casts to pgvector `vector` type before insert.

---

## Aggregates & queries

### `get_activity_aggregates(p_user_id, p_period, p_start_date, p_end_date, p_limit)` 🟢

**Purpose.** Returns per-period aggregated activity stats, used by the
frontend's weekly/monthly charts.

**Parameters:**
- `p_user_id` — target user
- `p_period` — a `date_trunc` unit: `'week'`, `'month'`, etc.
- `p_start_date` / `p_end_date` — inclusive range
- `p_limit` — cap on number of periods returned (most recent first)

**Returns TABLE:** `period`, `steps`, `active_energy_kcal`,
`exercise_time_minutes`, `resting_heart_rate`, `hrv`,
`stand_time_minutes`, `distance_km`, `workout_count`.

Joins `health_metrics_daily` with a per-date `exercise_events`
aggregate for distance and workout count. Returns ordered DESC.

### `calculate_weekly_metrics(user_uuid, start_date, end_date)` 🟢

Returns a `jsonb` summary for a date range:
```json
{
  "avgMood": 3.4,
  "kcalTotal": 14250,
  "topFoods": ["eggs", "chicken", "rice", "coffee", "avocado"],
  "moodEntries": 7,
  "foodEntries": 19
}
```

Excludes rows with `journal_mode = true` from calorie/food counts.
Used by the AI insights feature to build weekly summaries.

### `get_latest_health_date(p_user uuid)` 🟢

Returns the most recent `date` in `health_metrics_daily` for that
user. Used by UI to show "last synced" status.

### `get_latest_exercise_date(p_user uuid)` 🔴

**Broken.** Queries `exercise_daily`, which is the deprecated,
permanently-empty table. Always returns NULL. Should be dropped or
updated to read from `exercise_events` (`SELECT max(workout_date)
FROM exercise_events WHERE user_id = p_user`).

---

## Streaks

Pulse has **two different implementations** of streak calculation —
they should be consolidated. See [known issues](#function-level-known-issues).

### `update_streaks_on_entry()` 🟢

**Type:** Trigger function.

**Attached to:** `food_entries` and `mood_entries` via
`AFTER INSERT` triggers (`trg_update_streaks_food` and
`trg_update_streaks_mood`).

**Logic:** Incremental — on each new entry:
- If `last_entry_date = NEW.date` → same-day entry, current_streak unchanged
- If `last_entry_date = NEW.date - 1 day` → consecutive, current_streak + 1
- Otherwise → streak resets to 1

Updates `longest_streak` with `GREATEST`.

**⚠️ Edge cases the incremental logic doesn't handle:**
- Out-of-order inserts (backfilling an older date)
- Deletions (decrements won't happen; streak silently becomes incorrect)
- Missing days discovered retroactively

### `recalc_streaks(p_user_id uuid)` 🟢

**Purpose.** Recomputes streaks from scratch by walking backwards from
today.

**Algorithm:**
```
d := today
cur := 0
while exists(mood_entry on d) OR exists(food_entry on d):
    cur += 1
    d -= 1 day
upsert streaks(user_id = p_user_id, current_streak = cur, longest_streak = max(...))
```

Slower but always correct. Appropriate fallback after deletions or
backfills.

**Not currently wired to anything automatic** — must be called
manually.

---

## Small utilities

### `touch_updated_at()` 🟢

**Type:** Trigger function.

**Purpose.** Sets `NEW.updated_at := now()`. Attached as `BEFORE
UPDATE` trigger on `food_entries`, `mood_entries`, `insights`, and
`streaks`.

### `try_cast_double(inp text)` 🟡

Safely casts text to `double precision`, returning NULL on parse
failure. Used for cleaning dirty imported data; probably a leftover
from the HealthFit/Google Sheets backfill. Not critical to runtime
pipeline.

---

## Triggers

All triggers live on `public`-schema tables. (One additional trigger
likely exists on `auth.users` calling `create_user_preferences()` — see
that function's entry.)

| Table | Trigger | Timing | Event | Calls | Purpose |
|---|---|---|---|---|---|
| `food_entries` | `trg_touch_food` | BEFORE | UPDATE | `touch_updated_at()` | Maintain `updated_at` |
| `food_entries` | `trg_update_streaks_food` | AFTER | INSERT | `update_streaks_on_entry()` | Increment streak |
| `mood_entries` | `trg_touch_mood` | BEFORE | UPDATE | `touch_updated_at()` | Maintain `updated_at` |
| `mood_entries` | `trg_update_streaks_mood` | AFTER | INSERT | `update_streaks_on_entry()` | Increment streak |
| `insights` | `trg_touch_ins` | BEFORE | UPDATE | `touch_updated_at()` | Maintain `updated_at` |
| `streaks` | `trg_touch_str` | BEFORE | UPDATE | `touch_updated_at()` | Maintain `updated_at` |

---

## Cron jobs

Jobs are scheduled via `pg_cron`. Inspect with:

```sql
SELECT jobname, schedule, command, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

To unschedule / reschedule a job, use the
`cron.unschedule('name')` and `cron.schedule('name', '*/...', 'SQL')`
functions — these don't require the elevated privileges needed to
`UPDATE cron.job` directly.

| jobid | jobname | schedule | Command | Purpose |
|---|---|---|---|---|
| 5 | `sync-hae-to-production` | `*/15 * * * *` | `SELECT sync_hae_to_production();` | Promote new staging rows to production |
| 6 | `purge-old-staging-rows` | `0 3 * * *` | `SELECT purge_old_staging_rows();` | Clean up staging rows older than 30 days |

Cron runs are logged in `cron.job_run_details` — useful for
debugging. Job_pid, status, return_message, and duration are captured.

### Scheduling history

- **April 10, 2026** — `sync-hae-to-production` initially scheduled as
  jobid 4 (by previous setup). Unscheduled and re-created as jobid 5
  during the April 19 function-rewrite session.
- **April 19, 2026** — `purge-old-staging-rows` created as jobid 6.

---

## Function-level known issues

### 1. Duplicate streak implementations

`update_streaks_on_entry` (trigger, incremental) and
`recalc_streaks` (manual, from-scratch) both exist. The trigger runs
automatically but has edge-case bugs (deletions, out-of-order inserts).
The manual recalc is correct but not wired up.

**Recommendation:** Choose one. Either (a) wire `recalc_streaks` to
a low-frequency cron and drop the trigger, or (b) fix the trigger's
edge cases and drop `recalc_streaks`.

### 2. `get_latest_exercise_date` returns NULL

Reads from the empty `exercise_daily` table. Callers will get NULL.
If any frontend code relies on this, it's silently broken.

**Fix:** point it at `exercise_events` and use `max(workout_date)`.

### 3. `sync_hae_to_production` hardcodes the user UUID

See the detailed note in that function's entry. Blocker for
multi-user launch.

### 4. No error telemetry

Neither the sync function nor the purge function logs to a table.
The only visibility is `cron.job_run_details` and the returned
status string. A recent failure might be hard to detect without
active monitoring.

**Suggested improvement:** have each function `INSERT` into a
`sync_audit_log` table with start/end/status/stats. The legacy
`sync_log` table could be repurposed for this.

### 5. Schema drift

The function definitions in the live database are the source of
truth. The repo's migration files (`/supabase/migrations/`) may be
out of sync:
- `sync_hae_to_production` has been rewritten repeatedly in the SQL
  editor (body metrics block added April 19, 2026; timezone support
  added April 19, 2026; sleep DISTINCT ON fix April 19, 2026).
- `purge_old_staging_rows` created April 19, 2026 directly in the
  SQL editor.

**Fix:** export the current function definitions as a new migration
file so a fresh clone of the repo reproduces the live DB.
