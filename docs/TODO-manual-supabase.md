# Pulse — Manual Supabase Backlog

_Created: 2026-04-19_
_For: work you run manually in the Supabase SQL Editor (or Dashboard)._

This file is for things **only you can do safely**: SQL schema changes,
RLS policy cleanup, cron management, and dashboard-only settings. Each
task is step-by-step with a **verification query** so you can confirm
the change landed correctly before moving on.

The companion file `TODO-agent-repo.md` covers everything in the code
repo (Next.js, Edge Functions, env vars, CI). Items are split so the
two files can be worked in parallel where it's safe.

## How to use this file

1. Work top-to-bottom within a phase — later steps assume earlier ones
   are done.
2. Run the **DO** SQL first, then the **VERIFY** SQL. If VERIFY doesn't
   return what's described, **stop** and investigate before moving on.
3. Checkboxes are for your own tracking; tick them off as you go.
4. When in doubt, run the [baseline health check](05-operations-runbook.md#baseline-health-check)
   from the runbook to confirm the pipeline still works end-to-end.

## Legend

- 🔒 Security  🐛 Bug  🚧 Multi-user blocker  🧹 Tech debt  ✨ Improvement
- **S** under 30 min · **M** 1–2 hours · **L** half-day+

---

## Phase A — Security fixes in the database (do first)

### A1. Enable RLS on `sync_log`  🔒 S

Right now `sync_log` has no RLS enabled AND the initial migration
granted `ALL` to `anon` and `authenticated`. It's readable and
writable by anyone with the anon key.

**DO:**

```sql
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access, which is what we want
-- (the old sync-healthfit edge function used service role).
```

**VERIFY:**

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'sync_log';
-- Expect: relrowsecurity = true
```

```sql
-- And no policies exist (correct — service-role bypasses RLS):
SELECT policyname FROM pg_policies WHERE tablename = 'sync_log';
-- Expect: 0 rows
```

☐ Done

---

### A2. Add `auth.uid()` guard to `calculate_weekly_metrics`  🔒 S

The function is `SECURITY DEFINER` and takes a `user_uuid` parameter
but doesn't check that the caller owns that UUID. Any authenticated
user can read any other user's aggregates by passing a different
UUID.

**DO:**

```sql
CREATE OR REPLACE FUNCTION calculate_weekly_metrics(
  user_uuid uuid,
  start_date date,
  end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- NEW: reject calls asking for someone else's data
  IF auth.uid() IS DISTINCT FROM user_uuid THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- (keep the existing function body below — just paste the current
  -- SELECT that builds `result`, e.g. avgMood/kcalTotal/topFoods/etc)
  -- ...
  RETURN result;
END;
$$;
```

> **Before you run it:** grab the current function body first so you
> don't lose the query logic:
>
> ```sql
> SELECT pg_get_functiondef('calculate_weekly_metrics(uuid,date,date)'::regprocedure);
> ```

**VERIFY:**

```sql
-- Function source should now contain the auth.uid() check
SELECT prosrc
FROM pg_proc
WHERE proname = 'calculate_weekly_metrics';
-- Expect: 'auth.uid() IS DISTINCT FROM user_uuid' appears in the body
```

☐ Done

---

### A3. Revoke over-broad grants to `anon` / `authenticated`  🔒 M

The initial migration did `GRANT ALL ON ALL TABLES ... TO anon,
authenticated`. This makes RLS the **only** defense — any new table
created without RLS (like `sync_log` was) is wide open.

**DO (in this exact order):**

```sql
-- 1. Revoke the blanket grants
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- 2. Grant back only what the app actually needs, per-role.
--    Adjust this list to match tables the frontend reads/writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  food_entries, mood_entries, insights, streaks, user_preferences
  TO authenticated;

GRANT SELECT ON
  health_metrics_daily, health_metrics_body, exercise_events,
  workout_routes, sleep_events, state_of_mind, ecg_readings,
  heart_rate_notifications
  TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 3. anon gets nothing by default. If anything breaks, we add grants
--    back narrowly. `keep_alive` is the one exception — it needs
--    anon INSERT for pinging:
GRANT INSERT ON keep_alive TO anon;
```

**VERIFY:**

```sql
-- See who has what on a sample protected table. authenticated should
-- have the listed privileges; anon should have nothing.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'food_entries'
ORDER BY grantee, privilege_type;
```

```sql
-- Confirm the app still works! From the frontend, try:
-- - Log in
-- - View dashboard (reads health_metrics_daily, exercise_events)
-- - Log a mood entry (writes mood_entries)
-- - Log a food entry (writes food_entries)
-- If any of these 403s, the GRANT above missed a table. Add it
-- and retry.
```

> **Rollback if something breaks:** `GRANT ALL ON ALL TABLES IN
> SCHEMA public TO anon, authenticated;` restores the old (bad)
> behavior. Do this only long enough to ship the fix.

☐ Done

---

### A4. Remove anon-role SELECT access on user-data tables  🔒 M

Several tables have legacy RLS policies granting the anon role
unrestricted SELECT (`predicate: true`). After A3 they're largely
neutered, but the policies should still go.

**DO:**

```sql
DROP POLICY IF EXISTS "Allow anon read"             ON food_entries;
DROP POLICY IF EXISTS "anon_can_read_food_entries"  ON food_entries;
DROP POLICY IF EXISTS "anon_can_read_mood_entries"  ON mood_entries;
DROP POLICY IF EXISTS "anon_can_read_insights"      ON insights;
DROP POLICY IF EXISTS "anon_can_read_streaks"       ON streaks;
```

**VERIFY:**

```sql
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('food_entries','mood_entries','insights','streaks')
  AND 'anon' = ANY(roles)
ORDER BY tablename, policyname;
-- Expect: 0 rows (no anon-role policies remain)
```

☐ Done

---

### A5. Drop legacy "test-user" RLS policies  🔒 M

Policies referencing the second test-user UUID
(`97c22f4c-cbd3-43dc-8227-e7022cf990f3`) — different from the one
the sync function uses.

**DO:**

```sql
-- food_entries
DROP POLICY IF EXISTS "allow_test_user_food_entries"          ON food_entries;
DROP POLICY IF EXISTS "allow_test_user_insert"                ON food_entries;
DROP POLICY IF EXISTS "allow_test_user_insert_food_entries"   ON food_entries;
DROP POLICY IF EXISTS "test_user_can_insert_food_entries"     ON food_entries;

-- mood_entries
DROP POLICY IF EXISTS "allow_test_user_mood_entries"          ON mood_entries;
DROP POLICY IF EXISTS "test_user_can_insert_mood_entries"     ON mood_entries;

-- insights
DROP POLICY IF EXISTS "allow_test_user_insights"              ON insights;
DROP POLICY IF EXISTS "test_user_can_insert_insights"         ON insights;

-- streaks
DROP POLICY IF EXISTS "allow_test_user_streaks"               ON streaks;
DROP POLICY IF EXISTS "allow_test_user_insert_streaks"        ON streaks;
DROP POLICY IF EXISTS "anon_can_insert_streaks"               ON streaks;
DROP POLICY IF EXISTS "anon_can_reference_streaks"            ON streaks;
DROP POLICY IF EXISTS "test_user_can_insert_streaks"          ON streaks;
```

**VERIFY:**

```sql
-- No surviving references to the stale UUID:
SELECT tablename, policyname, qual
FROM pg_policies
WHERE qual ILIKE '%97c22f4c%' OR with_check ILIKE '%97c22f4c%';
-- Expect: 0 rows
```

```sql
-- Sanity check: the proper *_own policies are still there:
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('food_entries','mood_entries','insights','streaks')
ORDER BY tablename, policyname;
-- Expect: *_own policies present for each table
```

☐ Done

---

### A6. Deduplicate RLS policies on `food_entries` / `mood_entries`  🧹 S

After A4/A5 both tables still have two overlapping sets of
owner-scoped policies: the older "Users can … their own …" and the
newer `*_own` set.

**DO:**

```sql
DROP POLICY IF EXISTS "Users can view their own food entries"    ON food_entries;
DROP POLICY IF EXISTS "Users can insert their own food entries"  ON food_entries;
DROP POLICY IF EXISTS "Users can update their own food entries"  ON food_entries;
-- (add any equivalents you find for mood_entries/insights/streaks)
```

Keep the `*_own` set — it has complete coverage including DELETE.

**VERIFY:**

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'food_entries'
ORDER BY policyname;
-- Expect: only food_select_own / food_insert_own / food_update_own
-- / food_delete_own
```

☐ Done

---

## Phase B — Data integrity bugs

### B1. Fix `get_latest_exercise_date`  🐛 S

Currently reads from the empty `exercise_daily` table and always
returns NULL.

**DO:**

```sql
CREATE OR REPLACE FUNCTION get_latest_exercise_date(p_user uuid)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT MAX(workout_date)
  FROM exercise_events
  WHERE user_id = p_user;
$$;
```

**VERIFY:**

```sql
SELECT get_latest_exercise_date('a5dafd53-74d9-4492-9b60-944cfdf5d336');
-- Expect: a recent date, not NULL
```

☐ Done

---

### B2. Consolidate streak implementations  🐛 M

Two implementations coexist: the buggy trigger-based incremental one
and the correct manual `recalc_streaks`. Wire the correct one to a
nightly cron, drop the triggers.

**DO:**

```sql
-- 1. Drop the triggers (leave the function in place as a fallback)
DROP TRIGGER IF EXISTS trg_update_streaks_food ON food_entries;
DROP TRIGGER IF EXISTS trg_update_streaks_mood ON mood_entries;

-- 2. Schedule the from-scratch recalc nightly
SELECT cron.schedule(
  'recalc-streaks-nightly',
  '0 4 * * *',  -- 04:00 UTC
  $$SELECT recalc_streaks(user_id) FROM user_preferences;$$
);

-- 3. Run it once now so streaks are correct immediately
SELECT recalc_streaks(user_id) FROM user_preferences;
```

**VERIFY:**

```sql
-- Triggers are gone
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_update_streaks_food','trg_update_streaks_mood');
-- Expect: 0 rows

-- Cron job exists
SELECT jobname, schedule, active FROM cron.job
WHERE jobname = 'recalc-streaks-nightly';
-- Expect: 1 row, active = true

-- Streak data looks sane
SELECT user_id, current_streak, longest_streak, last_entry_date, updated_at
FROM streaks
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336';
-- Expect: updated_at = today, current_streak reflects reality
```

☐ Done

---

## Phase C — Multi-user foundation

Ship C1–C6 **together** as one coordinated change. Intermediate states
are partially broken. The companion repo work (Edge Function rewrite)
is in `TODO-agent-repo.md` task R-C1 — do the agent task **between**
C3 and C4 here.

### C1. Create `hae_ingest_tokens` table  🚧 M

**DO:**

```sql
CREATE TABLE hae_ingest_tokens (
  token         text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  label         text
);

CREATE INDEX idx_hae_tokens_active
  ON hae_ingest_tokens(token) WHERE revoked_at IS NULL;

ALTER TABLE hae_ingest_tokens ENABLE ROW LEVEL SECURITY;

-- Users can see and manage their own tokens (for a future UI);
-- the edge function uses service-role which bypasses RLS.
CREATE POLICY "Users see own hae tokens"
  ON hae_ingest_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**DO (seed the current token — replace placeholder with a NEW key):**

```sql
-- Generate a fresh token first (e.g. `openssl rand -hex 32`).
-- DO NOT reuse the old HAE_API_KEY that's been in logs.
INSERT INTO hae_ingest_tokens (token, user_id, label)
VALUES (
  '<PASTE_NEW_TOKEN_HERE>',
  'a5dafd53-74d9-4492-9b60-944cfdf5d336',
  'Primary iPhone (Ben)'
);
```

**VERIFY:**

```sql
SELECT user_id, label, created_at, revoked_at
FROM hae_ingest_tokens;
-- Expect: 1 row, revoked_at NULL
```

☐ Done

---

### C2. Add `user_id` to staging tables  🚧 M

**DO:**

```sql
ALTER TABLE staging_hae_metrics  ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE staging_hae_workouts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE staging_hae_other    ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill existing rows to the hardcoded test user
UPDATE staging_hae_metrics  SET user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336' WHERE user_id IS NULL;
UPDATE staging_hae_workouts SET user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336' WHERE user_id IS NULL;
UPDATE staging_hae_other    SET user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336' WHERE user_id IS NULL;

-- Lock it in
ALTER TABLE staging_hae_metrics  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE staging_hae_workouts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE staging_hae_other    ALTER COLUMN user_id SET NOT NULL;
```

**VERIFY:**

```sql
SELECT 'metrics'  AS t, COUNT(*) FILTER (WHERE user_id IS NULL) AS null_users FROM staging_hae_metrics
UNION ALL SELECT 'workouts', COUNT(*) FILTER (WHERE user_id IS NULL) FROM staging_hae_workouts
UNION ALL SELECT 'other',    COUNT(*) FILTER (WHERE user_id IS NULL) FROM staging_hae_other;
-- Expect: 0 in every row
```

☐ Done

---

### C3. Refine fragile staging uniques  🚧 S

The `UNIQUE (metric_name, date)` and `UNIQUE (workout_name, start_time)`
constraints don't include `user_id` — they'd reject legitimate rows
the moment two users share a timestamp.

**DO:**

```sql
-- Replace metric uniqueness with per-user form
ALTER TABLE staging_hae_metrics DROP CONSTRAINT IF EXISTS staging_hae_metrics_metric_name_date_key;
ALTER TABLE staging_hae_metrics ADD CONSTRAINT staging_hae_metrics_user_metric_date_key
  UNIQUE (user_id, metric_name, date);

-- Same for workouts
ALTER TABLE staging_hae_workouts DROP CONSTRAINT IF EXISTS staging_hae_workouts_workout_name_start_time_key;
ALTER TABLE staging_hae_workouts ADD CONSTRAINT staging_hae_workouts_user_workout_start_key
  UNIQUE (user_id, workout_name, start_time);
```

> If the `DROP` fails because the constraint name differs, find it
> first:
>
> ```sql
> SELECT conname FROM pg_constraint
> WHERE conrelid = 'staging_hae_metrics'::regclass AND contype = 'u';
> ```

**VERIFY:**

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('staging_hae_metrics'::regclass,'staging_hae_workouts'::regclass)
  AND contype = 'u';
-- Expect: new per-user unique constraints present, old ones gone
```

☐ Done

---

### 🔶 Pause point — do repo task R-C1 before C4

At this point the database schema accepts per-user rows, but the
Edge Function still writes without `user_id`. Switch to
`TODO-agent-repo.md` task **R-C1** (rewrite `ingest-hae` to look up
`user_id` from `hae_ingest_tokens`) before continuing. When that ships
and you've confirmed new staging rows carry the correct `user_id`,
come back here.

---

### C4. Rewrite `sync_hae_to_production()` for multi-user  🚧 L

Remove the hardcoded user UUID; process each distinct `user_id` in
staging, using that user's own `timezone`.

This is the biggest individual change in this backlog. Keep the
function in a branch / snapshot before editing so you can revert.

**DO:** (outline only — paste the existing function body and adapt
per these rules)

- Replace the top-of-function `v_user_id := 'a5dafd53-...'` with a
  loop over `SELECT DISTINCT user_id FROM staging_hae_metrics WHERE
  processed_at IS NULL UNION ... (workouts) UNION ... (other)`.
- Inside the loop, read that user's timezone:
  ```sql
  SELECT timezone INTO v_tz FROM user_preferences WHERE user_id = v_user_id;
  v_tz := COALESCE(v_tz, 'UTC');
  ```
- Change every staging read to `WHERE user_id = v_user_id AND
  processed_at IS NULL`.
- Aggregate per-user counts and concatenate them into the RETURN
  string.

> Before editing, snapshot the current body:
>
> ```sql
> SELECT pg_get_functiondef('sync_hae_to_production()'::regprocedure);
> ```
> Paste the output somewhere safe.

**VERIFY (single-user regression first):**

```sql
-- Unmark one recent day and reprocess as the single existing user
UPDATE staging_hae_metrics
SET processed_at = NULL
WHERE (date AT TIME ZONE 'Europe/Madrid')::date = CURRENT_DATE - INTERVAL '1 day';

SELECT sync_hae_to_production();
-- Expect: status string mentions 1 user, counts > 0

SELECT date, steps, active_energy_kcal
FROM health_metrics_daily
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336'
  AND date = CURRENT_DATE - INTERVAL '1 day';
-- Expect: numbers match iPhone Health for that day
```

**VERIFY (multi-user):** add a test user, generate a token, push a
small HAE payload via curl (see `04-edge-functions.md § Testing
manually`), then:

```sql
SELECT user_id, COUNT(*) FROM staging_hae_metrics
WHERE processed_at IS NULL
GROUP BY user_id;
-- Expect: 2 users' rows

SELECT sync_hae_to_production();
-- Expect: status string reflects both users
```

☐ Done

---

### C5. Drop `UNIQUE (date)` on `health_metrics_daily`  🚧 S

Single-user bottleneck — only one row per date globally.

**DO:**

```sql
ALTER TABLE health_metrics_daily
  DROP CONSTRAINT IF EXISTS health_metrics_daily_unique_date;

-- Also the standalone unique index if it exists separately:
DROP INDEX IF EXISTS health_metrics_daily_unique_date;
```

**VERIFY:**

```sql
-- Only per-user uniques should remain
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'health_metrics_daily'::regclass AND contype = 'u';
-- Expect: constraint(s) on (user_id, date), none on (date) alone
```

☐ Done

---

### C6. Drop hardcoded `user_id` defaults  🚧 S

Several production tables default `user_id` to the hardcoded test
user UUID. Foot-gun the moment a second user appears.

**DO:**

```sql
ALTER TABLE ecg_readings             ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE sleep_events             ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE state_of_mind            ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE heart_rate_notifications ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE workout_routes           ALTER COLUMN user_id DROP DEFAULT;
```

**VERIFY:**

```sql
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'user_id'
  AND column_default IS NOT NULL;
-- Expect: 0 rows (or only tables you intentionally left defaulted)
```

☐ Done

---

## Phase D — Column & index cleanup

Do this AFTER Phase C — dropping columns is harder if policies or
constraints reference them.

### D1. Audit and drop legacy columns on `health_metrics_daily`  🧹 M

**Pre-step (important):** before dropping, ask the agent to grep the
frontend for each column name (see `TODO-agent-repo.md` task R-D1).
Keep any column the UI still reads.

**DO (after agent confirms unused):**

```sql
ALTER TABLE health_metrics_daily
  DROP COLUMN IF EXISTS exercise_minutes,
  DROP COLUMN IF EXISTS total_energy_kcal,
  DROP COLUMN IF EXISTS average_heart_rate,
  DROP COLUMN IF EXISTS distance_km,
  DROP COLUMN IF EXISTS vo2max;
```

**VERIFY:**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'health_metrics_daily' AND table_schema = 'public'
ORDER BY ordinal_position;
-- Expect: legacy columns gone
```

☐ Done

---

### D2. Audit and drop legacy columns on `exercise_events`  🧹 L

Same pattern — agent audit first (task R-D1), then drop.

**DO (after agent confirms unused):**

```sql
ALTER TABLE exercise_events
  DROP COLUMN IF EXISTS avg_hr,
  DROP COLUMN IF EXISTS min_hr,
  DROP COLUMN IF EXISTS max_hr,
  DROP COLUMN IF EXISTS total_minutes,
  DROP COLUMN IF EXISTS move_minutes,
  DROP COLUMN IF EXISTS total_energy_kcal,
  DROP COLUMN IF EXISTS sheet_row_number,
  DROP COLUMN IF EXISTS hr_zone_type,
  DROP COLUMN IF EXISTS hrz0_seconds,
  DROP COLUMN IF EXISTS hrz1_seconds,
  DROP COLUMN IF EXISTS hrz2_seconds,
  DROP COLUMN IF EXISTS hrz3_seconds,
  DROP COLUMN IF EXISTS hrz4_seconds,
  DROP COLUMN IF EXISTS hrz5_seconds,
  DROP COLUMN IF EXISTS trimp,
  DROP COLUMN IF EXISTS rpe;

-- Drop the now-meaningless unique on sheet_row_number
ALTER TABLE exercise_events
  DROP CONSTRAINT IF EXISTS uniq_exercise_events_user_row;
```

**VERIFY:**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'exercise_events' AND table_schema = 'public'
ORDER BY ordinal_position;
```

☐ Done

---

### D3. Drop duplicate column on `keep_alive`  🧹 S

`pinged_at` and `timestamp` both default to `NOW()` — pointless.

**DO:**

```sql
ALTER TABLE keep_alive DROP COLUMN IF EXISTS "timestamp";
```

**VERIFY:**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'keep_alive' AND table_schema = 'public';
-- Expect: only id and pinged_at
```

☐ Done

---

### D4. Consolidate redundant indexes  🧹 M

Worst offenders:
- `health_metrics_daily` — 5 identical indexes on `(user_id, date)`
- `exercise_events` — 4 overlapping on `user_id + date/started_at`
- `food_entries`, `mood_entries` — 3 each on `(user_id, date)`

**DO (example — repeat for other tables):**

```sql
-- Inspect first:
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'health_metrics_daily' ORDER BY indexname;

-- Keep one well-named unique per unique column combination. Example
-- keepers: health_metrics_daily_user_date_key (unique) and the PK.
DROP INDEX IF EXISTS health_metrics_daily_user_date;
DROP INDEX IF EXISTS uniq_health_daily_user_date;
DROP INDEX IF EXISTS ux_health_metrics_daily_user_date;
-- (verify index names in YOUR DB before dropping — they may differ)
```

**VERIFY:**

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'health_metrics_daily'
ORDER BY indexname;
-- Expect: PK + one unique(user_id, date) + maybe one date-only if
-- needed for range scans
```

☐ Done

---

## Phase E — Deprecations

### E1. Drop `exercise_daily`  🧹 S

Depends on B1 (the helper function must be rewritten first). After B1
shipped, nothing reads this table.

**DO:**

```sql
-- Confirm zero rows and zero dependents first:
SELECT COUNT(*) FROM exercise_daily;
-- Expect: 0

DROP TABLE IF EXISTS exercise_daily CASCADE;
```

**VERIFY:**

```sql
SELECT 1 FROM pg_tables WHERE tablename = 'exercise_daily';
-- Expect: 0 rows
```

☐ Done

---

### E2. Decide fate of `sync_log`  🧹 S

After A1 it's RLS-protected and unused by HAE. Two options:

**Option A — drop it:**

```sql
DROP TABLE sync_log;
```

**Option B — repurpose as general sync audit log** (feeds into task
F2 below). Rename columns and use it for `sync_hae_to_production`
and `purge_old_staging_rows` runs.

☐ Decided (circle one): drop / repurpose
☐ Done

---

## Phase F — Observability & ergonomics

### F1. Monitoring: stale-staging alert  ✨ M

Add a check that runs every hour and raises if HAE hasn't pushed
recently during awake hours.

Sketch:

```sql
-- Creates a view you can monitor or alert from
CREATE OR REPLACE VIEW v_hae_freshness AS
SELECT
  MAX(received_at) AS last_push,
  NOW() - MAX(received_at) AS staleness,
  CASE
    WHEN EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Madrid') BETWEEN 7 AND 23
     AND NOW() - MAX(received_at) > INTERVAL '30 minutes'
    THEN 'STALE'
    ELSE 'OK'
  END AS status
FROM staging_hae_metrics;
```

**VERIFY:**

```sql
SELECT * FROM v_hae_freshness;
-- Expect: status = 'OK' (during awake hours, assuming HAE is live)
```

Alerting this externally (email/push) is out of scope for Supabase —
tracked as a follow-up in the agent file.

☐ Done

---

### F2. Log sync runs to an audit table  ✨ M

If you chose Option B for E2, use `sync_log` with a schema change.
Otherwise create a fresh `sync_audit_log`.

Fields to capture per run: `run_at`, `function_name`, `duration_ms`,
`status`, `result_message`, `rows_touched jsonb`. Update both
`sync_hae_to_production()` and `purge_old_staging_rows()` to
`INSERT` into it at the end.

**VERIFY:**

```sql
SELECT run_at, function_name, status, duration_ms
FROM sync_audit_log
ORDER BY run_at DESC LIMIT 10;
```

☐ Done

---

### F3. Migrate schema drift back to repo  🐛 S

Several objects were created directly in the SQL Editor and aren't
in `supabase/migrations/`:

- `sleep_events` table
- Latest `sync_hae_to_production()` body
- `purge_old_staging_rows()` body
- The `sync-hae-to-production` and `purge-old-staging-rows` cron jobs

This is primarily a repo task (tracked in agent file as R-F1), but
you need to run these here to produce the authoritative definitions:

**DO — snapshot current state:**

```sql
-- Sleep events CREATE TABLE
SELECT 'CREATE TABLE sleep_events (' ||
       string_agg(column_name || ' ' || data_type, ', ') || ');'
FROM information_schema.columns
WHERE table_name = 'sleep_events';
-- (for a full DDL including constraints/indexes, use pg_dump from
-- your terminal instead — see task R-F1)

-- Function bodies
SELECT pg_get_functiondef('sync_hae_to_production()'::regprocedure);
SELECT pg_get_functiondef('purge_old_staging_rows()'::regprocedure);

-- Cron schedule
SELECT jobname, schedule, command FROM cron.job
WHERE jobname IN ('sync-hae-to-production','purge-old-staging-rows','recalc-streaks-nightly');
```

Hand these outputs to the agent (task R-F1) for saving as a
migration file.

☐ Done

---

## Phase G — Future enhancements (when you're ready)

These are not critical. Revisit when the foundation is boring.

### G1. Near-realtime sync via `pg_notify`  ✨ L

Remove the up-to-15-min lag by having `ingest-hae` emit a
`pg_notify('hae_ingest', user_id::text)` after each successful write,
and have a small listener call `sync_hae_to_production()` for that
user. Keep the 15-min cron as fallback.

### G2. Extend sync for `vo2_max`  ✨ S

HAE sends it; we don't aggregate it. Add an
`AVG(qty) FILTER (WHERE metric_name = 'vo2_max')` to the metrics
INSERT in `sync_hae_to_production()`.

### G3. Extend sync for more body metrics  ✨ S

HAE also sends `lean_body_mass` and `height`. Consider:
- `height_m` column on `health_metrics_body` (or a `health_profile`
  table for stable values)
- `lean_body_mass_kg` column

### G4. Storage bucket policies in a migration  🔒 S

Today `food-photos` and `voice-notes` bucket policies are set via the
Dashboard and aren't version-controlled. Configuration-drift risk.
Codify them:

```sql
-- Example shape (replace with your actual policy):
CREATE POLICY "Users read own photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'food-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

Snapshot what exists first via the Dashboard → Storage → Policies
view, then re-create as migrations.

---

## Quick-win bundle (2 hours)

If you only have a short session: **A1 → A2 → A3 → A4 → A5 → A6 →
B1**. Covers every security fix and one bug. Nothing here depends
on code changes — all SQL Editor.

## Multi-user launch bundle

Ship **C1–C6 plus R-C1** together. Budget: one day to design, one
day to implement, half a day to test with a second account.
