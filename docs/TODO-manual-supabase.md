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

✅ Done
Completed with result:

| relname  | relrowsecurity | relforcerowsecurity |
| -------- | -------------- | ------------------- |
| sync_log | true           | false               |

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'sync_log';
```
Gave me the result of 0 rows, with comment `Success. No rows returned.`.

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

✅ Done
Completed with verification output:

| prosrc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 
DECLARE
    v_avg_mood NUMERIC;
    v_total_calories NUMERIC;
    v_top_foods TEXT[];
    v_mood_count INTEGER;
    v_food_count INTEGER;
BEGIN
    IF auth.uid() IS DISTINCT FROM user_uuid THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    SELECT AVG(mood_score), COUNT(*)
    INTO v_avg_mood, v_mood_count
    FROM mood_entries
    WHERE user_id = user_uuid
    AND date BETWEEN start_date AND end_date;

    SELECT COALESCE(SUM(calories), 0), COUNT(*)
    INTO v_total_calories, v_food_count
    FROM food_entries
    WHERE user_id = user_uuid
    AND date BETWEEN start_date AND end_date
    AND journal_mode = FALSE;

    SELECT ARRAY_AGG(food_label)
    INTO v_top_foods
    FROM (
        SELECT UNNEST(food_labels) AS food_label, COUNT(*) AS frequency
        FROM food_entries
        WHERE user_id = user_uuid
        AND date BETWEEN start_date AND end_date
        AND journal_mode = FALSE
        AND food_labels IS NOT NULL
        GROUP BY food_label
        ORDER BY frequency DESC
        LIMIT 5
    ) AS top_food_query;

    RETURN jsonb_build_object(
        'avgMood', COALESCE(v_avg_mood, 0),
        'kcalTotal', COALESCE(v_total_calories, 0),
        'topFoods', COALESCE(v_top_foods, '{}'::TEXT[]),
        'moodEntries', COALESCE(v_mood_count, 0),
        'foodEntries', COALESCE(v_food_count, 0)
    );
END;
                                                                                                                                                                                                                                                                                                                                                      |
| 
DECLARE
    avg_mood NUMERIC := 0;
    total_calories NUMERIC := 0;
    top_foods TEXT[] := '{}';
    mood_count INTEGER := 0;
    food_count INTEGER := 0;
    start_date_only DATE;
BEGIN
    -- Convert timestamp to date for comparison
    start_date_only := start_date::DATE;
    
    -- Calculate average mood
    SELECT COALESCE(AVG(mood_score), 0), COALESCE(COUNT(*), 0)
    INTO avg_mood, mood_count
    FROM mood_entries 
    WHERE user_id = user_uuid 
    AND date >= start_date_only 
    AND date <= end_date;
    
    -- Calculate total calories
    SELECT COALESCE(SUM(calories), 0), COALESCE(COUNT(*), 0)
    INTO total_calories, food_count
    FROM food_entries 
    WHERE user_id = user_uuid 
    AND date >= start_date_only 
    AND date <= end_date
    AND COALESCE(journal_mode, FALSE) = FALSE;
    
    -- Get top 5 most frequent foods
    SELECT COALESCE(ARRAY_AGG(food_label), '{}')
    INTO top_foods
    FROM (
        SELECT UNNEST(food_labels) AS food_label, COUNT(*) as frequency
        FROM food_entries 
        WHERE user_id = user_uuid 
        AND date >= start_date_only 
        AND date <= end_date
        AND COALESCE(journal_mode, FALSE) = FALSE
        AND food_labels IS NOT NULL
        AND array_length(food_labels, 1) > 0
        GROUP BY food_label
        ORDER BY frequency DESC
        LIMIT 5
    ) AS top_food_query;
    
    -- Return actual data from database
    RETURN jsonb_build_object(
        'avgMood', COALESCE(avg_mood, 0),
        'kcalTotal', COALESCE(total_calories, 0),
        'topFoods', COALESCE(top_foods, '{}'),
        'moodEntries', COALESCE(mood_count, 0),
        'foodEntries', COALESCE(food_count, 0)
    );
END;
 |

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

✅ Done after troubleshooting

UI data was not loading. Steps and Resting HR in exercise as example say pending. on dashboard it is just empty with '--'.

## Lessons Learned — 2026-04-19 Session

## A2: The `calculate_weekly_metrics` stub incident

### What happened

The audit's task A2 required adding an `auth.uid()` authorization guard to the `calculate_weekly_metrics` PL/pgSQL function. The function is `SECURITY DEFINER` and was missing a check that the caller owns the `user_uuid` parameter — meaning any authenticated user could pass another user's UUID and read their aggregates.

The task instructions included the new function skeleton with a placeholder comment saying "keep the existing function body below — just paste the current SELECT that builds `result`." The instructions explicitly said to snapshot the existing body first using `pg_get_functiondef` before running `CREATE OR REPLACE`.

**The `CREATE OR REPLACE` was run without first snapshotting and without filling in the real body.** The function was silently replaced with a stub that only had the auth check and `RETURN result;` (where `result` was never populated). The stub returned `NULL` for every call.

### How it was discovered

A verification query — the same one used to confirm the function was "working" — returned real data in an earlier run. But the data returned was from a snapshot taken *before* the stub replaced the function. Running the same query fresh against the stub returned `NULL`.

A grep confirmed the function is used in two places:
- `apps/web/app/api/ai/insights/route.ts` — the "Generate AI Insights" server-side endpoint
- `apps/web/hooks/useInsightsData.ts` — client-side call every time the Insights page loads

The Insights page was silently broken: the RPC returned `NULL`, the hook fell back to empty defaults (zeros, empty arrays), and the page rendered without data but without errors.

### The recovery

The original function body was located in `supabase/migrations/000_init.sql` lines 196–241. It was pasted back with the new auth check prepended to it.

### The NEW problem: Supabase SQL Editor static analyzer

Pasting the restored function into the Supabase Dashboard SQL Editor failed repeatedly with:

```ERROR:42P01:relation"v_avg_mood" does not exist```
After extensive debugging (confirming `plpgsql` extension was installed, testing different dollar-quote delimiters, testing with different variable names, ruling out copy-paste character corruption), the cause was revealed by a dialog popup:

> *"Potential issue detected with your query"*
> *"New table will not have Row Level Security enabled. Without RLS, any client using your project's anon or authenticated keys can read and write to `v_avg_mood`."*

**Root cause:** the Supabase SQL Editor has a static analyzer that pattern-matches the word `INTO` in SQL and flags any new "table" as needing RLS. It doesn't distinguish between:
- SQL's `SELECT INTO table_name` (actually creates a table)
- PL/pgSQL's `SELECT ... INTO variable_name` (assigns values to local variables inside a function body)

When the analyzer sees `INTO v_avg_mood` inside a PL/pgSQL function body, it interprets `v_avg_mood` as a new table name. Clicking either "Run and enable RLS" or "Run without RLS" caused the query to be rewritten in a way that broke PL/pgSQL parsing, so the function body was executed as plain SQL — which is why `v_avg_mood` was then treated as a relation name that didn't exist.

**Importantly:** this is a flaw in the Dashboard's static analyzer. The underlying database and `LANGUAGE plpgsql` work correctly. The same function runs perfectly via `psql`.

### The workaround: use `psql` via the pooler connection

The Supabase CLI's `supabase db execute` command doesn't exist in v2.39.x. Direct connection via `db.<project>.supabase.co:5432` is IPv6-only and DNS resolution failed from this network. **Session pooler connection works and should be the default for all function-definition SQL.**

#### Step-by-step workaround

**1. Get the session pooler connection string.**

- Supabase Dashboard → Project Settings → Database
- Connection string section → **Session pooler** tab (NOT "Direct connection")
- Copy the URI. Format:
```bash
postgresql://postgres.<project_ref>:[YOUR-PASSWORD]@aws-<N>-<region>.pooler.supabase.com:5432/postgres
```

- For this project: `postgresql://postgres.sxawzzcpmiakltfjpzcn:<PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`

