# Pulse — Supabase Improvement Backlog

_Created: 2026-04-19_

A prioritized, ordered list of every issue, improvement, and cleanup
item identified during the documentation audit. Ordered by **a combination
of priority and efficient sequencing** — doing things in this order means
each task's cleanup work doesn't need to be redone by a later task.

**Legend**

- 🔒 **Security** — credential/auth/data-exposure issue
- 🐛 **Bug** — something is currently silently wrong
- 🚧 **Multi-user blocker** — blocks multi-user launch
- 🧹 **Tech debt** — cleanup, no user-visible impact
- ✨ **Improvement** — new capability or quality-of-life
- ⏳ **Deferred** — intentional, do after other work

Each task carries an estimated effort:
- **S** — small (under 30 min)
- **M** — medium (1-2 hours)
- **L** — large (half-day+)

---

## Phase 1 — Security (do first)

### 1. Remove API key logging from `ingest-hae`  🔒 S

The Edge Function logs the full `HAE_API_KEY` and received token to
Supabase Edge Function logs on every request. Anyone with log access
can read the token. In `supabase/functions/ingest-hae/index.ts`, delete
these three lines:

```javascript
console.log("apiKey from env:", apiKey ? `"${apiKey}" (len=${apiKey.length})` : "NOT SET");
console.log("token from header:", `"${token}" (len=${token.length})`);
console.log("match:", token === apiKey);
```

After removing, redeploy the function. Also consider rotating the
`HAE_API_KEY` since it's been logged for an unknown period — see
runbook § Rotating `HAE_API_KEY`.

### 2. Rotate `HAE_API_KEY`  🔒 S

Since the key has been in logs, rotate it. Steps:
1. Generate new key (e.g. `openssl rand -hex 32`)
2. Update `HAE_API_KEY` secret in Supabase Dashboard
3. Update every HAE automation's Authorization header on the iPhone
4. Verify each automation returns 200 after the change

**Depends on:** Task 1 (don't rotate until the new key won't also be
logged). 

### 3. Remove anon-role SELECT access on user data tables  🔒 M

Four tables have RLS policies granting the anon role unrestricted
SELECT access (`predicate: true`), making user data world-readable via
the anon key:

- `food_entries.Allow anon read`
- `food_entries.anon_can_read_food_entries`
- `mood_entries.anon_can_read_mood_entries`
- `insights.anon_can_read_insights`
- `streaks.anon_can_read_streaks`

Drop these policies:

```sql
DROP POLICY "Allow anon read" ON food_entries;
DROP POLICY "anon_can_read_food_entries" ON food_entries;
DROP POLICY "anon_can_read_mood_entries" ON mood_entries;
DROP POLICY "anon_can_read_insights" ON insights;
DROP POLICY "anon_can_read_streaks" ON streaks;
```

Test after each drop by trying to read from the anon client — the
authenticated policies should still serve logged-in users.

---

## Phase 2 — Data integrity bugs (fix silently-wrong things)

### 4. Fix `get_latest_exercise_date` function  🐛 S

Currently reads from the empty `exercise_daily` table and always
returns NULL. Replace with:

```sql
CREATE OR REPLACE FUNCTION get_latest_exercise_date(p_user uuid)
RETURNS date
LANGUAGE sql
AS $$
  SELECT MAX(workout_date)
  FROM exercise_events
  WHERE user_id = p_user;
$$;
```

### 5. Consolidate streak implementations  🐛 M

Two implementations exist:
- `update_streaks_on_entry` (trigger, incremental, buggy on deletions/backfills)
- `recalc_streaks` (manual, correct, not wired up)

**Recommendation:** wire `recalc_streaks` to run nightly via cron, drop
the trigger-based one.

```sql
-- Drop the triggers
DROP TRIGGER trg_update_streaks_food ON food_entries;
DROP TRIGGER trg_update_streaks_mood ON mood_entries;
-- Function can stay in case you want to restore it

-- Schedule the correct recalc
SELECT cron.schedule(
  'recalc-streaks-nightly',
  '0 4 * * *',  -- 04:00 UTC
  $$SELECT recalc_streaks(user_id) FROM user_preferences;$$
);
```

Alternative: fix the trigger's edge cases (deletions, out-of-order
inserts) and drop `recalc_streaks`. Either is fine — pick one.

### 6. Backfill `sleep_events` migration file  🐛 S

