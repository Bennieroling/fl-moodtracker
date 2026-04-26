# Pulse — Next-Level Features Plan

_Created: 2026-04-19_

Three features that take Pulse from "a good data viewer" to "a tool that
actively tells you something". Each is self-contained — pick one, hand
it off, ship it.

**Order of build (recommended, not required):**

1. Anomaly Detection — smallest, background job, no new UI surface
2. What Changed — one screen, reuses Analytics primitives
3. Readiness Score — most visible, largest scope, best as a keystone

**Prerequisite for all three:** Analytics page skeleton from
`ANALYTICS_PLAN.md` must be live. All three features live inside or
alongside Analytics and depend on its catalog + query helpers.

Each feature section below follows the same structure:

- What it is
- Data requirements
- UX spec
- Implementation phases
- Agent prompt (copy/paste ready)

---

## Feature 1 — Anomaly Detection

### What it is

A nightly background job that flags readings more than 2 standard
deviations from a user's 30-day rolling baseline. Surfaces positive
anomalies (personal records) alongside alerts. No push notifications
in v1 — results appear as a card stack on a new Anomalies page under
Analytics, and as a small badge on the Dashboard.

### Data requirements

**Uses existing tables only.** No new data sources.

Anomalies are computed from these numeric metrics (all in the
catalog):

- `health_metrics_daily`: steps, active_energy_kcal, resting_heart_rate,
  hrv, exercise_time_minutes
- `sleep_events`: total_sleep_hours, deep_hours, rem_hours,
  wrist_temperature
- `health_metrics_body`: weight_kg, body_fat_pct
- `state_of_mind`: valence (daily average)

Categorical metrics (ECG classifications, state_of_mind labels) are
out of scope for v1 — they need different detection logic.

### New tables

One new table: `anomalies`. Flat, append-only, one row per detected
outlier.

| Column            | Type          | Notes                                                                                           |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `id`              | `bigint`      | PK, autoincrement                                                                               |
| `user_id`         | `uuid`        | RLS scope                                                                                       |
| `metric_id`       | `text`        | Matches catalog id, e.g. `resting_hr`                                                           |
| `observed_at`     | `date`        | The day the anomalous reading occurred                                                          |
| `value`           | `numeric`     | The actual reading                                                                              |
| `baseline_mean`   | `numeric`     | 30-day rolling mean excluding the day itself                                                    |
| `baseline_stddev` | `numeric`     | 30-day rolling σ                                                                                |
| `z_score`         | `numeric`     | `(value - mean) / stddev`                                                                       |
| `direction`       | `text`        | `'high'` or `'low'`                                                                             |
| `kind`            | `text`        | `'alert'` (crosses threshold in bad direction) or `'positive'` (personal best / good direction) |
| `detected_at`     | `timestamptz` | When the job found it                                                                           |
| `dismissed_at`    | `timestamptz` | User dismissed (hide from default view)                                                         |

**Unique:** `(user_id, metric_id, observed_at)` — re-running the job
doesn't create duplicates.

**Indexes:** `(user_id, detected_at DESC)` for the feed view.

**RLS:** `ALL where auth.uid() = user_id`, matching other production
tables.

### Detection logic

For each metric on each scheduled run:

1. For every date in the last 30 days where a value exists:
   - Compute the mean and stddev of **the other 29 days** (exclude the
     day itself — prevents the outlier from inflating its own
     baseline)
   - Compute `z = (value − mean) / stddev`
   - If `|z| ≥ 2.0`, it's an anomaly
2. Determine direction (`high` if value > mean, else `low`)
3. Determine kind using the metric's `goodDirection` from the catalog:
   - If `goodDirection='up'` and `direction='high'` → `positive`
   - If `goodDirection='up'` and `direction='low'` → `alert`
   - If `goodDirection='down'` and `direction='low'` → `positive`
   - If `goodDirection='down'` and `direction='high'` → `alert`
   - If `goodDirection='neutral'` → always `alert`
4. Upsert into `anomalies` via the unique constraint

Skip metrics with fewer than 14 days of history (stddev is
meaningless on tiny samples).

### Where the detection runs

Two options — pick based on where the rest of your sync jobs live:

- **Option A (preferred):** Supabase pg_cron runs a PL/pgSQL function
  `detect_anomalies()` nightly at 03:00 user time. Matches your
  existing pattern (`sync_hae_to_production`, `purge_old_staging_rows`).