**2. Save the password somewhere safe** (1Password/notes/etc.) — do NOT commit to git. If the password is lost, reset via Dashboard → Project Settings → Database → Reset database password. Resetting invalidates only the raw Postgres connection string; it does NOT affect the anon or service-role keys.

**3. Save the SQL to a file.**

```bash
cat > /tmp/my_function.sql << 'EOF'
CREATE OR REPLACE FUNCTION my_function(...)
RETURNS ...
LANGUAGE plpgsql
AS $function$
-- ...function body...
$function$;
EOF
```

**4. Run with `psql`.**

```bash
psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:YOUR_PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -f /tmp/my_function.sql
```

Expected output: `CREATE FUNCTION` (one line).

#### When to use psql vs Dashboard

**Use `psql`:**
- Any `CREATE OR REPLACE FUNCTION` that uses `SELECT ... INTO`
- Any `CREATE OR REPLACE FUNCTION` in general (safer default)
- Multi-statement migrations
- Anything where the dashboard's analyzer might false-positive

**Dashboard SQL Editor is fine for:**
- Simple `SELECT` queries and inspection
- `ALTER TABLE` for columns, indexes, constraints
- `GRANT` / `REVOKE`
- `CREATE POLICY`
- `DROP` statements
- Single-statement `INSERT` / `UPDATE` / `DELETE`

