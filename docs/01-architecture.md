# Pulse — Supabase Architecture

_Last updated: 2026-04-19_

## Purpose

Pulse is a personal health tracking app that ingests Apple Watch and iPhone
data (via the Health Auto Export iOS app, "HAE") into Supabase, then serves
it to a Next.js frontend at `health.festinalente.dev`. This document
describes the server-side architecture only — see the `pulse-frontend`
repo for UI details.

## Data flow

```
┌───────────────────┐       every 5 min        ┌─────────────────────┐
│  Apple Watch +    │  ───── HAE pushes ─────▶ │  ingest-hae         │
│  iPhone           │        (HTTPS POST)      │  Edge Function      │
│  (via HAE app)    │                          │  (region: eu-west-3)│
└───────────────────┘                          └──────────┬──────────┘
                                                          │ writes raw
                                                          │ JSON rows
                                                          ▼
                                         ┌────────────────────────────┐
                                         │  Staging tables            │
                                         │  (append-only inbox)       │
                                         │                            │
                                         │  • staging_hae_metrics     │
                                         │  • staging_hae_workouts    │
                                         │  • staging_hae_other       │
                                         └──────────┬─────────────────┘
                                                    │
             pg_cron: every 15 min                  │
             `sync_hae_to_production()`             │
                                                    ▼
                                         ┌────────────────────────────┐
                                         │  Production tables         │
                                         │  (typed, deduplicated)     │
                                         │                            │
                                         │  • health_metrics_daily    │
                                         │  • health_metrics_body     │
                                         │  • exercise_events         │
                                         │  • workout_routes          │
                                         │  • sleep_events            │
                                         │  • state_of_mind           │
                                         │  • ecg_readings            │
                                         │  • heart_rate_notifications│
                                         └──────────┬─────────────────┘
                                                    │
                                                    │ views + RLS
                                                    ▼
                                         ┌────────────────────────────┐
                                         │  Next.js frontend (Vercel) │
                                         │  reads via Supabase JS SDK │
                                         └────────────────────────────┘

             pg_cron: every day at 03:00 UTC
             `purge_old_staging_rows()` deletes processed staging
             rows older than 30 days.
```

## Component responsibilities

### HAE app (Health Auto Export, iOS)

Runs on the user's iPhone. Reads HealthKit data (Watch + iPhone sensors)
and pushes JSON payloads to the `ingest-hae` Edge Function roughly every
5 minutes. Configured per-automation:

- **Workout** — every 5 min, including route data
- **Health metrics** — every 5 min
- **ECG** — once a day
- **State of mind** — once a day
- **Heart rate notification** — once a day

HAE authenticates with a shared API key sent in a request header.

> **iOS quirk.** If the user swipes HAE away in the app switcher, iOS
> treats it as user-terminated and suspends all background work. Pushes
> silently stop. This has bitten us once already — see
> `05-operations-runbook.md`.

### `ingest-hae` Edge Function

Single Deno-based Edge Function deployed to Supabase. Region: `eu-west-3`.
Responsibilities:

1. Validate the HAE API key header
2. Parse the incoming JSON payload
3. Fan out into the appropriate staging table (metrics, workouts, or other)
4. Return 200 OK to HAE

The function is stateless and idempotent-ish — duplicate pushes land as
duplicate staging rows, but the sync step deduplicates before they reach
production. See `04-edge-functions.md` for full details.

### Staging tables

Append-only inbox tables. Every HAE push adds rows here. Rows carry a
`processed_at TIMESTAMPTZ` column (nullable) that tracks whether the sync
function has promoted them yet:

- `processed_at IS NULL` — not yet synced to production
- `processed_at IS NOT NULL` — synced, kept for 30 days for debugging

Staging schema is deliberately loose (raw JSON, few constraints). See
`02-database-schema.md`.

### `sync_hae_to_production()` function

PL/pgSQL function that reads unprocessed staging rows, transforms them,
and upserts into production tables. Runs every 15 minutes via pg_cron.

