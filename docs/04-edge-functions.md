# Pulse — Edge Functions

_Last updated: 2026-04-19_

Edge Functions are the HTTPS entry points into the Pulse backend. Pulse
currently has exactly **one** Edge Function: `ingest-hae`, which receives
JSON pushes from the Health Auto Export iOS app and writes them to
staging tables for later promotion by `sync_hae_to_production()`.

For surrounding context see `01-architecture.md` and
`03-functions-and-cron.md`.

## Conventions used in this doc

- **🟢 Active** — deployed and in use
- **⚠️ Known issue** — documented problem we haven't fixed yet
- **🔒 Security** — anything that affects auth or data exposure

---

## Deployment

| Property | Value |
|---|---|
| Runtime | Supabase Edge Runtime (Deno v2.1.4 compatible) |
| Region | `eu-west-3` |
| Project ref | `sxawzzcpmiakltfjpzcn` |
| Source | `supabase/functions/ingest-hae/index.ts` in the app repo |
| URL format | `https://{project-ref}.supabase.co/functions/v1/ingest-hae` |

### Secrets (environment variables)

Configured in Supabase Dashboard → Project Settings → Edge Functions → Secrets.

| Secret | Purpose |
|---|---|
| `HAE_API_KEY` | Shared bearer token used to authenticate inbound requests from HAE |
| `SUPABASE_URL` | Auto-provided by Supabase; used to construct a service-role client |
| `SUPABASE_ANON_KEY` | Auto-provided (not used by this function) |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided; used to bypass RLS when writing to staging tables |
| `SUPABASE_DB_URL` | Auto-provided (not used by this function) |

**Rotating `HAE_API_KEY`:** update the secret in Supabase Dashboard,
then update the corresponding value in HAE on the iPhone (Automations
→ each automation → Headers → `Authorization`). The change is
effective immediately for new requests. Any in-flight request using
the old key will get a 401 after rotation.

---

## `ingest-hae` 🟢

### Endpoint

- **URL:** `https://sxawzzcpmiakltfjpzcn.supabase.co/functions/v1/ingest-hae`
- **Method:** `POST` only. Any other method returns `405 Method Not Allowed`.
- **Auth:** `Authorization: Bearer {HAE_API_KEY}` header. Missing or
  wrong key returns `401 Unauthorized`.