#### If you get the "New table will not have Row Level Security enabled" popup

**Click Cancel.** Do NOT click "Run and enable RLS" or "Run without RLS" — both will corrupt the query. Switch to `psql`.

---

## A3: Grant revocation caveat — views don't inherit

### What happened

A3 revoked `GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA public FROM anon, authenticated` and selectively re-granted per table. After running the patch, the Exercise page in the UI showed "Pending" for Steps and Resting HR.

### Root cause

The re-grant list explicitly named base tables (`health_metrics_daily`, `exercise_events`, etc.), but the frontend reads from **views** (`v_daily_activity`, `v_day_summary`), not directly from those tables. Views have their own grants — separate from the underlying tables — and the blanket `REVOKE ALL` wiped them.

### The fix

```sql
GRANT SELECT ON v_daily_activity, v_day_summary TO authenticated;
```

Run via `psql` (same connection string as above) or directly in the SQL Editor — GRANTs on existing views don't trigger the analyzer issue.

### Diagnostic queries to know

After any grant revocation, run these to sanity-check coverage:

```sql
-- List all views in public
SELECT table_name FROM information_schema.views WHERE table_schema = 'public';

-- Confirm grants on each view
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public')
ORDER BY grantee, table_name;

-- Broader view of all relations + their types
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type IN ('BASE TABLE','VIEW')
ORDER BY table_type, table_name;
```

### Tables that should NOT have authenticated grants

A grant-audit of this project confirmed:

| Table | Grants | Why |
|---|---|---|
| `mood_entries`, `food_entries`, `insights`, `streaks`, `user_preferences` | authenticated: SELECT, INSERT, UPDATE, DELETE | User-owned data, frontend does full CRUD |
| `health_metrics_daily`, `health_metrics_body`, `exercise_events`, `workout_routes`, `sleep_events`, `state_of_mind`, `ecg_readings`, `heart_rate_notifications` | authenticated: SELECT | Read-only Apple Watch data, written by service-role via `sync_hae_to_production()` |
| `v_daily_activity`, `v_day_summary` | authenticated: SELECT | Views the UI reads from |
| `keep_alive` | anon: INSERT | Public ping endpoint |
| `staging_hae_metrics`, `staging_hae_workouts`, `staging_hae_other` | none | Written by `ingest-hae` edge function using service-role; never read by frontend |
| `sync_log` | none | Operational logging, service-role only (RLS also enabled per A1) |
| `knowledge_documents` | none | Accessed by AI insights endpoint via service-role; not read by frontend |
| `exercise_daily` | none | Deprecated legacy table (scheduled to drop in task E1) |

If the UI breaks after a grant change, cross-reference the table it's trying to read against this list. If it's a view, check views. If it's a service-role-only table being queried from the frontend, that's an app-side bug, not a grant issue.

---

## Process improvements for future tasks

1. **Before any `CREATE OR REPLACE FUNCTION`**, run `pg_get_functiondef(...)` first and save the output. Treat the function body as precious state.
2. **Default to `psql` via the session pooler** for all function definitions. The dashboard is convenient but has the `SELECT ... INTO` false-positive gotcha.
3. **Run grant coverage checks after any `REVOKE`** — views, sequences, and materialized views each need separate attention.
4. **Verify UI impact after any security change.** Load every main page of the app in the browser. If anything shows "Pending" / "—" / zeros that shouldn't, suspect a grants/policies issue first.

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

✅ Done 

Verification query returned the expected 0 rows.

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

✅ Done 

First verification query gave the expected 0 rows.
The second verification query gave:

| tablename    | policyname                              |
| ------------ | --------------------------------------- |
| food_entries | Users can insert their own food entries |
| food_entries | Users can update their own food entries |
| food_entries | Users can view their own food entries   |
| food_entries | food_delete_own                         |
| food_entries | food_insert_own                         |
| food_entries | food_select_own                         |
| food_entries | food_update_own                         |
| insights     | Users can insert their own insights     |
| insights     | Users can view their own insights       |
| insights     | insights_delete_own                     |
| insights     | insights_insert_own                     |
| insights     | insights_select_own                     |
| insights     | insights_update_own                     |
| mood_entries | Users can insert their own mood entries |
| mood_entries | Users can update their own mood entries |
| mood_entries | Users can view their own mood entries   |
| mood_entries | mood_delete_own                         |
| mood_entries | mood_insert_own                         |
| mood_entries | mood_select_own                         |
| mood_entries | mood_update_own                         |
| streaks      | Users can manage their own streaks      |
| streaks      | Users can view their own streaks        |
| streaks      | streaks_delete_own                      |
| streaks      | streaks_insert_own                      |
| streaks      | streaks_select_own                      |
| streaks      | streaks_update_own                      |

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

✅ Done

Verification output:
| tablename    | policyname      | cmd    |
| ------------ | --------------- | ------ |
| food_entries | food_delete_own | DELETE |
| food_entries | food_insert_own | INSERT |
| food_entries | food_select_own | SELECT |
| food_entries | food_update_own | UPDATE |

Additional verification ran:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('food_entries','mood_entries','insights','streaks')
ORDER BY tablename, policyname;
```
which gave the below output:
| tablename    | policyname                              | cmd    |
| ------------ | --------------------------------------- | ------ |
| food_entries | food_delete_own                         | DELETE |
| food_entries | food_insert_own                         | INSERT |
| food_entries | food_select_own                         | SELECT |
| food_entries | food_update_own                         | UPDATE |
| insights     | Users can insert their own insights     | INSERT |
| insights     | Users can view their own insights       | SELECT |
| insights     | insights_delete_own                     | DELETE |
| insights     | insights_insert_own                     | INSERT |
| insights     | insights_select_own                     | SELECT |
| insights     | insights_update_own                     | UPDATE |
| mood_entries | Users can insert their own mood entries | INSERT |
| mood_entries | Users can update their own mood entries | UPDATE |
| mood_entries | Users can view their own mood entries   | SELECT |
| mood_entries | mood_delete_own                         | DELETE |
| mood_entries | mood_insert_own                         | INSERT |
| mood_entries | mood_select_own                         | SELECT |
| mood_entries | mood_update_own                         | UPDATE |
| streaks      | Users can manage their own streaks      | ALL    |
| streaks      | Users can view their own streaks        | SELECT |
| streaks      | streaks_delete_own                      | DELETE |
| streaks      | streaks_insert_own                      | INSERT |
| streaks      | streaks_select_own                      | SELECT |
| streaks      | streaks_update_own                      | UPDATE |

---
Which revealed `food_entries` cleaned up properly — A6's DROP for those 3 policies worked. But the other three tables' DROPs didn't work. Most likely cause: policy names I guessed don't exactly match yours.
Before dropping, let's use the EXACT names from your output:
```sql
-- insights
DROP POLICY "Users can view their own insights"     ON insights;
DROP POLICY "Users can insert their own insights"   ON insights;

-- mood_entries
DROP POLICY "Users can view their own mood entries"     ON mood_entries;
DROP POLICY "Users can insert their own mood entries"   ON mood_entries;
DROP POLICY "Users can update their own mood entries"   ON mood_entries;

-- streaks
DROP POLICY "Users can view their own streaks"     ON streaks;
DROP POLICY "Users can manage their own streaks"   ON streaks;
```
I removed the `IF EXISTS` so if any name is still wrong it'll error loudly instead of silently skipping.
Note the `streaks` "Users can manage their own streaks" is a `cmd=ALL` policy — it covers select/insert/update/delete in one. Dropping it is safe because the four individual `streaks_*_own` policies cover the same surface.
Run it, then re-run the verification query:
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('food_entries','mood_entries','insights','streaks')
ORDER BY tablename, policyname;
```