- **Option B:** Supabase Edge Function invoked by a Vercel cron.
  More code, more moving parts — only do this if you need npm
  libraries for stats.

Go with Option A. Postgres does statistics well and this keeps the
whole pipeline in-database.

### UX spec

**Two surfaces:**

1. **Anomalies page** — new route at `/analytics/anomalies`, linked
   from Analytics tabs as a fourth tab (Browse · Reports · Compare ·
   Anomalies), or accessed from a "see all" on the Dashboard badge.
   - Header: "N anomalies · last 30 days"
   - Vertical stack of cards (one per anomaly)
   - Each card: metric name + value, mini-chart with the outlier
     highlighted, z-score, baseline, short context line, dismiss button
   - Positive anomalies visually differentiated (different accent
     color, "Personal Best" / "New High" tag)
   - Filter pills at top: All · Alerts · Personal bests

2. **Dashboard badge** — small tile or corner indicator: "3 anomalies
   this week · tap to review". Only visible if `count > 0` and any are
   not yet dismissed.

**Per-card anatomy** (see HTML mockup for visual reference):

- Tag pill (top-left): "Elevated" / "Dropped" / "Personal Best"
- Date (top-right): "Apr 15 · Wed"
- Metric + value: "Resting HR · 67 bpm"
- One-line description (optional, computed — see next section)
- Mini-chart: 30-day trend line with baseline band shaded, outlier dot
- Stats row: Value / Baseline / Z-score
- Footer: short correlation hint + "View day →" action

### The "why might this have happened" line

Each card can show one lightweight correlation hint, computed at
render time from the same day's other data:

- Low sleep the night before an HR spike → "Correlates with short sleep"
- Long workout the day before an HRV drop → "Likely training-related"
- Earlier bedtime before a deep sleep PR → "Came after an early bedtime"

Rule-based, not AI. Keep the list of hints short (5–10 canned rules).
If nothing triggers, show nothing — don't invent narrative.

**Do not** call an LLM for this line in v1. Rule-based is fast, cheap,
and doesn't need API keys. LLM-generated context can come later via
the Insights pipeline.

### Implementation phases

**Phase 1 — Detection backend**

- Create `anomalies` table + RLS + indexes
- Write `detect_anomalies()` PL/pgSQL function
- Run once manually, verify output against known outliers by eye
- Schedule via pg_cron
- **Acceptance:** manual trigger populates realistic anomalies for
  your own data

**Phase 2 — Anomalies page**

- Add 4th tab to Analytics
- Fetch `anomalies` table scoped to last 30 days
- Render card stack with mini-charts
- Reuse `MetricDetailChart` or write a smaller `AnomalyChart` variant
- Dismiss action (set `dismissed_at`, optimistic UI)
- **Acceptance:** page loads, shows real anomalies, tapping "View day →"
  navigates to that date's Day Detail view (or metric detail page)

**Phase 3 — Dashboard surface**

- Count query: `SELECT count(*) WHERE dismissed_at IS NULL AND observed_at >= now() - interval '7 days'`
- Render badge on Dashboard linking to Anomalies page
- **Acceptance:** badge appears when anomalies exist, disappears
  when all dismissed

### Acceptance criteria (v1)

- [ ] `anomalies` table created, indexed, RLS-scoped
- [ ] `detect_anomalies()` function scheduled nightly
- [ ] At least one real anomaly detected from existing Pulse data
- [ ] `/analytics/anomalies` renders cards with charts
- [ ] Dismiss action persists and hides the card
- [ ] Dashboard badge appears and links correctly

### Agent prompt — Feature 1