- **Content-Type:** `application/json`.
- **Request body:** HAE's standard JSON export format. See
  [payload shape](#payload-shape).
- **Response body (200):** `{ success, metrics_inserted, workouts_inserted, other_inserted }`.
- **Response body (error):** `{ error: "..." }`.

### Responsibilities

In order per request:

1. **Validate method.** Reject non-POST with 405.
2. **Validate auth.** Compare the bearer token against `HAE_API_KEY`.
   Reject mismatches with 401.
3. **Parse JSON body.** HAE wraps the export in `{ data: {...} }`, so
   the handler accepts either shape: `payload = body?.data ?? body`.
4. **Fan out into three staging tables:**
   - `payload.metrics` → `staging_hae_metrics`
   - `payload.workouts` → `staging_hae_workouts`
   - everything else → `staging_hae_other` (with `data_type` set to
     the top-level key name, e.g. `stateOfMind`, `ecg`,
     `heartRateNotifications`)
5. **Return counts.** 200 response with how many rows were inserted
   per table.

### Payload shape

HAE posts a JSON object with (optionally) these top-level keys:

```json
{
  "data": {
    "metrics": [
      {
        "name": "step_count",
        "units": "count",
        "data": [
          { "date": "2026-04-19 10:00:00 +0200", "qty": 42 },
          { "date": "2026-04-19 10:05:00 +0200", "qty": 18 }
        ]
      },
      ...
    ],
    "workouts": [
      {
        "name": "Walking",
        "start": "2026-04-19 09:00:00 +0200",
        "end": "2026-04-19 09:45:00 +0200",
        "duration": 2700,
        "activeEnergyBurned": { "qty": 450, "units": "kJ" },
        "distance": { "qty": 3.2, "units": "km" },
        "avgHeartRate": { "qty": 95 },
        "maxHeartRate": { "qty": 128 },
        "route": [ { "latitude": ..., "longitude": ..., ... } ]
      }
    ],
    "stateOfMind": [ ... ],
    "ecg": [ ... ],
    "heartRateNotifications": [ ... ]
  }
}
```

Any top-level key other than `metrics` or `workouts` is routed to
`staging_hae_other` with the key name stored in `data_type`. This
makes the endpoint schemaless in practice — new HAE data types
arrive as new `data_type` values without code changes — but means
unexpected or typo'd keys silently become `staging_hae_other` rows.

### Write behavior

**Metrics** — row-per-data-point. For each metric in `payload.metrics`,
each element of its `data` array becomes one row in
`staging_hae_metrics`:

```javascript
const rows = dataPoints.map(dp => ({
  metric_name: name,
  metric_units: units,
  date: dp.date ?? dp.startDate ?? null,
  qty: dp.qty ?? dp.Avg ?? null,
  raw_payload: dp,
}));
supabase.from("staging_hae_metrics")
  .upsert(rows, { onConflict: "metric_name,date" });
```

The `onConflict` clause silently overwrites if a row with the same
`(metric_name, date)` already exists. This is normally harmless
(HAE re-sending the same sample) but means we cannot distinguish
"HAE retried" from "HAE reported a different qty for the same
timestamp".

**Workouts** — one `upsert` per workout, not batched:

```javascript
supabase.from("staging_hae_workouts")
  .upsert([row], { onConflict: "workout_name,start_time" });
```

N workouts → N database round trips. Fine for typical HAE pushes
(1 workout at a time) but worth knowing for heavy-use scenarios.

**Other** — plain `insert` (not upsert):

```javascript
supabase.from("staging_hae_other")
  .insert({ data_type: key, raw_payload: item });
```

HAE retries produce duplicate rows in `staging_hae_other`. The sync
function deduplicates with `DISTINCT ON` before promoting to
production tables, so duplicates here don't leak into
`state_of_mind` / `ecg_readings` / etc. — they just burn staging
rows.

### Error handling

Errors at individual row inserts are logged via `console.error` and
skipped; the request continues processing other rows. The overall
handler has a `try/catch` that returns `500` with an error body if
JSON parsing or the Supabase client setup fails.

This means:

- A partial push (some rows succeed, some fail) returns **200**. HAE
  sees success and won't retry the failed rows.
- The only way a partial push is detectable is by comparing HAE's
  known counts against the `metrics_inserted` / `workouts_inserted`
  / `other_inserted` counts in the response — HAE does not compare.

**🔒 Observability note:** `console.error` output is visible in
Supabase Dashboard → Edge Functions → `ingest-hae` → Logs.
`console.log` from the success path is also there. These logs have a
retention window (typically 7 days on Supabase's default tier).

### Performance

Typical HAE push: tens to a few hundred metric data points, 0-1
workouts, 0-3 "other" items. Function completes in a few hundred ms.

The function is stateless — Deno spins up a fresh Edge Runtime
worker per request (`boot_time` in the shutdown log). Cold starts
add ~100-500 ms. Supabase re-uses the worker for subsequent requests
within a short window.

### Known issues

**⚠️ 🔒 1. API key logged in cleartext.** The function logs the full
`HAE_API_KEY` and the received token to Edge Function logs:

```javascript
console.log("apiKey from env:", apiKey ? `"${apiKey}" (len=${apiKey.length})` : "NOT SET");
console.log("token from header:", `"${token}" (len=${token.length})`);
```

Anyone with read access to the Edge Function logs can read the token.
These were likely left in from initial setup debugging. **Fix: delete
these three `console.log` lines** (they add no production value since
a mismatch is already handled by the 401 path).

**⚠️ 2. Shared API key, no per-user identity.** A single
`HAE_API_KEY` authenticates all inbound requests. The function has no
way to tell which user sent a payload; staging rows are written
without a `user_id` column and the sync function defaults everything
to the hardcoded test user. Multi-user support requires replacing
this with per-user tokens. See `01-architecture.md § Future work`.

**⚠️ 3. 200 OK on partial failures.** Individual row insert errors
are swallowed. HAE interprets 200 as "everything got through" and
won't re-send. Fix would be to track any error and return 207 /
partial-success semantics, or to fail the whole request if any insert
errors.

**⚠️ 4. No payload size limit.** HAE could POST an arbitrarily large
export (e.g. a first-time backfill of years of data). Supabase Edge
Runtime has default memory limits (~150 MB), and bodies beyond that
will fail the request with a generic 500. No graceful "too large"
handling.

**⚠️ 5. Schemaless "other" routing.** Any top-level key that isn't
`metrics` or `workouts` lands in `staging_hae_other`. If HAE adds a
new export type (or a typo in config), we get unexpected `data_type`
values that may not be handled by the sync function — they'd sit in
staging forever.

### Testing manually

Quick curl check from a local machine:

```bash
API_KEY="your-key-here"
PROJECT_REF="sxawzzcpmiakltfjpzcn"

curl -X POST "https://${PROJECT_REF}.supabase.co/functions/v1/ingest-hae" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "metrics": [
        {
          "name": "step_count",
          "units": "count",
          "data": [
            {"date": "2026-04-19 10:00:00 +0000", "qty": 42}
          ]
        }
      ]
    }
  }'
```

Expected response:

```json
{"success":true,"metrics_inserted":1,"workouts_inserted":0,"other_inserted":0}
```

Then verify in SQL:

```sql
SELECT * FROM staging_hae_metrics
ORDER BY received_at DESC LIMIT 5;
```

---

## Appendix: full source

As of 2026-04-19. File path in repo: `supabase/functions/ingest-hae/index.ts`.

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Custom API key auth
  const apiKey = Deno.env.get("HAE_API_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  // ⚠️ SECURITY: the next three console.log lines leak the API key
  // into Edge Function logs. They should be deleted. See Known issues.
  console.log("apiKey from env:", apiKey ? `"${apiKey}" (len=${apiKey.length})` : "NOT SET");
  console.log("token from header:", `"${token}" (len=${token.length})`);
  console.log("match:", token === apiKey);

  if (!apiKey || token !== apiKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const payload = body?.data ?? body; // HAE wraps in { data: {...} }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let metricsInserted = 0;
    let workoutsInserted = 0;
    let otherInserted = 0;

    // --- METRICS ---
    const metrics = payload?.metrics ?? [];
    for (const metric of metrics) {
      const name = metric.name ?? "unknown";
      const units = metric.units ?? null;
      const dataPoints = metric.data ?? [];

      const rows = dataPoints.map((dp: any) => ({
        metric_name: name,
        metric_units: units,
        date: dp.date ?? dp.startDate ?? null,
        qty: dp.qty ?? dp.Avg ?? null,
        raw_payload: dp,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("staging_hae_metrics")
          .upsert(rows, { onConflict: "metric_name,date" });
        if (error) console.error(`Metrics upsert error (${name}):`, error);
        else metricsInserted += rows.length;
      }
    }

    // --- WORKOUTS ---
    const workouts = payload?.workouts ?? [];
    for (const w of workouts) {
      const row = {
        workout_name: w.name ?? "unknown",
        start_time: w.start ?? null,
        end_time: w.end ?? null,
        duration_seconds: w.duration ?? null,
        active_energy_qty: w.activeEnergyBurned?.qty ?? w.activeEnergy?.qty ?? null,
        active_energy_units: w.activeEnergyBurned?.units ?? w.activeEnergy?.units ?? null,
        distance_qty: w.distance?.qty ?? null,
        distance_units: w.distance?.units ?? null,
        avg_heart_rate: w.avgHeartRate?.qty ?? w.heartRate?.avg?.qty ?? null,
        max_heart_rate: w.maxHeartRate?.qty ?? w.heartRate?.max?.qty ?? null,
        raw_payload: w,
      };

      const { error } = await supabase
        .from("staging_hae_workouts")
        .upsert([row], { onConflict: "workout_name,start_time" });
      if (error) console.error("Workout upsert error:", error);
      else workoutsInserted++;
    }

    // --- EVERYTHING ELSE (ECG, State of Mind, Heart Rate Notifications, etc.) ---
    const knownKeys = ["metrics", "workouts"];
    for (const key of Object.keys(payload)) {
      if (knownKeys.includes(key)) continue;

      const items = Array.isArray(payload[key]) ? payload[key] : [payload[key]];
      for (const item of items) {
        const { error } = await supabase
          .from("staging_hae_other")
          .insert({ data_type: key, raw_payload: item });
        if (error) console.error(`Other insert error (${key}):`, error);
        else otherInserted++;
      }
    }

    console.log(`Ingested: ${metricsInserted} metrics, ${workoutsInserted} workouts, ${otherInserted} other`);

    return new Response(
      JSON.stringify({
        success: true,
        metrics_inserted: metricsInserted,
        workouts_inserted: workoutsInserted,
        other_inserted: otherInserted,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```