Output: 
| tablename    | policyname          | cmd    |
| ------------ | ------------------- | ------ |
| food_entries | food_delete_own     | DELETE |
| food_entries | food_insert_own     | INSERT |
| food_entries | food_select_own     | SELECT |
| food_entries | food_update_own     | UPDATE |
| insights     | insights_delete_own | DELETE |
| insights     | insights_insert_own | INSERT |
| insights     | insights_select_own | SELECT |
| insights     | insights_update_own | UPDATE |
| mood_entries | mood_delete_own     | DELETE |
| mood_entries | mood_insert_own     | INSERT |
| mood_entries | mood_select_own     | SELECT |
| mood_entries | mood_update_own     | UPDATE |
| streaks      | streaks_delete_own  | DELETE |
| streaks      | streaks_insert_own  | INSERT |
| streaks      | streaks_select_own  | SELECT |
| streaks      | streaks_update_own  | UPDATE |

This is expected and now fixed/completed. UI is showing data and no errors.


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

✅ Done 
Verification output, as expected:
| get_latest_exercise_date |
| ------------------------ |
| 2026-04-19               |

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
```
Output: `success`

```sql
-- 2. Schedule the from-scratch recalc nightly
SELECT cron.schedule(
  'recalc-streaks-nightly',
  '0 4 * * *',  -- 04:00 UTC
  $$SELECT recalc_streaks(user_id) FROM user_preferences;$$
);
```
Output:
| schedule |
| -------- |
| 7        |
```sql
-- 3. Run it once now so streaks are correct immediately
SELECT recalc_streaks(user_id) FROM user_preferences;
```
output:
| recalc_streaks |
| -------------- |
|                |

**VERIFY:**

```sql
-- Triggers are gone
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_update_streaks_food','trg_update_streaks_mood');
-- Expect: 0 rows
```
Output: expected o rows, `Success. No rows returned`
```sql
-- Cron job exists
SELECT jobname, schedule, active FROM cron.job
WHERE jobname = 'recalc-streaks-nightly';
-- Expect: 1 row, active = true
```
Ouput: 
| jobname                | schedule  | active |
| ---------------------- | --------- | ------ |
| recalc-streaks-nightly | 0 4 * * * | true   |

```sql
-- Streak data looks sane
SELECT user_id, current_streak, longest_streak, last_entry_date, updated_at
FROM streaks
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336';
-- Expect: updated_at = today, current_streak reflects reality
```
Output:
| user_id                              | current_streak | longest_streak | last_entry_date | updated_at                    |
| ------------------------------------ | -------------- | -------------- | --------------- | ----------------------------- |
| a5dafd53-74d9-4492-9b60-944cfdf5d336 | 0              | 9              | 2026-04-19      | 2026-04-20 12:34:47.409178+00 |

### Conclusion
Partial success.
✅ Triggers dropped, cron scheduled, streaks recalculated — the mechanics worked.
⚠️ But `current_streak = 0` is suspicious. `last_entry_date = 2026-04-19` (yesterday) and today is 2026-04-20. If you logged yesterday, current_streak should be 1, not 0.
Two possibilities:

1. You didn't log anything yesterday — streak legitimately broke. `longest_streak = 9` is historical, `current_streak = 0` is accurate.
2. `recalc_streaks()` has a bug — it's treating yesterday as "streak broken" when it should count.

Quick check:
```sql
SELECT date, COUNT(*) FROM mood_entries
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336'
  AND date >= CURRENT_DATE - INTERVAL '3 days'
GROUP BY date ORDER BY date;
```
output:
| date       | count |
| ---------- | ----- |
| 2026-04-17 | 1     |
| 2026-04-18 | 1     |
| 2026-04-19 | 1     |

```sql
SELECT date, COUNT(*) FROM food_entries
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336'
  AND date >= CURRENT_DATE - INTERVAL '3 days'