The table was created via the Supabase SQL Editor and isn't in any
migration file. A fresh clone of the repo would not reproduce this
table. Export the current schema definition and add it to
`supabase/migrations/` with an appropriate timestamp.

```sql
-- Get the CREATE TABLE statement
SELECT pg_get_tabledef('public.sleep_events');
```

Or use `pg_dump --schema-only --table=public.sleep_events`.

### 7. Backfill current function definitions to migration files  🐛 S

Both `sync_hae_to_production` and `purge_old_staging_rows` have been
rewritten multiple times in the SQL Editor. The repo migrations don't
reflect the live definitions. Export current versions:

```sql
SELECT pg_get_functiondef('sync_hae_to_production()'::regprocedure);
SELECT pg_get_functiondef('purge_old_staging_rows()'::regprocedure);
```

Paste each into a new migration file so `supabase db reset` reproduces
the live behavior.

---

## Phase 3 — Multi-user blockers (group for one coordinated effort)

These should be tackled together as a single migration because each
one touches the same code paths. Doing them piecemeal means each intermediate
state is partially broken.

### 8. Introduce per-user HAE tokens table  🚧 L

Replace the shared `HAE_API_KEY` with a table that maps tokens to
user IDs.

```sql
CREATE TABLE hae_ingest_tokens (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  label       TEXT
);

CREATE INDEX idx_hae_tokens_active 
  ON hae_ingest_tokens(token) WHERE revoked_at IS NULL;
```

Backfill: insert the current `HAE_API_KEY` as a row mapped to the test
user (temporary, to preserve current behavior during migration).

### 9. Add `user_id` to staging tables  🚧 M

**Depends on:** Task 8.

```sql
ALTER TABLE staging_hae_metrics  ADD COLUMN user_id UUID;
ALTER TABLE staging_hae_workouts ADD COLUMN user_id UUID;
ALTER TABLE staging_hae_other    ADD COLUMN user_id UUID;

-- Backfill existing rows to the test user
UPDATE staging_hae_metrics  SET user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336' WHERE user_id IS NULL;
UPDATE staging_hae_workouts SET user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336' WHERE user_id IS NULL;
UPDATE staging_hae_other    SET user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336' WHERE user_id IS NULL;

-- Make NOT NULL once backfilled
ALTER TABLE staging_hae_metrics  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE staging_hae_workouts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE staging_hae_other    ALTER COLUMN user_id SET NOT NULL;
```

### 10. Update `ingest-hae` Edge Function to use per-user tokens  🚧 M

**Depends on:** Tasks 8 and 9.

- Read `Authorization: Bearer <token>` as before
- Look up `user_id` from `hae_ingest_tokens` where
  `token = X AND revoked_at IS NULL`
- Return 401 if not found
- Include `user_id` in every staging row insert
- Update `last_used_at` on each successful push (debouncing welcome)

Also remove/loosen the fragile `UNIQUE (metric_name, date)` on
`staging_hae_metrics` since it wasn't user-scoped — either drop it
entirely or replace with `(user_id, metric_name, date)`.

### 11. Rewrite `sync_hae_to_production()` for multi-user  🚧 L

**Depends on:** Tasks 8-10.

Key changes:
- Remove the hardcoded `v_user_id`
- Find distinct `user_id` values in unprocessed staging
- Process each user's data using that user's own `timezone` from
  `user_preferences`
- Return per-user counts in the status string

Test by running with two test users before rolling out.

### 12. Remove `UNIQUE (date)` on `health_metrics_daily`  🚧 S

**Depends on:** Task 11 (after the sync function can produce
per-user rows correctly).

```sql
ALTER TABLE health_metrics_daily
  DROP CONSTRAINT health_metrics_daily_unique_date;
```

The `UNIQUE (user_id, date)` constraint(s) are already in place, so
this removes a dormant single-user bottleneck.

### 13. Remove hardcoded `user_id` defaults on production tables  🚧 S

**Depends on:** Task 11.

Tables with `user_id DEFAULT 'a5dafd53-...'`:
- `ecg_readings`
- `sleep_events`
- `state_of_mind`
- `heart_rate_notifications`
- `workout_routes`

```sql
ALTER TABLE ecg_readings             ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE sleep_events             ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE state_of_mind            ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE heart_rate_notifications ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE workout_routes           ALTER COLUMN user_id DROP DEFAULT;
```

---

## Phase 4 — RLS / policy cleanup

### 14. Resolve the two-test-UUID schizophrenia  🧹 M

