# HealthFit → Supabase Sync: Edge Function Implementation Plan

> **Purpose of this document:** Provide everything an AI coding agent (Codex,
> Claude Code) needs to implement the full sync pipeline with zero ambiguity.
> Every table, every column mapping, every function signature is specified.
> `TODO(human)` markers indicate values only the project owner can supply.

---

## 1. Architecture

```
HealthFit (iPhone)
    │ daily auto-export (configured once)
    ▼
Google Sheets (2 files)
    ┌─ Health_Metrics_v5  (tabs: Daily Metrics, Weight)
    └─ Workouts_v5        (tabs: Workouts)
    │
    │  Google Sheets API v4 (read-only, service account)
    ▼
Supabase Edge Function  "sync-healthfit"
    │  runs daily at 06:00 UTC via pg_cron
    │  reads only rows newer than last synced date
    ▼
Supabase Tables
    ┌─ health_metrics_daily   (daily vitals)
    ├─ exercise_events        (individual workouts)
    └─ health_metrics_body    (weight / body comp)
    │
    │  queried by
    ▼
React UI (fl-moodtracker)
    uses: v_daily_activity view, exercise_events, getDailyActivityRange()
```

---

## 2. Prerequisites (human actions, not automated)

### 2a. Google Service Account

1. Google Cloud Console → create project (or reuse existing).
2. Enable **Google Sheets API**.
3. Create **Service Account** → download JSON key.
4. Share both Google Sheets with the service account email as **Viewer**.
5. Store the full JSON key as a Supabase secret (see §6).

### 2b. HealthFit app config

In HealthFit iPhone settings, set export targets to exactly these two files
and stop creating new versioned files:

- `Health_Metrics_v5`
- `Workouts_v5`

---

## 3. Supabase Secrets

Store in **Supabase Dashboard → Settings → Edge Functions → Secrets**:

| Secret name                    | Value                                              |
| ------------------------------ | -------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_JSON`  | Full JSON key file contents (the entire file)      |
| `HEALTH_SHEET_ID`              | `TODO(human)` — the ID from the Google Sheets URL  |
| `WORKOUTS_SHEET_ID`            | `TODO(human)` — the ID from the Google Sheets URL  |
| `SYNC_USER_ID`                 | `TODO(human)` — your Supabase `auth.users` UUID    |

> **How to get a Sheet ID:** from `https://docs.google.com/spreadsheets/d/{THIS_PART}/edit`

---

## 4. Database Schema (SQL migrations)

Run these in order in the Supabase SQL Editor. Each block is idempotent.

### Migration 1: `health_metrics_daily` — add missing columns

```sql
-- Ensure all v5 columns exist
ALTER TABLE health_metrics_daily
  ADD COLUMN IF NOT EXISTS active_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS resting_energy_kcal NUMERIC,
  ADD COLUMN IF NOT EXISTS resting_heart_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS hrv NUMERIC,
  ADD COLUMN IF NOT EXISTS steps NUMERIC,
  ADD COLUMN IF NOT EXISTS vo2max NUMERIC,
  ADD COLUMN IF NOT EXISTS exercise_time_minutes NUMERIC,
  ADD COLUMN IF NOT EXISTS stand_hours NUMERIC;

-- Ensure unique constraint exists for upsert
-- (date alone may already be unique — check first; if user_id+date is the
--  pattern used elsewhere, use that)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'health_metrics_daily_user_date'
  ) THEN
    ALTER TABLE health_metrics_daily
      ADD CONSTRAINT health_metrics_daily_user_date UNIQUE (user_id, date);
  END IF;
END $$;
```

### Migration 2: `exercise_events` — full table with all v5 columns

> **NOTE:** If the table already exists but is empty, it may be simpler to
> drop and recreate. If it has data, use `ADD COLUMN IF NOT EXISTS` instead.