> You're implementing **anomaly detection** for Pulse, a personal health
> tracking app. Full spec in `docs/FEATURES_PLAN.md` → Feature 1.
>
> Prerequisites: Analytics page from `ANALYTICS_PLAN.md` is live with
> the metrics catalog at `src/lib/analytics/metrics-catalog.ts`.
>
> **Read first:**
>
> - `docs/02-database-schema.md` (for the conventions used by existing
>   tables like `health_metrics_daily`)
> - `docs/03-functions-and-cron.md` (for how `sync_hae_to_production`
>   is structured — match that style)
> - `src/lib/analytics/metrics-catalog.ts` (the catalog you'll read
>   from to pick metrics and their `goodDirection`)
>
> **Do, in order:**
>
> 1. **Schema**. Write a migration creating the `anomalies` table per
>    the spec. Match the style of existing migrations. Include RLS
>    policy, unique constraint, and the one index.
> 2. **Detection function**. Write `detect_anomalies()` as PL/pgSQL. For
>    each metric listed in the spec, compute the 30-day rolling
>    leave-one-out z-score and upsert rows where |z| ≥ 2. Use
>    `ON CONFLICT (user_id, metric_id, observed_at) DO UPDATE` so
>    re-runs are idempotent. Skip metrics with <14 days of data.
> 3. **Cron**. Schedule the function nightly at 03:00 UTC via pg_cron,
>    matching the pattern used for `sync_hae_to_production`.
> 4. **Manual test**. Call the function manually, then `SELECT * FROM
anomalies ORDER BY z_score DESC LIMIT 10`. Report the output to
>    the user to sanity-check that flagged readings are in fact
>    unusual.
> 5. **Anomalies page**. Add `/analytics/anomalies` as a 4th tab.
>    Fetch last 30 days of anomalies, render as a card stack. Cards
>    follow the layout in the spec. Use existing chart components
>    where possible — do not introduce a new charting library.
> 6. **Dashboard badge**. Add a small indicator to the Dashboard that
>    shows anomaly count (non-dismissed, last 7 days) and links to the
>    Anomalies page. Match the styling of other Dashboard tiles.
>
> **Do not:**
>
> - Call any LLM from this feature. The "why might this have happened"
>   line is rule-based.
> - Introduce push notifications.
> - Detect anomalies on categorical metrics (ECG classifications,
>   mood labels) — numeric only.
>
> **Commit after each numbered step.** Report back after step 4 before
> proceeding to UI work.

---

## Feature 2 — What Changed

### What it is

A "this week vs last week" view that auto-computes the biggest deltas
across all tracked metrics and presents them ranked by magnitude.
Includes an AI-generated narrative paragraph tying the top changes
together.

### Data requirements

**Uses existing tables only.** No schema changes.

Queries the same metrics as the Analytics catalog, aggregated over
two adjacent 7-day windows (the last 7 full days vs the 7 before that).

### UX spec

**Route:** `/analytics/reports/what-changed` (lives inside Reports
tab from the Analytics plan).

**Layout** (see HTML mockup):

- Large typographic header: "What **changed**" + date range caption
- Top section: 3–5 biggest deltas as horizontal rows:
  - Icon (↑ or ↓ with color)
  - Metric name
  - Old value → new value
  - Delta % (color-coded)
- Middle: AI narrative paragraph (1–3 sentences) — "The story"
- Bottom: "Smaller shifts" — compact list of all other metrics with
  their delta as text, no charts

**Ranking logic:**

- For each metric: compute `delta_pct = (this_week - last_week) / last_week`
- Surface top 4 by absolute value
- Tie-break by catalog priority (put sleep/HRV/RHR above weight)

**Color coding:**

Uses each metric's `goodDirection` from the catalog:

- Green = change in the good direction (more steps = good; lower
  resting HR = good)
- Red = change in the bad direction
- Neutral = metrics flagged `goodDirection: 'neutral'` (weight, calories)

### The AI narrative

This is the one place an LLM call is justified. Passes the top 4
deltas as structured JSON and asks for a 2–3 sentence synthesis.

**Prompt template** (pseudo):

```
Given these weekly changes for a user tracking their health:
- Sleep: 6.2h → 7.4h (+19%)
- HRV: 48ms → 56ms (+17%)
- Active energy: 2840 → 2110 kcal (-26%)
- Resting HR: 58 → 54 bpm (-7%)

Write a 2-3 sentence observation in second person. Do not diagnose,
speculate about disease, or give medical advice. Stick to describing
what changed and suggesting the most likely benign pattern.
Factual, warm, honest. No emoji. No hedging.
```

Use the existing Insights LLM pipeline — don't create a new API
integration.