Two different "test user" UUIDs are in use:
- `a5dafd53-...` in the sync function and production table defaults
- `97c22f4c-...` in legacy RLS policies for `food_entries`, `mood_entries`, `insights`, `streaks`

Drop all policies referencing `97c22f4c-...`:

```sql
DROP POLICY "allow_test_user_food_entries" ON food_entries;
DROP POLICY "allow_test_user_insert" ON food_entries;
DROP POLICY "allow_test_user_insert_food_entries" ON food_entries;
DROP POLICY "test_user_can_insert_food_entries" ON food_entries;
DROP POLICY "allow_test_user_mood_entries" ON mood_entries;
DROP POLICY "test_user_can_insert_mood_entries" ON mood_entries;
DROP POLICY "allow_test_user_insights" ON insights;
DROP POLICY "test_user_can_insert_insights" ON insights;
DROP POLICY "allow_test_user_streaks" ON streaks;
DROP POLICY "allow_test_user_insert_streaks" ON streaks;
DROP POLICY "anon_can_insert_streaks" ON streaks;
DROP POLICY "anon_can_reference_streaks" ON streaks;
DROP POLICY "test_user_can_insert_streaks" ON streaks;
```

Verify the app still works after each drop — the "proper" RLS
policies (`*_own` patterns) should cover all legitimate access.

### 15. Deduplicate RLS policies on `food_entries` / `mood_entries`  🧹 S

After Task 14, both tables have duplicate pairs:
- `Users can view/insert/update their own food entries` (older naming)
- `food_select_own` / `food_insert_own` / `food_update_own` / `food_delete_own` (newer naming)

Drop the older naming pattern; keep the `*_own` set which has complete
coverage including DELETE.

---

## Phase 5 — Column & index cleanup

Do this AFTER RLS cleanup because dropping columns is harder if
policies reference them.

### 16. Audit and drop legacy columns on `health_metrics_daily`  🧹 M

These columns are never written by the HAE sync and may not be read
anywhere:
- `exercise_minutes` (replaced by `exercise_time_minutes`)
- `total_energy_kcal`
- `average_heart_rate`
- `distance_km`

Also `vo2max` — typed but never written.

Before dropping, grep the frontend codebase for each column name. If
referenced, either update the frontend or keep the column.

### 17. Audit and drop legacy columns on `exercise_events`  🧹 L

Many legacy columns from the HealthFit/Google Sheets pipeline:
- `avg_hr`, `min_hr`, `max_hr` (replaced by `avg_heart_rate`/etc)
- `total_minutes`, `move_minutes` (replaced by `duration_seconds`)
- `total_energy_kcal`
- `sheet_row_number`
- `hr_zone_type`, `hrz0_seconds` … `hrz5_seconds`
- `trimp`, `rpe`

Same audit-before-drop approach as Task 16.

Also drop the `UNIQUE (user_id, sheet_row_number)` constraint — it was
designed for Google Sheets data, meaningless for HAE.

### 18. Drop duplicate column on `keep_alive`  🧹 S

Both `pinged_at` and `timestamp` exist and both default to `NOW()`.
Pick one (`pinged_at` is the clearer name), update any callers, drop
the other.

### 19. Consolidate redundant indexes  🧹 M

Worst offenders:
- `health_metrics_daily` — 5 indexes on `(user_id, date)`
- `exercise_events` — 4 overlapping on `user_id + date/started_at`
- `food_entries`, `mood_entries` — 3 each on `(user_id, date)`

Keep one well-named index per unique column combination, drop the
rest. Each removal reduces write amplification on that table.

```sql
-- Example: on health_metrics_daily, keep ONE of these and drop the others
-- DROP INDEX health_metrics_daily_user_date;
-- DROP INDEX health_metrics_daily_user_date_key;
-- DROP INDEX uniq_health_daily_user_date;
-- DROP INDEX ux_health_metrics_daily_user_date;
```

---

## Phase 6 — Deprecations

### 20. Drop `exercise_daily` table and its helper function  🧹 S

**Depends on:** Task 4 (fixing `get_latest_exercise_date` so it no
longer references this table).

```sql
DROP FUNCTION IF EXISTS get_latest_exercise_date(uuid);
-- Then if you've already rebuilt it in Task 4 to read from
-- exercise_events, create it fresh and THEN drop exercise_daily
DROP TABLE exercise_daily;
```

### 21. Decide fate of `sync_log` table  🧹 S