```sql
CREATE TABLE IF NOT EXISTS exercise_events (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- identity / timing
  workout_type   TEXT NOT NULL,          -- e.g. 'Running', 'Strength Training'
  workout_date   DATE NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- distance / movement
  distance_km    NUMERIC,
  elevation_gain_m NUMERIC,

  -- energy
  active_energy_kcal NUMERIC,
  total_energy_kcal  NUMERIC,

  -- heart rate
  avg_heart_rate NUMERIC,
  max_heart_rate NUMERIC,

  -- HR zones (seconds spent in each zone)
  hr_zone_type   TEXT,                   -- e.g. 'Default' or custom zone name
  hrz0_seconds   INTEGER DEFAULT 0,
  hrz1_seconds   INTEGER DEFAULT 0,
  hrz2_seconds   INTEGER DEFAULT 0,
  hrz3_seconds   INTEGER DEFAULT 0,
  hrz4_seconds   INTEGER DEFAULT 0,
  hrz5_seconds   INTEGER DEFAULT 0,

  -- training load
  trimp          NUMERIC,
  mets           NUMERIC,
  rpe            NUMERIC,

  -- conditions
  temperature    NUMERIC,
  humidity       NUMERIC,

  -- meta
  source         TEXT DEFAULT 'healthfit',
  updated_at     TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT exercise_events_unique_workout
    UNIQUE (user_id, workout_date, started_at)
);

ALTER TABLE exercise_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own exercise events" ON exercise_events
  FOR ALL USING (auth.uid() = user_id);
```

### Migration 3: `health_metrics_body`

```sql
CREATE TABLE IF NOT EXISTS health_metrics_body (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  weight_kg      NUMERIC,
  body_fat_pct   NUMERIC,
  bmi            NUMERIC,
  source         TEXT DEFAULT 'healthfit',
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

ALTER TABLE health_metrics_body ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own body metrics" ON health_metrics_body
  FOR ALL USING (auth.uid() = user_id);
```

### Migration 4: `sync_log` — track every sync run

```sql
CREATE TABLE IF NOT EXISTS sync_log (
  id             BIGSERIAL PRIMARY KEY,
  run_at         TIMESTAMPTZ DEFAULT NOW(),
  sheet_name     TEXT NOT NULL,           -- 'health_metrics' | 'workouts' | 'body'
  rows_fetched   INTEGER DEFAULT 0,
  rows_upserted  INTEGER DEFAULT 0,
  error_message  TEXT,
  duration_ms    INTEGER
);
```

### Migration 5: Update `v_daily_activity` view (if needed)

```sql
-- TODO(human): Paste the current view definition here so the agent can
-- verify it includes hrv, vo2max, stand_hours. If not, update it.
-- Example expected shape:
--
-- CREATE OR REPLACE VIEW v_daily_activity AS
-- SELECT
--   hmd.date,
--   hmd.active_energy_kcal,
--   hmd.resting_energy_kcal,
--   hmd.resting_heart_rate,
--   hmd.hrv,
--   hmd.vo2max,
--   hmd.steps,
--   hmd.exercise_time_minutes,
--   hmd.stand_hours,
--   COALESCE(ex.workout_count, 0) AS workout_count,
--   COALESCE(ex.total_exercise_kcal, 0) AS total_exercise_kcal
-- FROM health_metrics_daily hmd
-- LEFT JOIN (
--   SELECT workout_date, COUNT(*) AS workout_count,
--          SUM(active_energy_kcal) AS total_exercise_kcal
--   FROM exercise_events
--   GROUP BY workout_date
-- ) ex ON ex.workout_date = hmd.date
-- WHERE hmd.user_id = auth.uid();
```

---

## 5. Column Mappings (Google Sheet → Supabase)

These are the **exact** header names from the exported Google Sheets.
Headers may have leading/trailing whitespace — always `.trim()` before matching.

### 5a. Health_Metrics_v5 → tab "Daily Metrics" → `health_metrics_daily`