Cache by date range (the narrative for "week of Apr 13 vs week of
Apr 6" doesn't change) so regenerating is free.

### Implementation phases

**Phase 1 — Data layer**

- Write `queryWeekOverWeek(client, metricIds[], anchorDate)` in
  `src/lib/analytics/queries.ts`
- Returns `[{ metric, thisWeek, lastWeek, deltaPct, deltaAbs, direction, goodOrBad }]`
- **Acceptance:** running it against real data returns correct numbers
  (spot-check 2–3 metrics by hand)

**Phase 2 — Static view**

- Build the page at `/analytics/reports/what-changed` with no LLM yet
- Render the top deltas and smaller shifts sections
- Show a placeholder where the narrative will go
- **Acceptance:** page renders with real numbers for your data

**Phase 3 — Narrative**

- Add an API route (or extend the existing Insights route) that takes
  the deltas and returns a narrative
- Cache responses by `(user_id, weekStart)` in the `insights` table or
  a new lightweight cache table
- **Acceptance:** paragraph appears, reads like prose, regenerates only
  when date range changes

**Phase 4 — Dashboard tile** (optional)

- Small "This week" tile on Dashboard showing top 2 deltas with a
  "See all →" link
- Only show after Monday has passed (otherwise "this week" has <2
  days of data)

### Acceptance criteria (v1)

- [ ] `/analytics/reports/what-changed` renders
- [ ] Top 4 deltas shown, correctly ranked by magnitude
- [ ] Colors match each metric's `goodDirection`
- [ ] Narrative paragraph generated and cached
- [ ] Smaller shifts list shows all remaining tracked metrics

### Agent prompt — Feature 2

> You're implementing the **What Changed** report for Pulse. Full spec
> in `docs/FEATURES_PLAN.md` → Feature 2.
>
> Prerequisites: Analytics page with the metrics catalog and
> `queryMetric` helper must exist. Reports tab scaffolding should be
> in place.
>
> **Read first:**
>
> - `src/lib/analytics/metrics-catalog.ts`
> - `src/lib/analytics/queries.ts`
> - The existing Insights page code (for the LLM pipeline you'll
>   reuse — find it with `grep -r "insights" src/app`)
>
> **Do, in order:**
>
> 1. **Week-over-week query**. Add `queryWeekOverWeek` to
>    `src/lib/analytics/queries.ts`. Takes an array of metric ids and
>    an anchor date. Returns an array with each metric's this-week
>    total/avg, last-week total/avg, delta percent, delta absolute,
>    direction (`'up'` or `'down'`), and `goodOrBad` (`'good'`,
>    `'bad'`, or `'neutral'`) derived from the metric's
>    `goodDirection`.
>
>    Use the metric's `rangeAggregation` field to decide sum vs avg.
>    Handle null weeks gracefully.
>
> 2. **Static page**. Create `src/app/analytics/reports/what-changed/page.tsx`.
>    Fetch data via `queryWeekOverWeek`. Render:
>    - Header with date range
>    - Top 4 deltas (rows per mockup)
>    - Placeholder narrative card
>    - Smaller shifts list at bottom
>      Use Tailwind patterns from the existing Dashboard.
> 3. **Narrative generation**. Extend the existing Insights API route
>    (or add a new one at `/api/insights/what-changed`) that accepts
>    the deltas payload and returns a 2–3 sentence narrative using
>    the same LLM client already in the app.
>
>    Prompt must instruct the model: no medical advice, no diagnosis,
>    second-person, factual, no emoji. Use the prompt template from
>    the spec as a starting point.
>
> 4. **Cache**. Store the generated narrative keyed by `(user_id,
week_start_date)` so regenerating the page for the same week
>    doesn't call the LLM again. Use the existing `insights` table if
>    it has space; otherwise add a minimal `narrative_cache` table.
> 5. **Wire it up**. Page fetches cache first, falls back to LLM call,
>    displays narrative with a subtle "AI-generated" badge.
>
> **Do not:**
>
> - Generate per-metric commentary. One narrative, one call.
> - Make the LLM call client-side. Server route only.
> - Block page render on the LLM — render numbers immediately, stream
>   or lazy-load the narrative.
>
> **Commit after each numbered step.** Report back after step 2 so the
> user can sanity-check the numbers before LLM work starts.

---

## Feature 3 — Readiness Score

### What it is

A daily 0–100 score summarizing how recovered the user is, with a
band label ("Peak" / "Primed" / "Steady" / "Recover"), the four
inputs that drove it, and a 14-day trend strip. Shows on the Dashboard
as the hero element and has its own detail page.

### Data requirements

**Uses existing tables only.** One new table for storing computed
scores so the Dashboard doesn't recompute on every load.

### New tables

`readiness_scores`:

| Column               | Type          | Notes                                         |
| -------------------- | ------------- | --------------------------------------------- |
| `id`                 | `bigint`      | PK                                            |
| `user_id`            | `uuid`        | RLS scope                                     |
| `date`               | `date`        | User-local day                                |
| `score`              | `integer`     | 0–100                                         |
| `band`               | `text`        | `'peak'`, `'primed'`, `'steady'`, `'recover'` |
| `caption`            | `text`        | One-line auto-generated summary               |
| `sleep_contribution` | `integer`     | 0–100 sub-score                               |
| `hrv_contribution`   | `integer`     | 0–100 sub-score                               |
| `rhr_contribution`   | `integer`     | 0–100 sub-score                               |
| `load_contribution`  | `integer`     | 0–100 sub-score                               |
| `components`         | `jsonb`       | Full input snapshot for debugging/replay      |
| `computed_at`        | `timestamptz` |                                               |

**Unique:** `(user_id, date)`

### Scoring logic

Four sub-scores (0–100), weighted:

1. **Sleep (35%)** — `min(100, (duration_hours / 8.0) * 100)`, floor
   at 20 if duration is 0 (missing data, not 0-sleep)
2. **HRV (30%)** — compare to user's 60-day rolling mean. Score 50 =
   at mean. Score 100 = +1σ or better. Score 0 = -2σ or worse. Linear
   in between.
3. **Resting HR (20%)** — same approach as HRV, inverted (lower is
   better)
4. **Training load (15%)** — 3-day acute load vs 14-day chronic load
   ratio (ACWR). Ratio 0.8–1.3 = optimal (score 100). Below 0.5 or
   above 1.6 = score low (both under-training and over-training).

Final score = weighted average, rounded to nearest integer.

**Band mapping:**

- 85–100: Peak
- 70–84: Primed
- 50–69: Steady
- 0–49: Recover

**Caption generation:** rule-based one-liner. Examples:

- Top contributor is sleep + improvement: "Sleep held the line — your HRV bounced back overnight."
- HRV dropped, load high: "Heavy load caught up with you. Take it easy today."
- All steady: "Nothing jumped out — a solid baseline day."

~10 canned templates selected by the dominant driver. Don't LLM this
in v1.

### Where the scoring runs

Two options:

- **Option A (preferred):** PL/pgSQL function `compute_readiness()` run
  nightly via pg_cron, writes to `readiness_scores`. Dashboard just
  SELECTs.
- **Option B:** Compute client-side on each Dashboard load. Simpler
  but slower and recomputed on every visit.

Pick A. Matches the pattern of the existing sync pipeline.

### UX spec

**Dashboard hero** (see HTML mockup):

- Centered circular progress ring, 260×260px, accent color fill
- Large serif score digits in the center
- Band label in mono caps below ("PRIMED")
- One-line caption below that
- Four contributor tiles in a 2×2 grid (Sleep / HRV / Resting HR /
  Training Load) — each with value, unit, bar indicator, and delta vs
  baseline
- 14-day trend strip at bottom (bar chart, today highlighted)

**Detail page** at `/analytics/readiness`:

- Same ring + contributors
- Longer trend chart (90 days)
- Historical list of recent scores with their captions
- "How it's computed" explainer section

**Empty state:** If user has <14 days of HRV/RHR data, show "Building
your baseline — {N} days remaining" instead of a score.

### Implementation phases

**Phase 1 — Compute + store**

- Create `readiness_scores` table
- Write `compute_readiness(user_id, date)` function
- Write `compute_readiness_batch()` that runs it for all users for
  yesterday's date
- Schedule nightly cron
- Backfill 30 days of scores manually
- **Acceptance:** table has 30 realistic rows, scores feel right
  compared to how you actually felt those days

**Phase 2 — Dashboard hero**

- Replace current Dashboard top section with ReadinessHero
  component
- Ring + score + caption + contributors + trend strip per mockup
- Match Pulse's existing design tokens (find current Dashboard
  styling)
