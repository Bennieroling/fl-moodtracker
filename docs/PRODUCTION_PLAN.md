# Production migration plan — Readiness · Anomalies · What Changed

_Drafted 2026-04-26._
_Phases 1–4 complete and shipped 2026-04-26._

> Status snapshot: all four phases landed in a single day. Anomaly
> detection, readiness scoring, and the What Changed narrative now run
> on Postgres + a server-side LLM endpoint; the `/preview` UI and the
> Dashboard hero/badge read from `anomalies`, `readiness_scores`, and
> `narrative_cache`. The previous client-side compute path
> (`lib/anomalies.ts`, `lib/readiness.ts`) has been deleted.

This is the migration plan from the working `/preview` prototype to
production-grade implementations of the three features. The spec is
`docs/FEATURES_PLAN.md`; this doc is the **how and in what order**.

## Context

`/preview` currently runs all three features client-side:

- `lib/readiness.ts` — score + trend computed in-browser per page load
- `lib/anomalies.ts` — leave-one-out z-scores computed in-browser
- `app/(app)/preview/_components/what-changed-view.tsx` — week-over-week
  deltas computed in-browser; the AI narrative is a static placeholder

The Dashboard already surfaces results via `<ReadinessHero>` and
`<AnomalyBadge>`, both of which call into the same client-side
helpers. UI is shipped and working.

What this plan ships:

- Persisted scores + anomalies in Postgres (no per-page recompute)
- Nightly cron jobs producing them, mirroring `sync_hae_to_production`
- LLM-generated narrative for **What Changed**, cached
- UI swap so each surface reads from the table instead of recomputing
- Anomaly dismiss persistence

What this plan **does not** do (deferred):

- ~~Rename routes (`/insights` → `/charts`, `/preview` → `/insights`)~~
  — done as part of Phase 4 cleanup, see below.
- Promote to `/analytics` taxonomy from FEATURES_PLAN.md
- Push notifications
- Coach / share links

## Architecture changes

| Surface                                     | Before                                         | After                                                                                                    |
| ------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Anomaly count badge                         | Client compute over 30d daily activity + sleep | `SELECT count(*) FROM anomalies WHERE dismissed_at IS NULL AND observed_at >= now() - interval '7 days'` |
| Anomaly cards on `/preview`                 | Client compute, sample fallback                | `SELECT * FROM anomalies` ordered by `detected_at DESC`, dismiss button writes `dismissed_at`            |
| Readiness hero (Dashboard)                  | `computeReadiness(usePreviewData())`           | `SELECT * FROM readiness_scores WHERE date = today`                                                      |
| Readiness ring + 14-day strip on `/preview` | Same client compute                            | `SELECT * FROM readiness_scores WHERE date >= today - 14d`                                               |
| What Changed numerical deltas               | Client compute (stays)                         | Unchanged — already cheap                                                                                |
| What Changed narrative                      | Static placeholder                             | `/api/ai/what-changed` server route, cached in `narrative_cache`                                         |

`usePreviewData` shrinks: once Phase 1 + 2 land, it only needs to
fetch the data still computed client-side (week-over-week deltas), so
the 60-day daily-activity window can drop to 14d.

`lib/readiness.ts` and `lib/anomalies.ts` stay in the repo for one
release as the canonical reference for the PL/pgSQL math, but stop
being called from any UI surface. We delete them in Phase 4.

---

## Phase 1 — Anomalies → production storage

**Goal:** persistent anomaly records, nightly detection, dismiss flow.

### Schema migration

`supabase/migrations/2026XXXXXXXXXX_anomalies_table.sql`