GROUP BY date ORDER BY date;
```
output:
| date       | count |
| ---------- | ----- |
| 2026-04-17 | 3     |
| 2026-04-18 | 5     |
| 2026-04-19 | 5     |

Based on the output `recalc_streaks()` has a bug. You logged every day for at least 3 consecutive days ending yesterday — current_streak should be ≥ 3, not 0.
Let's look at the function to see what it's doing:
```sql
SELECT pg_get_functiondef('recalc_streaks(uuid)'::regprocedure);
```
output:
| pg_get_functiondef                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CREATE OR REPLACE FUNCTION public.recalc_streaks(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  d date := current_date;
  cur int := 0;
  best int := coalesce((select longest_streak from public.streaks where user_id=p_user_id),0);
begin
  loop
    exit when not exists (
      select 1 from public.mood_entries me where me.user_id=p_user_id and me.date=d
    ) and not exists (
      select 1 from public.food_entries fe where fe.user_id=p_user_id and fe.date=d
    );
    cur := cur + 1;
    if cur > best then best := cur; end if;
    d := d - 1;
  end loop;

  insert into public.streaks(user_id, current_streak, longest_streak)
  values (p_user_id, cur, best)
  on conflict (user_id) do update
  set current_streak = excluded.current_streak,
      longest_streak = greatest(streaks.longest_streak, excluded.current_streak),
      updated_at = now();
end $function$
 |

Found the bug.
The function starts counting from `current_date` (today, 2026-04-20). If you haven't logged anything TODAY yet, the very first `exit when not exists` check returns true, the loop exits immediately with `cur = 0`, and — critically — it never looks at yesterday even though yesterday has entries.
A streak should be "unbroken as long as today OR yesterday has an entry." The current logic is "must have logged today." That's wrong.
Fix: start counting from the most recent day that has an entry (today if logged, else yesterday, else streak is 0). Also persist `last_entry_date` which isn't being updated.

```sql
CREATE OR REPLACE FUNCTION recalc_streaks(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_last_entry date;
  v_d date;
  v_cur int := 0;
  v_best int;
BEGIN
  -- Find the most recent day with any entry
  SELECT max(date) INTO v_last_entry
  FROM (
    SELECT date FROM mood_entries WHERE user_id = p_user_id
    UNION ALL
    SELECT date FROM food_entries WHERE user_id = p_user_id
  ) entries;

  -- No entries ever -> reset streak
  IF v_last_entry IS NULL THEN
    INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date)
    VALUES (p_user_id, 0, 0, NULL)
    ON CONFLICT (user_id) DO UPDATE
      SET current_streak = 0, updated_at = now();
    RETURN;
  END IF;

  -- If most recent entry is older than yesterday, streak is broken
  IF v_last_entry < current_date - 1 THEN
    v_cur := 0;
  ELSE
    -- Walk backwards from the most recent entry date
    v_d := v_last_entry;
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM mood_entries WHERE user_id = p_user_id AND date = v_d
      ) AND NOT EXISTS (
        SELECT 1 FROM food_entries WHERE user_id = p_user_id AND date = v_d
      );
      v_cur := v_cur + 1;
      v_d := v_d - 1;
    END LOOP;
  END IF;

  v_best := COALESCE(
    (SELECT longest_streak FROM streaks WHERE user_id = p_user_id), 0
  );
  IF v_cur > v_best THEN v_best := v_cur; END IF;

  INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date)
  VALUES (p_user_id, v_cur, v_best, v_last_entry)
  ON CONFLICT (user_id) DO UPDATE
    SET current_streak = EXCLUDED.current_streak,
        longest_streak = GREATEST(streaks.longest_streak, EXCLUDED.current_streak),
        last_entry_date = EXCLUDED.last_entry_date,
        updated_at = now();
END $function$;
```
⚠️ This is a `CREATE OR REPLACE FUNCTION` with `SELECT ... INTO` — so it WILL trip the Dashboard analyzer again. Run via `psql`:
```bash
cat > /Users/benvandijk/fl-moodtracker/temp/fix_recalc_streaks.sql << 'EOF'
<paste the entire SQL above, including the CREATE OR REPLACE line>
EOF
```
Then:
```bash
psql "postgresql://postgres.sxawzzcpmiakltfjpzcn:YOUR_PASSWORD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  -f /Users/benvandijk/fl-moodtracker/temp/fix_recalc_streaks.sql
  ```
  Output: `CREATE FUNCTION`
After it runs, re-run in the SQL Editor:
```sql
SELECT recalc_streaks('a5dafd53-74d9-4492-9b60-944cfdf5d336');