Key design decisions:

- **Skip-already-processed** — only reads rows where
  `processed_at IS NULL`, then marks them processed. Makes each run O(new
  rows) instead of O(all staging).
- **Re-aggregation for daily metrics** — `health_metrics_daily` groups
  per day, so the function re-aggregates entire days that have any new
  staging rows. This preserves correct daily totals when HAE ships
  partial data.
- **Timezone-aware** — reads `user_preferences.timezone` per user and
  uses it for all date bucketing, so a 00:30 walk in Barcelona doesn't
  land in yesterday's UTC bucket.

See `03-functions-and-cron.md` for implementation detail.

### Production tables

Typed, deduplicated, query-optimized. Protected by Row-Level Security
tied to `auth.uid()`. These are what the frontend reads. See
`02-database-schema.md`.

### Frontend (Next.js on Vercel)

- Hosted at `health.festinalente.dev`
- Uses the Supabase JS SDK for reads
- Authenticates via Supabase Auth (SSO)
- Mostly queries views layered on top of production tables
  (`v_daily_activity`, etc.)

Frontend implementation is out of scope for this doc — see the
`pulse-frontend` repo.

## Timezone model

All `timestamptz` columns store UTC internally. Date-bucketed tables
(`health_metrics_daily`, `sleep_events`, `health_metrics_body`,
`exercise_events.workout_date`) bucket into the user's **local** day
based on `user_preferences.timezone` (e.g. `Europe/Madrid`).

This matters because a 00:30 local walk is 22:30 UTC on the previous
day — bucketing naively by UTC gives the wrong daily total.

Postgres handles DST automatically for named zones, so storing
`"Europe/Madrid"` (not `"UTC+2"`) is mandatory.

## Scheduled jobs (pg_cron)

| Job name                  | Schedule           | What it does                                      |
| ------------------------- | ------------------ | ------------------------------------------------- |
| `sync-hae-to-production`  | `*/15 * * * *`     | Promote new staging rows into production          |
| `purge-old-staging-rows`  | `0 3 * * *`        | Delete staging rows processed > 30 days ago       |

## Known limitations

These are expected to be addressed before multi-user launch:

- **Hardcoded user_id** — `sync_hae_to_production()` hardcodes the test
  user's UUID. All promoted rows land under that user. Multi-user sync
  requires reading `user_id` from each staging row and using dynamic
  lookup.
- **Shared HAE API key** — a single `HAE_API_KEY` secret authenticates
  all inbound pushes. There's no way to distinguish users or revoke one
  user's access without rotating the key for everyone.
- **Staging rows have no `user_id`** — they're implicitly assumed to
  belong to the hardcoded user. Needs a `user_id` column tied to an auth
  mechanism that identifies the requesting user.

## Future work

- **Per-user HAE tokens.** Replace the shared `HAE_API_KEY` with a
  `hae_ingest_tokens` table (`token`, `user_id`, `revoked_at`). Edge
  Function reads `x-hae-token` header, looks up `user_id`, writes it to
  staging. Users can generate/rotate tokens independently.
- **Staging rows carry `user_id`.** Once tokens exist, every staging row
  gets the `user_id` attached at ingest time. `sync_hae_to_production()`
  groups by `user_id` and promotes per-user.
- **Per-user cron trigger.** Alternative to the 15-min global cron:
  trigger sync on-demand after each successful ingest (via pg_notify or
  Edge Function direct RPC call). Removes up-to-15-min latency.
- **Operational monitoring.** Surface stale-staging alerts when HAE
  hasn't pushed in > 30 min during awake hours, to catch iOS suspension
  faster.

## Key references

- Supabase project region: `eu-west-3`
- Supabase project ref: `sxawzzcpmiakltfjpzcn`
- Repo: <https://github.com/Bennieroling/fl-moodtracker>
- Frontend URL: <https://health.festinalente.dev>
- Test user ID: `a5dafd53-74d9-4492-9b60-944cfdf5d336`