```sql
CREATE TABLE anomalies (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_id     text NOT NULL,
  observed_at   date NOT NULL,
  value         numeric NOT NULL,
  baseline_mean numeric NOT NULL,
  baseline_stddev numeric NOT NULL,
  z_score       numeric NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('high','low')),
  kind          text NOT NULL CHECK (kind IN ('alert','positive')),
  hint          text,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  dismissed_at  timestamptz,
  UNIQUE (user_id, metric_id, observed_at)
);

CREATE INDEX anomalies_user_detected_idx
  ON anomalies (user_id, detected_at DESC);

ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY anomalies_owner_all ON anomalies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Detection function

`supabase/migrations/2026XXXXXXXXXX_detect_anomalies_function.sql`

`detect_anomalies()` — `RETURNS void`, `SECURITY DEFINER`, `LANGUAGE plpgsql`.

For each `(user_id, metric_id)` in the catalog:

1. Build a 30-day window ending today.
2. For each day with a value, compute leave-one-out mean/stddev across
   the other 29 days.
3. Skip pairs with fewer than 14 numeric days (stddev meaningless).
4. Classify direction (high/low) and kind (alert/positive) per
   metric's `goodDirection` (sourced from a small in-function CASE
   table — keeps deps inside Postgres).
5. `INSERT … ON CONFLICT (user_id, metric_id, observed_at) DO UPDATE
SET value = EXCLUDED.value, z_score = EXCLUDED.z_score, …` so re-runs
   are idempotent.

Metrics covered (matches `lib/anomalies.ts:ANOMALY_SOURCES`):

- `health_metrics_daily.hrv` → `metric_id = 'hrv'`
- `health_metrics_daily.resting_heart_rate` → `'rhr'`
- `sleep_events.total_sleep_hours` → `'sleep'`
- `sleep_events.deep_hours` → `'deep_sleep'`

Hint logic (matches `pickHint` in `lib/anomalies.ts`): inline CASE on
preceding-day exercise minutes and same-night sleep duration.

### Cron schedule

Append to `supabase/migrations/2026XXXXXXXXXX_anomalies_cron.sql`:

```sql
SELECT cron.schedule(
  'detect-anomalies',
  '0 3 * * *',
  'SELECT detect_anomalies();'
);
```

03:00 UTC matches the nightly window the spec calls for and avoids the
busy 04:00 slot used by `recalc-streaks-nightly`.

### Application changes

**`lib/database.ts`** — three new exports:

```ts
export async function getRecentAnomalies(userId: string, withinDays = 30): Promise<Anomaly[]>

export async function getAnomalyCount(userId: string, withinDays = 7): Promise<number> // dismissed_at IS NULL