| Sheet header (trimmed)   | Supabase column            | Type    | Parse notes                        |
| ------------------------ | -------------------------- | ------- | ---------------------------------- |
| `Date`                   | `date`                     | DATE    | May be `=DATE(y,m,d)` formula — see §8 |
| `Active Energy (kcal)`   | `active_energy_kcal`       | NUMERIC | Plain number                       |
| `Resting Energy (kcal)`  | `resting_energy_kcal`      | NUMERIC | Plain number                       |
| `Resting Heart Rate (bpm)` | `resting_heart_rate`     | NUMERIC | Plain number                       |
| `HRV (ms)`               | `hrv`                      | NUMERIC | Plain number                       |
| `Steps (count)`          | `steps`                    | NUMERIC | Plain number                       |
| `VO2max (mL/min·kg)`     | `vo2max`                   | NUMERIC | Plain number                       |
| `Exercise Time (min)`    | `exercise_time_minutes`    | NUMERIC | Plain number or `HH:MM:SS` string  |
| `Stand Hours (hr)`       | `stand_hours`              | NUMERIC | Plain number                       |

> **TODO(human):** Open Health_Metrics_v5 → Daily Metrics tab in a browser.
> Copy the exact header row here and verify these names match. The names
> above are best guesses based on typical HealthFit exports. If any differ,
> update this table. The agent will use this table to build the column map.

### 5b. Health_Metrics_v5 → tab "Weight" → `health_metrics_body`

| Sheet header (trimmed) | Supabase column    | Type    | Parse notes          |
| ---------------------- | ------------------ | ------- | -------------------- |
| `Date`                 | `date`             | DATE    | Same date parsing    |
| `Weight (kg)`          | `weight_kg`        | NUMERIC |                      |
| `Body Fat (%)`         | `body_fat_pct`     | NUMERIC | May be absent        |
| `BMI`                  | `bmi`              | NUMERIC | May be absent        |

> **TODO(human):** Same — verify exact header names from the Weight tab.

### 5c. Workouts_v5 → tab "Workouts" → `exercise_events`

| Sheet header (trimmed)       | Supabase column        | Type         | Parse notes                          |
| ---------------------------- | ---------------------- | ------------ | ------------------------------------ |
| `Date`                       | `workout_date`         | DATE         | Same date parsing                    |
| `Start`                      | `started_at`           | TIMESTAMPTZ  | ISO or `HH:MM` — combine with Date  |
| `End`                        | `ended_at`             | TIMESTAMPTZ  | ISO or `HH:MM` — combine with Date  |
| `Type`                       | `workout_type`         | TEXT         |                                      |
| `Duration`                   | `duration_seconds`     | INTEGER      | Likely `HH:MM:SS` → convert to secs |
| `Distance (km)`              | `distance_km`          | NUMERIC      |                                      |
| `Active Energy (kcal)`       | `active_energy_kcal`   | NUMERIC      |                                      |
| `Total Energy (kcal)`        | `total_energy_kcal`    | NUMERIC      |                                      |
| `Avg Heart Rate (bpm)`       | `avg_heart_rate`       | NUMERIC      |                                      |
| `Max Heart Rate (bpm)`       | `max_heart_rate`       | NUMERIC      |                                      |
| `Elevation Ascended (m)`     | `elevation_gain_m`     | NUMERIC      |                                      |
| `Temperature (°C)`           | `temperature`          | NUMERIC      |                                      |
| `Humidity (%)`               | `humidity`             | NUMERIC      |                                      |
| `HR Zone Type`               | `hr_zone_type`         | TEXT         |                                      |
| `HR Zone 0 (s)`              | `hrz0_seconds`         | INTEGER      | May be `HH:MM:SS` → convert to secs |
| `HR Zone 1 (s)`              | `hrz1_seconds`         | INTEGER      | Same                                 |
| `HR Zone 2 (s)`              | `hrz2_seconds`         | INTEGER      | Same                                 |
| `HR Zone 3 (s)`              | `hrz3_seconds`         | INTEGER      | Same                                 |
| `HR Zone 4 (s)`              | `hrz4_seconds`         | INTEGER      | Same                                 |
| `HR Zone 5 (s)`              | `hrz5_seconds`         | INTEGER      | Same                                 |
| `TRIMP`                      | `trimp`                | NUMERIC      |                                      |
| `METs`                       | `mets`                 | NUMERIC      |                                      |
| `RPE`                        | `rpe`                  | NUMERIC      |                                      |