SELECT user_id, current_streak, longest_streak, last_entry_date, updated_at
FROM streaks
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336';
```
Output:
| user_id                              | current_streak | longest_streak | last_entry_date | updated_at                    |
| ------------------------------------ | -------------- | -------------- | --------------- | ----------------------------- |
| a5dafd53-74d9-4492-9b60-944cfdf5d336 | 12             | 12             | 2026-04-19      | 2026-04-20 13:06:02.845901+00 |

Expected: `current_streak` now reflects reality (should be ≥ 3, possibly much higher if you've been logging consistently), `last_entry_date = 2026-04-19`.

✅ B2 complete and verified.

current_streak = 12 — real streak reflecting actual logging
longest_streak = 12 — updated to match
last_entry_date = 2026-04-19 — correctly populated
Triggers dropped, cron scheduled for 04:00 UTC nightly, recalc_streaks fixed

Phase A + B1 + B2 done.
What's next:

Stop here for today — good stopping point, lots shipped
B remaining: just B1 left (fix get_latest_exercise_date) — quick, also uses psql
Continue to Phase C (multi-user foundation) — bigger, coordinated with agent work
Jump elsewhere

Rotated DB Password as exidently shared with Claude.

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
```
Output:
`Success. No rows returned`.
```sql
CREATE INDEX idx_hae_tokens_active
  ON hae_ingest_tokens(token) WHERE revoked_at IS NULL;

ALTER TABLE hae_ingest_tokens ENABLE ROW LEVEL SECURITY;
```
Output:
`Error: Failed to run sql query: ERROR: 42P07: relation "idx_hae_tokens_active" already exists`

The index already existed from a prior attempt. Harmless. You can skip that statement and run the rest:
```sql
ALTER TABLE hae_ingest_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own hae tokens"
  ON hae_ingest_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```
Output:
`Success. No rows returned`
Then the seed INSERT. But first — critical heads up:
C1 asks you to INSERT a fresh token. Before you do that, generate one in your terminal:
```bash
openssl rand -hex 32
```
Copy that value. Use it in the INSERT:
```sql
INSERT INTO hae_ingest_tokens (token, user_id, label)
VALUES (
  'PASTE_YOUR_GENERATED_TOKEN_HERE',
  'a5dafd53-74d9-4492-9b60-944cfdf5d336',
  'Primary iPhone (Ben)'
);
```
⚠️ Don't share the token. Just the verification output:
```sql
SELECT user_id, label, created_at, revoked_at FROM hae_ingest_tokens;
```
Expected: 1 row, `revoked_at` is NULL.
output:
| user_id                              | label                | created_at                    | revoked_at |
| ------------------------------------ | -------------------- | ----------------------------- | ---------- |
| a5dafd53-74d9-4492-9b60-944cfdf5d336 | Primary iPhone (Ben) | 2026-04-20 13:15:53.502279+00 | null       |

```sql
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
output:
| policyname               | roles    | cmd |
| ------------------------ | -------- | --- |
| Users see own hae tokens | {public} | ALL |

**VERIFY:**

```sql
SELECT user_id, label, created_at, revoked_at
FROM hae_ingest_tokens;
-- Expect: 1 row, revoked_at NULL
```
| user_id                              | label                | created_at                    | revoked_at |
| ------------------------------------ | -------------------- | ----------------------------- | ---------- |
| a5dafd53-74d9-4492-9b60-944cfdf5d336 | Primary iPhone (Ben) | 2026-04-20 13:15:53.502279+00 | null       |
✅ Done with some troubleshooting and extra tasks included in above.

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
Output:
| t        | null_users |
| -------- | ---------- |
| metrics  | 0          |
| workouts | 0          |
| other    | 0          |
✅ Done

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
Output:
| conname                                     | pg_get_constraintdef                       |
| ------------------------------------------- | ------------------------------------------ |
| staging_hae_metrics_unique                  | UNIQUE (metric_name, date)                 |
| staging_hae_metrics_user_metric_date_key    | UNIQUE (user_id, metric_name, date)        |
| staging_hae_workouts_unique                 | UNIQUE (workout_name, start_time)          |
| staging_hae_workouts_user_workout_start_key | UNIQUE (user_id, workout_name, start_time) |

✅ Done

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

✅ Done

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

 ✅ Done

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

✅ Done

✅ C6 done. Phase C complete.
Phase C recap (multi-user foundation shipped):

- C1 ✅ hae_ingest_tokens table + seed token
- C2 ✅ user_id added to all 3 staging tables
- C3 ✅ Per-user unique constraints on staging
- R-C1 ✅ ingest-hae edge function token-based auth (via Claude Code)
- C4 ✅ sync_hae_to_production() rewritten for multi-user + audit log + per-user error handling
- C5 ✅ (no-op — never had the bug; redundant indexes cleaned up as bonus)
- C6 ✅ Hardcoded UUID defaults dropped

Plus added during the session:

sync_audit_log table (new, fills gap that F2 will later complete)
Duplicate index cleanup on health_metrics_daily (bonus D4 progress)

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