export async function dismissAnomaly(id: number): Promise<void>
```

**`components/dashboard/anomaly-badge.tsx`** — replace
`countRecentAnomalies(data, 7)` with React Query call to
`getAnomalyCount`. Drop the dependency on `usePreviewData`.

**`app/(app)/preview/_components/anomalies-view.tsx`** — replace
`computeAnomalies(data)` with a query against `getRecentAnomalies`.
Add a dismiss button to each card; on click, `dismissAnomaly(id)` +
optimistic remove from list. Sample-data fallback stays for accounts
with empty tables.

**`hooks/usePreviewData.ts`** — keep it for the What Changed view; the
60d window can drop to 14d once Phase 2 also lands.

**`lib/anomalies.ts`** — leave in place as reference for one release.
Mark file with `@deprecated` JSDoc pointing to the SQL function.

### Verification

- [ ] Migration applies cleanly on a fresh local Supabase
- [ ] Manual `select detect_anomalies();` returns void in <2s
- [ ] `select count(*) from anomalies` is non-zero for the dev user
- [ ] Top anomalies by abs(z_score) match what `/preview` was showing
      pre-migration (spot check 3 cards by metric + date)
- [ ] Cron job appears in `select * from cron.job;` with the right
      schedule
- [ ] `<AnomalyBadge />` count matches `select count(*) from
  anomalies where dismissed_at is null and observed_at >= now() -
  interval '7 days'`
- [ ] Dismiss button removes the card and the next page load no longer
      shows it
- [ ] RLS confirmed: a second account cannot read row 1's anomalies

---

## Phase 2 — Readiness → production storage

**Goal:** persisted daily score, nightly compute, Dashboard hero +
preview detail read from table.

### Schema migration

`supabase/migrations/2026XXXXXXXXXX_readiness_scores_table.sql` per
`docs/FEATURES_PLAN.md` Feature 3 spec:

```sql
CREATE TABLE readiness_scores (
  id                   bigserial PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                 date NOT NULL,
  score                int NOT NULL CHECK (score BETWEEN 0 AND 100),
  band                 text NOT NULL CHECK (band IN ('peak','primed','steady','recover')),
  caption              text NOT NULL,
  sleep_contribution   int NOT NULL,
  hrv_contribution     int NOT NULL,
  rhr_contribution     int NOT NULL,
  load_contribution    int NOT NULL,
  components           jsonb NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX readiness_user_date_idx
  ON readiness_scores (user_id, date DESC);

ALTER TABLE readiness_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY readiness_owner_all ON readiness_scores
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### Scoring functions

`supabase/migrations/2026XXXXXXXXXX_compute_readiness_function.sql`

Two functions:

- `compute_readiness(p_user_id uuid, p_date date) RETURNS void` —
  port of `scoreDay()` from `lib/readiness.ts`. Constants for weights
  at the top so they're easy to tune later. Caption templates inline
  (10 entries) selected by dominant + weakest sub-score, mirroring
  `captionFor()`. Writes upsert into `readiness_scores`.

- `compute_readiness_batch() RETURNS void` — runs `compute_readiness`
  for `(user_id, current_date - 1)` for every user with at least one
  row in `health_metrics_daily` in the last 14 days. Skips users
  without enough data.

### Cron schedule

```sql
SELECT cron.schedule(
  'compute-readiness',
  '0 4 * * *',
  'SELECT compute_readiness_batch();'
);
```

04:00 UTC: the batch runs after `sync-hae-to-production` (15-min
cadence so always recent) and after `purge-old-staging-rows` (03:00).

### Backfill

One-shot during deploy:

```sql
-- For the dev user; loop in psql or do/end block
DO $$
DECLARE
  d date;
BEGIN
  FOR d IN SELECT generate_series(current_date - 30, current_date - 1, '1 day'::interval)::date
  LOOP
    PERFORM compute_readiness('USER_UUID_HERE', d);
  END LOOP;
END $$;
```

This is a one-off — not committed as a migration. Document the snippet
in `docs/05-operations-runbook.md`.

### Application changes

**`lib/database.ts`** — two new exports:

```ts
export async function getLatestReadiness(userId: string): Promise<ReadinessRow | null>

export async function getReadinessHistory(userId: string, days: number): Promise<ReadinessRow[]>
```

**`components/dashboard/readiness-hero.tsx`** — drop the
`computeReadiness(usePreviewData())` call. Use a new
`useReadiness()` hook (React Query) reading from the table. Keep the
rendered shape identical so visuals don't shift.

**`app/(app)/preview/_components/readiness-view.tsx`** — same swap;
the 14-day strip pulls `getReadinessHistory(userId, 14)` and renders
each row's `score`. Empty state ("Building your baseline — N days
remaining") when fewer than 14 readiness rows exist.

**`lib/readiness.ts`** — `@deprecated` for one release, removed in Phase 4.

### Verification

- [ ] Migration applies; constraints and RLS verified
- [ ] Manual call: `SELECT compute_readiness('<uuid>', current_date -
  1);` writes one row
- [ ] Backfill loop populates ~30 rows
- [ ] Sanity check: open `/preview` and ring score matches yesterday's
      scoring done by the old client-side path (within ±1 due to
      rounding)
- [ ] Dashboard hero renders without an extra `usePreviewData` round
      trip (verifiable in network tab)
- [ ] Cron job present and active
- [ ] Tomorrow morning: a fresh row exists for `current_date - 1`
- [ ] Empty-state copy renders for a fresh test account

### Acceptance criterion that gates ship

> The displayed score on Dashboard the morning after deploy ≠ a
> recomputed client value, and matches the row in `readiness_scores`.

If those numbers diverge, the table swap isn't safe to keep.

---

## Phase 3 — What Changed narrative (LLM)

**Goal:** swap the static placeholder for an AI-generated 2–3 sentence
synthesis, cached per `(user_id, window)`.

The numerical deltas already work and stay client-computed.

### Cache table

`supabase/migrations/2026XXXXXXXXXX_narrative_cache.sql`

```sql
CREATE TABLE narrative_cache (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key    text NOT NULL,  -- e.g. "what-changed:7d:2026-04-20"
  narrative    text NOT NULL,
  inputs       jsonb NOT NULL, -- the deltas payload, for invalidation if format changes
  generated_at timestamptz NOT NULL DEFAULT now(),
  model        text NOT NULL,  -- e.g. "claude-sonnet-4-6" — for audit
  UNIQUE (user_id, cache_key)
);

ALTER TABLE narrative_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY narrative_cache_owner_all ON narrative_cache
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### API route

`app/api/ai/what-changed/route.ts` — POST handler following the
pattern of `app/api/ai/insights/route.ts`:

1. Validate body (zod): array of deltas with `metric`, `thisValue`,
   `lastValue`, `deltaPct`, `goodOrBad`, `goodDirection`. Window key.
2. Compute `cache_key = "what-changed:" + window + ":" + windowStart`.
3. Check `narrative_cache` for an existing row → return it.
4. Build the prompt (template from `FEATURES_PLAN.md` Feature 2):
   second person, factual, no diagnosis, no medical advice, no emoji.
5. Call the LLM via the existing client used in `/api/ai/insights`.
6. Insert into `narrative_cache` and return the text.

Reuse the auth + error-handling pattern in `lib/api-handler.ts` —
don't roll a new one.

### Application changes

**`app/(app)/preview/_components/what-changed-view.tsx`** —

- After computing deltas, fire `fetch('/api/ai/what-changed', {…})`
  with `useSWR`-style lazy/streaming behaviour.
- Keep the placeholder visible while the request is pending; replace
  with the narrative on success.
- The "Preview" badge on the card stays — this is still flagged as
  AI-generated.
- On error: keep the placeholder, log to console, no toast (it's not
  blocking).

### Verification

- [ ] Migration applies
- [ ] First request to `/api/ai/what-changed` returns prose in <5s
- [ ] Second request with same `(user, window)` returns from cache in
      <100ms (network tab)
- [ ] Changing window from 7d → 30d generates a new narrative
- [ ] Prompt regression: paragraph contains no medical advice or
      diagnostic language (manual review)
- [ ] No client-side LLM call (search `app/(app)/preview/` for
      `anthropic\\|openai`)
- [ ] Page renders deltas immediately even when narrative is still
      loading (don't block on the LLM)

---

## Phase 4 — Cleanup ✅

Done as part of the same day's ship. Outcomes:

- ✅ **`lib/readiness.ts` deleted** — pure dead code after Phase 2.
- ✅ **`lib/anomalies.ts` deleted** — the surviving exports
  (`Anomaly` type, `ANOMALY_SOURCES`, `SAMPLE_ANOMALIES`) moved to
  `app/(app)/preview/_components/anomaly-types.ts`. They're view-model
  shape, not domain logic.
- ⚠️ **`usePreviewData` window not trimmed.** The plan called for
  dropping 60d → 14d; reality is the What Changed view supports a 30d
  window selector, which means we need 60 days of data to compare
  this-30 vs prior-30. Mood/exercise/body fetches stay at 14d (those
  comparisons degrade gracefully on the longer windows). Net: no
  query reduction was actually safe, plan was overoptimistic. Flagged
  in `docs/02-database-schema.md` and the hook itself for future
  trimming if/when the 30d window is dropped or replaced with a
  server-side rollup.
- ✅ **`docs/02-database-schema.md` updated** — added `anomalies`,
  `readiness_scores`, `narrative_cache` under a new "Derived analytics"
  subsection.
- ✅ **`docs/03-functions-and-cron.md` updated** — added
  `detect_anomalies`, `compute_readiness`, `compute_readiness_batch`
  in a new "Derived analytics" section, plus the two new cron jobs in
  the schedule table. While here, also documented the previously
  un-tabled `recalc-streaks-nightly` job.
- ✅ **Routes renamed** — `/preview` is now `/insights` (the new
  interpretive page); the previous `/insights` (mood + calories
  trend chart) is now `/charts`. Permanent redirects from
  `/preview` and `/preview/:path*` are configured in
  `next.config.ts` so old bookmarks survive. Nav entries updated in
  both `app/(app)/layout.tsx` and `components/bottom-nav.tsx`.

### Known cosmetic issue (deferred)

The `hint` CASE in `detect_anomalies()` returns "Came after a quiet
day" for **any** deep-sleep anomaly, including low-deep-sleep alerts
where the copy reads as praise. Trivial migration fix (branch on
`direction = 'high'`); flagged in
`docs/03-functions-and-cron.md#function-level-known-issues`.

## Decisions to confirm before Phase 1 starts

1. **Timezone for "today"**: pg_cron runs UTC. `compute_readiness` and
   `detect_anomalies` use `current_date` which is also UTC. Acceptable
   for a single-user app in CET? **Default: yes, ship UTC; revisit if
   we ever onboard users in other zones.** (No code change needed,
   just confirming the assumption.)
2. **LLM provider for the narrative**: reuse whatever
   `/api/ai/insights` currently calls (presumably the same Anthropic /
   OpenAI key the app already has). **Default: reuse.**
3. **Backfill scope for readiness**: 30 days per spec, or 60-90 to fill
   the 14-day strip on day one with deeper history? **Default: 30
   days. The strip only needs 14 anyway.**
4. **Anomaly detection scope on first run**: rerun for the trailing
   30 days of every user, or only run for "yesterday" going forward?
   **Default: backfill the last 30 days once on deploy, then nightly
   from there.**

If you don't push back on these defaults, I'll proceed with them.

## Out of scope (explicit non-goals for this plan)

- ~~Renaming or relocating routes (`/preview` → `/insights`,
  `/insights` → `/charts`, `/analytics` taxonomy from
  `FEATURES_PLAN.md`). Tracked separately.~~ The
  `/preview` ↔ `/insights` ↔ `/charts` swap shipped in Phase 4 with
  permanent redirects from the pre-rename routes; the `/analytics`
  taxonomy is still deferred.
- Push notifications for anomalies or low readiness.
- Coach / clinician share links.
- Goal integration / "what should I do about it" recommendations.
- Multi-user-timezone handling.
- Streaming the LLM response token-by-token (lazy-load is enough).

## Rough effort estimate

| Phase            | Migrations       | Functions                                      | Frontend                                      | Calendar |
| ---------------- | ---------------- | ---------------------------------------------- | --------------------------------------------- | -------- |
| 1 — Anomalies    | 1 table + 1 cron | `detect_anomalies()`                           | swap badge + view, add dismiss                | ½ day    |
| 2 — Readiness    | 1 table + 1 cron | `compute_readiness`, `compute_readiness_batch` | swap hero + view, empty state, backfill       | 1 day    |
| 3 — What Changed | 1 table          | API route, prompt                              | wire narrative into view                      | 1 day    |
| 4 — Cleanup      | —                | —                                              | trim hook, delete deprecated lib, update docs | ½ day    |

Total: roughly 3 days of focused work. Each phase is independently
shippable and reversible (the table can be dropped, the cron
unscheduled, and the UI rolled back to client-side compute).