Written only by the old HealthFit/n8n pipeline, never by HAE sync.
Options:
- Drop it entirely
- Repurpose as a general audit log for any scheduled job (rename
  columns, use for new purpose)

See also Task 24 (error telemetry) — `sync_log` could become that table.

---

## Phase 7 — Observability & ergonomics

### 22. Add operational monitoring: stale staging alert  ✨ M

Add a scheduled check that alerts if HAE hasn't pushed in > 30
minutes during awake hours, catching iOS suspension faster. Could be
a simple cron that sends an email/notification when:

```sql
SELECT NOW() - MAX(received_at) AS staleness
FROM staging_hae_metrics;
```

…exceeds 30 minutes between e.g. 07:00 and 23:00 local time.

### 23. Log sync runs to a dedicated audit table  ✨ M

Currently the sync function just returns a string. Insert that status
(plus timestamps and row counts) into an audit table so you can
query sync history beyond what `cron.job_run_details` captures.

This is where the repurposed `sync_log` could fit (Task 21).

### 24. Remove or refine `staging_hae_metrics.UNIQUE (metric_name, date)`  🧹 S

The unique constraint prevents legitimate re-pushes with the same
timestamp. Either drop it or change it to be user-scoped once
multi-user work is in place (Task 9).

### 25. Handle partial failures in `ingest-hae`  ✨ M

Currently individual row insert errors are swallowed, and the
function returns 200 OK. This means HAE thinks everything worked and
doesn't retry.

Options:
- Track errors, return 500 if ANY row failed (safer, HAE retries)
- Return structured error info with per-row results (207 Multi-Status)

Second is cleaner but HAE probably doesn't parse it. First is simpler.

### 26. Add payload size limit to `ingest-hae`  ✨ S

Reject requests with body > N MB (say 50 MB) with a clear
`413 Payload Too Large` response before attempting to parse. Prevents
memory OOMs on accidental huge backfills.

---

## Phase 8 — Future enhancements (no specific fix, just capabilities)

### 27. Near-realtime sync via pg_notify  ✨ L

Currently there's up to 15 minutes of latency between HAE push and
data appearing in production. A cleaner approach:
- `ingest-hae` sends `pg_notify('hae_ingest', user_id)` after writing to staging
- A small listener calls `sync_hae_to_production(user_id)` on receipt
- Remove the 15-minute cron (keep as fallback)

### 28. Extend sync function to handle `vo2_max`  ✨ S

HAE sends `vo2_max` samples (we saw them in the staging data dump).
The sync function doesn't aggregate them into `health_metrics_daily.vo2max`.
Add an `AVG(qty) FILTER (WHERE metric_name = 'vo2_max')` line to the
metrics INSERT.

### 29. Extend sync function for more body-related metrics  ✨ S

HAE also sends `lean_body_mass` and `height`. Currently unused.
Consider adding:
- `height_m` column on `health_metrics_body` (or a separate
  `health_profile` table for stable values)
- `lean_body_mass_kg` column

### 30. Consolidate staging UNIQUE constraints  🧹 S

The `staging_hae_workouts.UNIQUE (workout_name, start_time)` is also
fragile (not user-scoped). Once multi-user work is in place, update
to `(user_id, workout_name, start_time)`.

---

## Quick-win bundle (if you have 2 hours and want max cleanup)

Pick these in order for the biggest ratio of impact-to-effort:

1. Task 1 (remove API key logging) — 🔒 P0
2. Task 2 (rotate key) — 🔒 P0
3. Task 4 (fix `get_latest_exercise_date`) — 🐛 quick fix
4. Task 6 (backfill `sleep_events` migration) — 🐛 closes schema drift
5. Task 7 (backfill current function definitions) — 🐛 closes schema drift
6. Task 3 (remove anon SELECT policies) — 🔒 data exposure

Everything else can wait for a longer session when you have time to
test carefully.

---

## Multi-user launch bundle (if you're ready for prime time)

These must all ship together — cherry-picking causes partial breakage:

- Task 8 (per-user tokens table)
- Task 9 (add user_id to staging)
- Task 10 (update Edge Function)
- Task 11 (rewrite sync function)
- Task 12 (drop UNIQUE date constraint)
- Task 13 (drop hardcoded user_id defaults)
- Task 14 (resolve two-test-UUID)
- Task 24 (remove/refine staging unique)
- Task 30 (consolidate staging unique constraints)

Budget: probably a full day to design, a full day to implement, half
a day to test.