> **TODO(human):** Same — verify exact header names from the Workouts tab.
> Some HealthFit versions use slightly different names (e.g. `Elevation Gain`
> vs `Elevation Ascended`). Get the exact row 1 values.

---

## 6. Edge Function: `supabase/functions/sync-healthfit/index.ts`

### 6a. Runtime constraints

- **Runtime:** Deno (Supabase Edge Functions run on Deno Deploy)
- **No npm packages.** Use only:
  - `https://esm.sh/@supabase/supabase-js@2` — Supabase client
  - `https://deno.land/x/jose@v5.2.0/index.ts` — JWT signing (for Google auth)
- **Do NOT use** `google-auth-library`, `googleapis`, or any Node-only package.
- **Max execution time:** 150 seconds (plenty for <100 rows).

### 6b. Google Sheets API authentication (JWT)

The function must hand-craft a JWT to get a Google access token. Here is the
exact pattern to follow:

```typescript
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(await importPKCS8(sa.private_key, "RS256"));

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}
```

### 6c. Reading a Google Sheet tab

```typescript
async function fetchSheetRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,        // e.g. "Daily Metrics"
  range: string = "A:Z"   // fetch all columns
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Sheets API error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.values ?? [];
}
```

> **IMPORTANT:** The Google Sheets API does NOT support server-side row
> filtering. The function fetches ALL rows from the tab, then filters
> client-side to rows where the date column is > `lastSyncedDate`.
> For a sheet with ~1,500 rows this is still fast (<2s).

### 6d. Row parsing and normalization

The agent must implement these normalizer functions:

```typescript
// 1. Trim all header names
// 2. Build a map: { trimmedHeader: columnIndex }
// 3. For each data row, produce an object using the column mapping from §5

function parseDate(value: string | number): string | null {
  // Handle: "2024-03-15", "03/15/2024", "=DATE(2024,3,15)", Google serial number
  // Return: "YYYY-MM-DD" string or null
}

function parseDuration(value: string | number): number | null {
  // Handle: "01:23:45" → 5025, "45:30" → 2730, raw seconds number
  // Return: integer seconds or null
}

function parseNumeric(value: string | number): number | null {
  // Handle: "", " ", "N/A", null, undefined → null
  // Handle: "1,234.5" → 1234.5
  // Return: number or null
}

function parseTimestamp(dateStr: string, timeStr: string): string | null {
  // Combine a date ("2024-03-15") and time ("14:30" or "14:30:00")
  // Return: ISO 8601 timestamp string or null
}
```

### 6e. Incremental sync logic

```typescript
// For each table, find the last synced date:
const { data: latest } = await supabase
  .from('health_metrics_daily')  // or 'exercise_events', 'health_metrics_body'
  .select('date')                // or 'workout_date' for exercise_events
  .eq('user_id', userId)
  .order('date', { ascending: false })  // or 'workout_date'
  .limit(1);

const lastDate = latest?.[0]?.date ?? '2020-01-01';

// Then filter fetched rows: keep only rows where parsedDate > lastDate
```

### 6f. Upsert pattern

```typescript
// health_metrics_daily
const { error } = await supabase
  .from('health_metrics_daily')
  .upsert(rows.map(r => ({ ...r, user_id: userId })), {
    onConflict: 'user_id,date',
  });

// exercise_events
const { error } = await supabase
  .from('exercise_events')
  .upsert(rows.map(r => ({ ...r, user_id: userId })), {
    onConflict: 'user_id,workout_date,started_at',
  });

// health_metrics_body
const { error } = await supabase
  .from('health_metrics_body')
  .upsert(rows.map(r => ({ ...r, user_id: userId })), {
    onConflict: 'user_id,date',
  });
```

### 6g. Sync logging

After each sheet sync, write a row to `sync_log`:

```typescript
await supabase.from('sync_log').insert({
  sheet_name: 'health_metrics',  // or 'workouts', 'body'
  rows_fetched: allRows.length,
  rows_upserted: newRows.length,
  error_message: error?.message ?? null,
  duration_ms: Date.now() - startTime,
});
```

### 6h. Top-level function structure

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const userId = Deno.env.get("SYNC_USER_ID")!;
    const accessToken = await getGoogleAccessToken(
      Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!
    );

    // 1. Sync Daily Metrics → health_metrics_daily
    await syncSheet({
      supabase, accessToken, userId,
      spreadsheetId: Deno.env.get("HEALTH_SHEET_ID")!,
      tabName: "Daily Metrics",
      tableName: "health_metrics_daily",
      dateColumn: "date",
      columnMap: DAILY_METRICS_COLUMN_MAP,  // from §5a
    });

    // 2. Sync Weight → health_metrics_body
    await syncSheet({
      supabase, accessToken, userId,
      spreadsheetId: Deno.env.get("HEALTH_SHEET_ID")!,
      tabName: "Weight",
      tableName: "health_metrics_body",
      dateColumn: "date",
      columnMap: WEIGHT_COLUMN_MAP,  // from §5b
    });

    // 3. Sync Workouts → exercise_events
    await syncSheet({
      supabase, accessToken, userId,
      spreadsheetId: Deno.env.get("WORKOUTS_SHEET_ID")!,
      tabName: "Workouts",
      tableName: "exercise_events",
      dateColumn: "workout_date",
      columnMap: WORKOUTS_COLUMN_MAP,  // from §5c
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("sync-healthfit error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
```

### 6i. Error handling requirements

- If Google auth fails → log to `sync_log` with error, return 500.
- If one sheet fails → log the error, continue to next sheet. Don't abort.
- If upsert partially fails → log error with the rows that failed.
- The function must never throw an unhandled exception (wrap everything in try/catch).

---

## 7. Scheduling (Cron)

### Option A: pg_cron (production — recommended)

Run once in SQL Editor after deploying the Edge Function:

```sql
SELECT cron.schedule(
  'sync-healthfit-daily',
  '0 6 * * *',   -- 06:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/sync-healthfit',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

> **TODO(human):** Replace `<YOUR_PROJECT_REF>` with your actual Supabase
> project reference (from Dashboard → Settings → API).

### Option B: Manual trigger (for testing)

```bash
curl -X POST https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/sync-healthfit \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
```

### NOT recommended: config.toml

`config.toml` cron only works in local Supabase CLI dev mode. Do not rely on
it for production scheduling.

---

## 8. Data Parsing Edge Cases

These are known HealthFit export quirks the normalizer MUST handle:

| Issue | Example input | Expected output | How to handle |
|-------|---------------|-----------------|---------------|
| `=DATE()` formula as string | `=DATE(2024,3,15)` | `"2024-03-15"` | Regex: `/^=DATE\((\d+),(\d+),(\d+)\)$/` → extract y,m,d |
| Empty string instead of null | `""` or `" "` | `null` | Trim, if empty → null |
| Header whitespace | `" Date "` | `"Date"` | `.trim()` all headers |
| Duration as `HH:MM:SS` | `"01:23:45"` | `5025` (seconds) | Split on `:`, calc seconds |
| Duration as `MM:SS` | `"45:30"` | `2730` (seconds) | If 2 parts: `min*60 + sec` |
| Google Sheets serial date | `45366` (number) | `"2024-03-15"` | `new Date(Date.UTC(1899,11,30) + value * 86400000)` |
| Time without date | `"14:30"` | needs date column | Combine with row's Date to make timestamp |
| Comma in numbers | `"1,234"` | `1234` | Strip commas before parseFloat |

---

## 9. Historical Data Migration (one-time, separate from Edge Function)

This is a **local Python script**, not part of the Edge Function.

### Purpose
Backfill all historical data from old `.xlsx` export files (v3, v4, etc.)
directly into Supabase. Avoids hitting the Google Sheets API entirely.

### Script: `scripts/backfill_historical.py`

```
Input:  Directory of .xlsx files (all versions)
Output: Upserted rows in health_metrics_daily, exercise_events, health_metrics_body

Steps:
1. Read all .xlsx files with openpyxl or pandas
2. Normalize column names to match the Supabase schema (same mappings as §5)
3. Deduplicate by date (last-write-wins if same date appears in multiple files)
4. Upsert to Supabase via the REST API (supabase-py client)
5. Print summary: rows per table, any parse errors
```

### Dependencies
```
pip install pandas openpyxl supabase
```

### Environment variables
```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
SYNC_USER_ID=<uuid>
```

---

## 10. Build Order (for the implementing agent)

Each step is a **separate PR / commit**. Do not combine steps.

| Step | What to do | Depends on | Verification |
|------|-----------|------------|--------------|
| 1 | Run SQL migrations 1–4 from §4 | Nothing | Check tables exist in Supabase Dashboard |
| 2 | Write the Edge Function `sync-healthfit/index.ts` per §6 | Step 1 | Deploys without error |
| 3 | Deploy Edge Function: `supabase functions deploy sync-healthfit` | Step 2 | Shows in Dashboard → Edge Functions |
| 4 | Manual trigger test (§7 Option B) | Steps 1–3 + secrets set | Check `sync_log` for success row |
| 5 | Inspect upserted data | Step 4 | Query tables, verify row count and values |
| 6 | Set up pg_cron schedule (§7 Option A) | Step 5 confirms it works | Verify next morning |
| 7 | Update `v_daily_activity` view if needed (§4 Migration 5) | Step 5 | UI shows new columns |
| 8 | Write historical backfill script (§9) | Step 1 | Old data appears in tables |

---

## 11. File Structure

```
supabase/
├── functions/
│   └── sync-healthfit/
│       └── index.ts          ← the Edge Function (§6)
├── migrations/
│   ├── 001_health_metrics_daily_columns.sql   ← §4 Migration 1
│   ├── 002_exercise_events.sql                ← §4 Migration 2
│   ├── 003_health_metrics_body.sql            ← §4 Migration 3
│   ├── 004_sync_log.sql                       ← §4 Migration 4
│   └── 005_v_daily_activity_view.sql          ← §4 Migration 5
scripts/
└── backfill_historical.py    ← §9 (one-time migration)
```

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google auth fails silently | No data synced, no error visible | Always check `access_token` exists; log to `sync_log` |
| Sheet header names changed by HealthFit update | Column mapping breaks | Log unmapped headers as warnings; don't crash |
| Sheets API returns all rows (no server-side filter) | Slow on large sheets | Client-side date filter; only upsert new rows |
| `=DATE()` formula not caught | Date parsing fails → row skipped | Regex parser as first-pass before standard Date.parse |
| Edge Function timeout (150s) | Partial sync | Sync each sheet independently; log progress |
| Duplicate `started_at` for same day (two runs?) | Unique constraint violation | The constraint is `(user_id, workout_date, started_at)` — genuinely different workouts will have different start times |
| `jose` library version breaks | Import fails | Pin exact version: `jose@v5.2.0` |
| Supabase service role key in pg_cron | Security concern | Service role key is already server-side only; pg_cron runs in trusted context |

---

## 13. TODO(human) Checklist

Before handing this to an agent, fill in:

- [ ] Exact header names from Health_Metrics_v5 → Daily Metrics tab (row 1)
- [ ] Exact header names from Health_Metrics_v5 → Weight tab (row 1)
- [ ] Exact header names from Workouts_v5 → Workouts tab (row 1)
- [ ] `HEALTH_SHEET_ID` value
- [ ] `WORKOUTS_SHEET_ID` value
- [ ] `SYNC_USER_ID` value
- [ ] Current `v_daily_activity` view definition (run `\d+ v_daily_activity` or check Dashboard)
- [ ] Supabase project ref for pg_cron URL
- [ ] Confirm `exercise_events` table is empty (safe to CREATE) or has data (need ALTER)