- **Acceptance:** renders today's score on Dashboard, looks native to
  the app

**Phase 3 — Detail page**

- Route: `/analytics/readiness`
- Same hero + 90-day history + explainer
- **Acceptance:** tapping the Dashboard ring opens the detail page

**Phase 4 — Empty / low-data states**

- Handle <14 days of HRV/RHR with a friendly "building baseline"
  state
- Handle missing sleep data (show score with reduced confidence
  indicator)
- **Acceptance:** new user with 3 days of data sees the building
  state, not a broken ring

### Acceptance criteria (v1)

- [ ] `readiness_scores` populated for last 30 days
- [ ] Nightly cron adds yesterday's score automatically
- [ ] Dashboard shows the hero ring with real values
- [ ] All four contributors show correct values + deltas
- [ ] 14-day trend strip accurate
- [ ] `/analytics/readiness` detail page works
- [ ] Empty state renders for insufficient-data case
- [ ] Visual style matches rest of Pulse

### Agent prompt — Feature 3

> You're implementing the **Readiness Score** for Pulse. Full spec in
> `docs/FEATURES_PLAN.md` → Feature 3.
>
> Prerequisites: Analytics page and metrics catalog are live. The
> tables `health_metrics_daily`, `sleep_events`, and `exercise_events`
> are populated via the HAE sync pipeline.
>
> **Read first:**
>
> - `docs/02-database-schema.md` (for the tables you'll read from)
> - `docs/03-functions-and-cron.md` (for the PL/pgSQL function style)
> - The existing Dashboard page (`grep -rl "Dashboard" src/app`) to
>   match its styling tokens
>
> **Do, in order:**
>
> 1. **Schema**. Migration creating `readiness_scores` per the spec.
>    RLS, unique constraint, index on `(user_id, date DESC)`.
> 2. **Scoring function**. Write `compute_readiness(p_user_id uuid,
p_date date)` in PL/pgSQL. Implements the four sub-scores per the
>    spec, rolls up to a weighted final score, assigns a band, picks a
>    caption from a list of templates, writes/upserts into
>    `readiness_scores`. Keep the caption template list inline in the
>    function for now — no separate config table.
> 3. **Batch runner**. `compute_readiness_batch()` runs the scoring
>    function for every user for yesterday's date. Schedule via
>    pg_cron nightly at 04:00 UTC (after the HAE sync has run).
> 4. **Backfill**. Run the function manually for the user's last 30
>    days. Report back a sample of scores so the user can sanity-check.
> 5. **Dashboard hero component**. Build `ReadinessHero` at
>    `src/components/dashboard/ReadinessHero.tsx`:
>    - SVG ring animated on mount (fill from 0 to score)
>    - Score in large serif type, band in mono caps
>    - Four contributor tiles in a 2×2 grid
>    - 14-day trend bar strip
>      Place it as the top element of the Dashboard, above existing
>      content. Match the visual style of existing Dashboard cards.
> 6. **Detail page**. Route `/analytics/readiness`. Same hero + 90-day
>    trend chart + "How it's computed" section. Make the Dashboard
>    ring tappable and link here.
> 7. **Empty state**. If fewer than 14 days of HRV and RHR data
>    exist, render "Building your baseline — N days remaining"
>    instead of a score.
>
> **Do not:**
>
> - Recompute the score on every page load. The score table is the
>   source of truth.
> - Call an LLM for the caption. Rule-based templates in the function.
> - Change the weighting without telling the user — the 35/30/20/15
>   split is deliberate and should be easy to adjust later via
>   constants at the top of the function.
>
> **Commit after each numbered step.** Report back after step 4 with
> sample scores before starting UI work.

---

## Cross-feature notes

### Shared dependencies

All three features depend on:

- `src/lib/analytics/metrics-catalog.ts` (the catalog)
- `src/lib/analytics/queries.ts` (`queryMetric`)
- Analytics page scaffolding (route, tabs)

If Analytics isn't live yet, stop and do that first per
`ANALYTICS_PLAN.md`.

### Shared non-goals (v1)

- No push notifications for anomalies or low readiness
- No coach / clinician share links
- No goal integration
- No "what should I do about it" recommendations
- No mobile app-specific features — everything is web

### Reasonable order if building all three

1. Analytics page (prerequisite)
2. Anomaly Detection — smallest new surface area, no UI frontpage
   changes
3. What Changed — reuses a lot of Analytics primitives
4. Readiness Score — largest and most visible, worth doing last once
   you've learned from the others

### When to stop and check in with a human

Any agent implementing these should pause and ask the user if:

- The computed values don't match user intuition (e.g. readiness of 90
  on a day the user felt awful)
- Styling diverges noticeably from existing Dashboard/Analytics pages
- A metric the catalog expects isn't populated for the current user
  (indicates pipeline issue, not feature issue)
- Any proposed change would modify an existing table's schema (no —
  add a new table instead)
