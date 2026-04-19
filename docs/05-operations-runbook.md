# Pulse — Operations Runbook

_Last updated: 2026-04-19_

A playbook for diagnosing and fixing problems with the Pulse data
pipeline. Optimized for "I see symptom X, what do I do right now?"
rather than reading cover-to-cover.

For background architecture see `01-architecture.md`; for the tables,
functions, and cron jobs referenced below see `02-database-schema.md`
and `03-functions-and-cron.md`.

## How to use this doc

1. Find your symptom in the [symptom index](#symptom-index).
2. Jump to the matching section. Each incident section has: signs,
   likely causes, diagnostic queries, and fix steps.
3. If no match, start with the [baseline health check](#baseline-health-check)
   to see which layer is broken.

---

## Symptom index

| If you're seeing… | Go to |
|---|---|
| Data in the UI hasn't updated in a while | [HAE isn't pushing](#incident-hae-isnt-pushing) |
| Running `sync_hae_to_production()` manually times out | [Manual sync times out](#incident-manual-sync-times-out) |
| Sleep sync errors with "cannot affect row a second time" | [Sleep dedup error](#incident-sleep-dedup-error) |
| Cron says "succeeded" but data isn't in production | [Silent no-op sync](#incident-silent-no-op-sync) |
| UI daily total ≠ iPhone Health total | [Date-bucketing mismatch](#incident-date-bucketing-mismatch) |
| SQL Editor queries on views return zero rows | [auth.uid() is NULL in editor](#incident-authuid-is-null-in-editor) |
| HAE is sending a new metric type but it's not showing up | [Unknown data type in staging_hae_other](#incident-unknown-data-type) |
| Body metrics (weight, BMI, body fat) look stale | [Body metrics not syncing](#incident-body-metrics-not-syncing) |
| Need to force-reprocess a specific day | [Force reprocess a date](#routine-force-reprocess) |

---

## Baseline health check

Run this when something feels off but you don't know where. Each query
checks one layer of the pipeline.

```sql
-- 1. Is HAE still pushing? (should be within the last hour during waking hours)
SELECT MAX(received_at) AS last_hae_push
FROM staging_hae_metrics;

-- 2. Is the cron job active and recent?
SELECT jobname, schedule, active 
FROM cron.job 
WHERE jobname = 'sync-hae-to-production';

SELECT start_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'sync-hae-to-production')
ORDER BY start_time DESC
LIMIT 3;

-- 3. Is there unprocessed data stuck in staging?
SELECT 
  'staging_hae_metrics'  AS t, COUNT(*) FILTER (WHERE processed_at IS NULL) AS unprocessed
  FROM staging_hae_metrics
UNION ALL SELECT 'staging_hae_workouts', COUNT(*) FILTER (WHERE processed_at IS NULL)
  FROM staging_hae_workouts
UNION ALL SELECT 'staging_hae_other', COUNT(*) FILTER (WHERE processed_at IS NULL)
  FROM staging_hae_other;

-- 4. Does production have today's data?
SELECT date, steps, active_energy_kcal, resting_heart_rate
FROM health_metrics_daily
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336'
  AND date >= CURRENT_DATE - INTERVAL '2 days'
ORDER BY date DESC;
```

**Interpreting the output:**

| Baseline result | What it tells you |
|---|---|
| Q1 `last_hae_push` > 30 min ago during waking hours | HAE stopped pushing → [HAE isn't pushing](#incident-hae-isnt-pushing) |
| Q2 most recent run `status = 'failed'` | Look at `return_message` for the specific error |
| Q3 any non-zero unprocessed count AND cron is succeeding | Function has a silent bug → [Silent no-op sync](#incident-silent-no-op-sync) |
| Q4 today's row missing or stale | Follow the chain upward — check Q3 first, then Q1 |

---

## Incidents

### Incident: HAE isn't pushing

**Signs**
- `MAX(received_at)` in `staging_hae_metrics` is more than ~30 minutes
  old during times you were awake and wearing the Watch
- Edge Function logs show no recent invocations (Supabase Dashboard →
  Edge Functions → `ingest-hae` → Logs)
- Today's data is missing in the UI but yesterday's looks fine

**Most likely cause**
iOS suspended the HAE app. Common triggers:
- User swiped HAE away in the app switcher (iOS marks the app
  user-terminated and stops waking it for background work)
- Background App Refresh disabled for HAE
- Low Power Mode was on last night
- A Focus mode suspended the app

**Fix**
1. On iPhone, open HAE. Just opening the app usually re-fires all
   pending automations within ~30 seconds.
2. Check Automations tab. Cloud icons:
   - 🟢 green = recent success
   - 🟡 yellow = stale / overdue
3. If automations still look stale after 2 minutes, tap each one and
   hit the Update/Run button manually.
4. Verify data landed:
   ```sql
   SELECT MAX(received_at) FROM staging_hae_metrics;
   ```
5. Wait ≤15 min for the next cron tick to promote to production, or
   trigger immediately:
   ```sql
   SELECT sync_hae_to_production();
   ```

**Prevent recurrence**
- Settings → Background App Refresh → ON (global + for HAE)
- Don't swipe HAE away in the app switcher — leave it backgrounded
- Avoid Low Power Mode during long periods
- If in a restrictive Focus mode, allow HAE in the exceptions list

---

### Incident: Manual sync times out

**Signs**
- Running `SELECT sync_hae_to_production();` from SQL Editor fails
  with `canceling statement due to statement timeout` or similar
- The cron-scheduled runs (every 15 min) keep succeeding in 8-10
  seconds

**Why this happens**
The SQL Editor has a per-statement timeout (typically 60s or 2min).
The scheduled cron uses the superuser role which has no such limit.

**Short-term fix**
If you need to run the sync ad-hoc, wait for the next cron tick
instead. Or connect via `psql` with the direct DB URL where you
control timeouts.

**Long-term fix**
If the sync is genuinely getting slow (not just hitting UI timeouts),
it usually means too many unprocessed rows accumulated. Check:
```sql
SELECT COUNT(*) FROM staging_hae_metrics WHERE processed_at IS NULL;
```
If this is > 20k, something upstream broke — the sync function
normally clears within each run. Investigate with the
[Silent no-op sync](#incident-silent-no-op-sync) playbook.

---

### Incident: Sleep dedup error

**Signs**
Running `sync_hae_to_production()` fails with:

```
ERROR: 21000: ON CONFLICT DO UPDATE command cannot affect row a second
time
CONTEXT: SQL statement "INSERT INTO sleep_events ..."
```

**Cause**
Section 6 of the sync function inserts a sleep row per date. If there
are multiple `sleep_analysis` samples or multiple
`apple_sleeping_wrist_temperature` samples for the same local date,
the join produces duplicate insert rows for the same
`(user_id, date)`, and ON CONFLICT can't update the same target row
twice in a single statement.

The current function uses `DISTINCT ON ((s.date AT TIME ZONE v_tz)::date)`
and a correlated subquery for wrist temp to avoid this. But if this
error returns, it means something about the input data broke that
assumption.

**Diagnostic**
```sql
-- Are there multiple sleep_analysis samples per local date?
SELECT 
  (date AT TIME ZONE 'Europe/Madrid')::date AS local_date,
  COUNT(*) AS samples
FROM staging_hae_metrics
WHERE metric_name = 'sleep_analysis'
  AND processed_at IS NULL
GROUP BY (date AT TIME ZONE 'Europe/Madrid')::date
HAVING COUNT(*) > 1;
```

**Fix**
If the function body ever gets reverted to a version without
`DISTINCT ON`, re-apply the current implementation from
`03-functions-and-cron.md § sync_hae_to_production`. The fix pattern
is:
- `SELECT DISTINCT ON ((s.date AT TIME ZONE v_tz)::date) ...`
- Wrist temperature from a correlated subquery with `AVG(qty)`, NOT
  a `LEFT JOIN`.

---

### Incident: Silent no-op sync

**Signs**
- Cron run details show `status = 'succeeded'`
- But production tables haven't been updated for the affected time range
- Staging tables have fresh rows with `received_at` recent
- Yet `COUNT(*) FILTER (WHERE processed_at IS NULL)` is non-zero and
  growing

**Cause**
The function hit an error in one INSERT block, rolled back, but for
some reason the cron run marker didn't reflect failure. More commonly:
the function completed but one branch didn't execute because of a
logic bug (e.g. a guard condition `IF array_length(v_dates, 1) > 0`
where `v_dates` unexpectedly has zero rows).

**Diagnostic**
1. Check for silent function errors:
   ```sql
   SELECT start_time, status, return_message
   FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job 
                  WHERE jobname = 'sync-hae-to-production')
   ORDER BY start_time DESC
   LIMIT 20;
   ```
   Look for any `status = 'failed'` or a `return_message` missing the
   expected format.

2. Manually invoke the function and read the return string:
   ```sql
   SELECT sync_hae_to_production();
   ```
   A healthy response looks like:
   `Synced: N days metrics, N body, N workouts, ... [tz=Europe/Madrid]`
   If any count is 0 when you expect > 0, that's your suspect branch.

3. For the suspect branch, check the relevant staging rows:
   ```sql
   SELECT metric_name, COUNT(*)
   FROM staging_hae_metrics
   WHERE processed_at IS NULL
   GROUP BY metric_name;
   ```

**Fix**
Depends on which branch silently skipped. Usually either:
- The function's `IF` guard rejected the input (e.g. `v_dates` was
  empty because all staging rows were marked processed by a previous
  run — this is healthy)
- The INSERT block's `ON CONFLICT` target constraint doesn't match
  the upsert columns (function raises) — check the sync function
  source for a mismatch against the production table's unique indexes
  (see `02-database-schema.md`).

---

### Incident: Date-bucketing mismatch

**Signs**
- iPhone Health app says Monday = 10,566 steps
- Pulse UI says Monday = 11,672 steps
- The difference looks like it was "borrowed" from a neighboring day

**Cause**
The sync function bucketed a timestamp into the wrong local date. This
happens when user's timezone in `user_preferences.timezone` is
incorrect, or the function hardcodes `UTC` somewhere it shouldn't.

**Diagnostic**
```sql
-- Confirm the user's stored timezone
SELECT user_id, timezone
FROM user_preferences
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336';

-- What does the sync function report for tz?
SELECT sync_hae_to_production();
-- Look for "[tz=Europe/Madrid]" at the end
```

**Fix**
1. If `timezone` is `'UTC'` but should be a real one:
   ```sql
   UPDATE user_preferences
   SET timezone = 'Europe/Madrid'
   WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336';
   ```
   (Use the correct IANA zone name — **not** a `UTC+2` offset, because
   offsets don't track DST.)

2. Force reprocess the affected dates: see
   [Force reprocess a date](#routine-force-reprocess).

---

### Incident: auth.uid() is NULL in editor

**Signs**
```sql
SELECT * FROM v_daily_activity;
-- returns 0 rows
```
…but the frontend shows data for the same user.

**Cause**
Views `v_daily_activity` and many RLS policies filter by
`user_id = auth.uid()`. In the Supabase SQL Editor, there is no
authenticated user session, so `auth.uid()` returns `NULL` and every
filtered row is excluded.

**Fix**
Query the underlying tables with a hardcoded user ID during
debugging:

```sql
-- Instead of this:
SELECT * FROM v_daily_activity;

-- Do this:
SELECT * FROM health_metrics_daily
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336';
```

Or, to spot-check the view's logic without the auth filter, rewrite
it with a hardcoded user ID. Do not modify the actual view — just
copy the SQL from `pg_get_viewdef()` into the editor and replace the
`auth.uid()` call.

---

### Incident: Unknown data type

**Signs**
- HAE starts exporting a new automation type (e.g. a new iOS 19
  metric)
- Rows appear in `staging_hae_other` with a `data_type` like
  `'newThing'` that the sync function doesn't know about
- Those rows never get `processed_at` set

**Diagnostic**
```sql
-- What data_types are sitting unprocessed?
SELECT data_type, COUNT(*) AS pending
FROM staging_hae_other
WHERE processed_at IS NULL
GROUP BY data_type;
```

**Fix**
Options:

1. **Extend the sync function** to handle the new type. Add a new
   INSERT block in section 3/4/5, create a production table if
   needed, update the RETURN message. See the existing
   `state_of_mind` / `ecg` / `heart_rate_notifications` blocks as
   templates.

2. **If you don't want this type**, mark those rows processed so they
   stop accumulating:
   ```sql
   UPDATE staging_hae_other
   SET processed_at = NOW()
   WHERE data_type = 'unwantedType' AND processed_at IS NULL;
   ```
   Or delete them outright. Update the `ingest-hae` Edge Function to
   reject/ignore the type at intake if it should never be stored.

---

### Incident: Body metrics not syncing

**Signs**
- Weight / BMI / body fat in UI is days old
- iPhone Health app shows today's weight correctly
- `staging_hae_metrics` has recent rows for `weight_body_mass`,
  `body_fat_percentage`, `body_mass_index`

**Diagnostic**
```sql
-- Are the body metric samples reaching staging?
SELECT metric_name, MAX(date) AS latest_sample
FROM staging_hae_metrics
WHERE metric_name IN ('weight_body_mass', 'body_fat_percentage', 'body_mass_index')
GROUP BY metric_name;

-- What's in the production table?
SELECT date, weight_kg, body_fat_pct, bmi, updated_at
FROM health_metrics_body
WHERE user_id = 'a5dafd53-74d9-4492-9b60-944cfdf5d336'
ORDER BY date DESC
LIMIT 5;
```

**Likely causes & fixes**

1. **Sync function doesn't have a body-metrics block** (was broken
   this way before 2026-04-19). Re-apply the fix from
   `03-functions-and-cron.md § sync_hae_to_production` — look for
   section 7 (BODY METRICS).

2. **The body-metric staging rows have already been marked processed,
   but the sync block that reads them is broken.** Force reprocess:
   ```sql
   UPDATE staging_hae_metrics
   SET processed_at = NULL
   WHERE metric_name IN ('weight_body_mass', 'body_fat_percentage', 'body_mass_index');
   SELECT sync_hae_to_production();
   ```

---

## Routines

### Routine: Force reprocess a date

Sometimes you need the sync function to re-aggregate data for a
specific day — after a function fix, a timezone change, or a schema
tweak. The pattern is always:

```sql
-- Unmark the relevant staging rows
UPDATE staging_hae_metrics
SET processed_at = NULL
WHERE (date AT TIME ZONE 'Europe/Madrid')::date = '2026-04-18';

-- (Optionally) also unmark any other staging tables for this date
UPDATE staging_hae_workouts
SET processed_at = NULL
WHERE (start_time AT TIME ZONE 'Europe/Madrid')::date = '2026-04-18';

-- Run the sync
SELECT sync_hae_to_production();
```

The sync function re-aggregates the whole date from ALL staging rows
for that date (not just the ones you just unmarked), so the result is
equivalent to "rebuild this date from scratch".

**Reprocess everything in staging:**
```sql
UPDATE staging_hae_metrics  SET processed_at = NULL;
UPDATE staging_hae_workouts SET processed_at = NULL;
UPDATE staging_hae_other    SET processed_at = NULL;
SELECT sync_hae_to_production();
```
Use sparingly — a full reprocess of 9 days of data takes ~10 seconds.

### Routine: Pausing / resuming the sync cron

For migrations or function rewrites:

```sql
-- Pause (actually unschedules; re-create to resume)
SELECT cron.unschedule('sync-hae-to-production');

-- Resume
SELECT cron.schedule(
  'sync-hae-to-production',
  '*/15 * * * *',
  $$SELECT sync_hae_to_production();$$
);
```

The `active` column on `cron.job` can only be toggled with elevated
privileges Supabase doesn't grant — always use
`cron.unschedule` / `cron.schedule` instead.

### Routine: Monitor staging growth

Run every couple of weeks to catch runaway staging tables:

```sql
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS size,
  (SELECT COUNT(*) FROM staging_hae_metrics WHERE processed_at IS NULL) AS metrics_pending,
  (SELECT COUNT(*) FROM staging_hae_workouts WHERE processed_at IS NULL) AS workouts_pending,
  (SELECT COUNT(*) FROM staging_hae_other WHERE processed_at IS NULL) AS other_pending
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'staging_hae_%';
```

Expected steady state:
- Sizes: single-digit MB per table after 30 days of retention
- All `*_pending` columns: near 0 (some small transient backlog is
  normal)

If `workouts` size keeps climbing, check whether GPS routes are being
kept for longer than needed (`route_data` column accounts for the
bulk of size). The `purge_old_staging_rows()` job only runs once a
day, so some buffer is normal.

### Routine: Inspect recent cron runs

```sql
SELECT 
  jobname,
  status,
  return_message,
  start_time,
  EXTRACT(EPOCH FROM (end_time - start_time))::int AS duration_sec
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
ORDER BY start_time DESC
LIMIT 20;
```

Watch for:
- Any `status` ≠ `'succeeded'` → investigate the failure immediately
- `duration_sec` climbing over time → performance regression

---

## Phone-side troubleshooting (HAE on iOS)

### Understanding HAE cloud icons

On the Automations list in HAE:

| Icon | Meaning |
|---|---|
| 🟢 green cloud with ✓ | Last run succeeded recently |
| 🟡 yellow cloud with ↻ | Overdue — scheduled but hasn't run as expected |
| 🔴 red cloud with ✗ | Last run failed |

Yellow doesn't mean failed — it means iOS didn't wake the app at the
scheduled time. Usually fixes itself when you open the app.

### Checking HAE activity logs

Per-automation activity log shows each export attempt and HTTP
response:
- Open HAE → Automations → tap an automation
- Scroll to "View Activity Logs"
- Look for HTTP 4xx/5xx errors. Common ones:
  - `401 Unauthorized` — `HAE_API_KEY` mismatch; rotate and re-enter
    in the automation's Authorization header
  - `413 Payload Too Large` — rare, but means HAE is trying to send a
    huge backfill
  - `500 Internal Server Error` — Edge Function crashed; check Supabase
    logs for the stack trace

### iOS Background App Refresh

Required for HAE to push in the background:

1. Settings → General → Background App Refresh → ON (global)
2. Same screen, scroll to Health Auto Export → ON
3. Settings → Health Auto Export → Background App Refresh → ON

### iOS suspension pitfalls

Ways iOS will silently stop HAE from running:
- **Swiping HAE in the app switcher** — user-terminated apps are not
  woken for background tasks
- **Low Power Mode** — background refresh is suspended
- **Focus modes** — some Focus modes silently suspend apps not on
  the allow list
- **Battery optimization prompts** — iOS sometimes asks "Keep
  refreshing Health Auto Export in background?" — tapping "No"
  persists

### Rotating `HAE_API_KEY`

When you rotate the token (e.g. because it was logged somewhere
sensitive):

1. Supabase Dashboard → Project Settings → Edge Functions → Secrets
   → update `HAE_API_KEY`
2. On iPhone, HAE → Automations → each automation → Headers
3. Find the `Authorization` header (value is `Bearer <token>`)
4. Paste the new token
5. Run the automation once manually to confirm a 200 response
6. Repeat for every automation (Workout / Health metrics / ECG /
   State of mind / Heart rate notification)

The new token is effective immediately on the Edge Function side —
no redeploy needed.

---

## Escalation / where else to look

If nothing in this runbook matches and you're stuck:

1. **Supabase project logs** — Dashboard → Logs → filter by
   service (Edge Functions, Postgres, Auth). Often surfaces errors
   that don't reach other monitoring.
2. **`cron.job_run_details`** for anything scheduled — this is the
   closest thing to a sync audit log we have today.
3. **Raw HAE payloads** — `staging_hae_metrics.raw_payload`,
   `staging_hae_workouts.raw_payload`, `staging_hae_other.raw_payload`
   all preserve the exact JSON HAE sent, useful for diffing against
   what the sync function expects.
4. **`pg_stat_statements`** (if enabled) for surfacing slow queries.
5. **Repo history** — the `supabase/migrations/` folder and function
   source in `supabase/functions/` are versioned, so `git log` on a
   file tells you when a behavior was introduced.

Last-resort escalation: ping the developer / Anthropic-run session
that touched the thing, or re-derive state from the commit that last
worked end-to-end.
