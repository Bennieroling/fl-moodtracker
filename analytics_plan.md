# Pulse — Analytics Page Plan

*Created: 2026-04-19*

A dedicated Analytics page for exploring historical health data visually —
Apple Health-inspired, but unified across every metric Pulse tracks (HAE,
body, mood, nutrition).

This document contains two parts:

1. **The plan** (human-facing): vision, scope, architecture, phases
1. **The agent instructions** (agent-facing): a step-by-step
   implementation guide any capable AI coding agent can follow

-----

## Part 1 — The plan

### Vision

> “Everything Apple Health shows you, plus everything Pulse tracks that
> Apple Health doesn’t — in one place, with real data-driven charts.”

Analytics is the *exploration* layer. Insights stays as the *narrative*
layer (AI-generated summaries). They complement each other:

- **Insights** answers: “What’s going on with me?”
- **Analytics** answers: “Show me the numbers.”

### Scope

Three modes, presented as tabs at the top of the Analytics page:

#### 1. Browse — “Every metric, indexed”

A scrollable, searchable catalog of every metric Pulse tracks, grouped
by category. Inspired by Apple Health’s “Browse” tab.

- **Categories:** Activity, Heart, Sleep, Body, Mind, Nutrition
- **Each metric card shows:** name, current value (today or latest),
  trend sparkline (last 30 days), 7-day change %
- **Tap a metric → detail view** with:
  - Time range selector (D / W / M / 6M / Y / All)
  - Main chart (line for continuous, bar for daily totals)
  - Stats row (min / avg / max / total, scoped to range)
  - Highlights (notable days, streaks, personal records)
  - Data source badge (HAE / manual / calculated)

#### 2. Reports — “Curated multi-metric views”

Pre-built dashboards that answer common questions. No config required.

- **This Week** — activity, sleep, heart, mood for the last 7 days, all
  on one screen
- **This Month** — same, for last 30 days, with week-over-week deltas
- **Year in Review** — yearly summary (total steps, workouts,
  personal records, best streaks)
- **Recovery Report** — sleep + HRV + resting HR + wrist temp, focused
  on overnight recovery signals
- **Training Load** — workouts, active energy, exercise minutes,
  intensity over time

#### 3. Compare — “Correlate any two metrics”

Pick two metrics, see them overlaid on the same chart with a Pearson
correlation coefficient.

- Metric A and Metric B dropdowns (scoped to numeric metrics only)
- Time range selector shared with other tabs
- Dual-axis line chart with scaled y-axes
- Correlation coefficient + interpretation (“weak positive”, “no
  correlation”, etc.)
- Preset pairs as chips at the top (“Sleep vs HRV”, “Steps vs Resting
  HR”, “Mood vs Sleep”, “Weight vs Active Energy”)

### Non-goals (for v1)

- Editing or deleting historical data (Analytics is read-only)
- Exporting charts as images (nice-to-have, not v1)
- Custom report builder with saved layouts (add later if people ask)
- Goal-setting UI (lives on Profile or a future Goals page)
- Real-time live updates (data refreshes on mount, not via subscription)

### Architecture

#### Route & nav placement

- New route: `/analytics`
- Nav order updated to 6 items: Dashboard · Exercise · Health ·
  **Analytics** · Insights · Profile
- Mobile bottom nav may need to collapse less-used items (TBD in
  Phase 3 of the broader UI redesign)

#### Data sources — no new tables required

Analytics reads from tables that already exist:

|Category |Source table(s)                                                                     |
|---------|------------------------------------------------------------------------------------|
|Activity |`health_metrics_daily`, `exercise_events`, `v_daily_activity`                       |
|Heart    |`health_metrics_daily` (resting HR, HRV), `ecg_readings`, `heart_rate_notifications`|
|Sleep    |`sleep_events`                                                                      |
|Body     |`health_metrics_body`                                                               |
|Mind     |`state_of_mind`, `mood_entries`                                                     |
|Nutrition|`food_entries`, `v_day_summary`                                                     |

No schema changes required for v1. Any aggregation is done client-side
or via existing views.

#### New Supabase views (optional, Phase 4)

If performance becomes an issue with large date ranges, introduce
materialized views for common aggregations:

- `v_metrics_weekly` — pre-aggregated weekly roll-ups of all numeric
  metrics
- `v_metrics_monthly` — same, monthly

Defer until Browse tab actually feels slow with real data volumes.

#### Frontend structure

```
src/
  app/
    analytics/
      page.tsx                      # Analytics shell + tab switcher
      browse/
        page.tsx                    # Browse tab
        [metric]/
          page.tsx                  # Metric detail view
      reports/
        page.tsx                    # Reports landing
        [report]/
          page.tsx                  # Individual report
      compare/
        page.tsx                    # Compare tab
  components/
    analytics/
      AnalyticsTabs.tsx             # Top-level tab nav
      MetricCard.tsx                # Used in Browse grid
      MetricDetailChart.tsx         # Main chart on detail view
      TimeRangeSelector.tsx         # D/W/M/6M/Y/All pill group
      StatsRow.tsx                  # Min/avg/max tiles
      HighlightsPanel.tsx           # Notable days list
      CompareChart.tsx              # Dual-axis overlay
      CorrelationBadge.tsx          # r-value with interpretation
      ReportCard.tsx                # Tiles on Reports landing
  lib/
    analytics/
      metrics-catalog.ts            # Central registry of all metrics
      aggregations.ts               # Daily→weekly→monthly roll-up helpers
      correlation.ts                # Pearson r + interpretation
      queries.ts                    # Supabase query builders per metric
```

#### The metrics catalog (central concept)

The whole Analytics experience is driven by a single registry:

```ts
// src/lib/analytics/metrics-catalog.ts
type Metric = {
  id: string;                       // e.g. 'steps', 'resting_hr'
  category: 'activity' | 'heart' | 'sleep' | 'body' | 'mind' | 'nutrition';
  label: string;                    // display name
  unit: string;                     // 'steps', 'bpm', 'hr'
  table: string;                    // source table
  column: string;                   // source column
  aggregation: 'sum' | 'avg' | 'latest';  // how to roll up intra-day
  rangeAggregation: 'sum' | 'avg';  // how to roll up across a date range
  chartType: 'line' | 'bar';
  goodDirection: 'up' | 'down' | 'neutral';  // for deltas coloring
  format: (n: number) => string;    // display formatter
};
```

Everything else (Browse cards, detail charts, Compare dropdowns)
derives from this list. Adding a new metric = adding one entry here.

### Phases

**Phase 1 — Skeleton (ship it, live with it)**

- Create `/analytics` route with tab switcher
- Browse tab: grid of metric cards using the catalog
- Detail view with time range selector and line chart
- Wire up to real data for ~5 core metrics (steps, resting HR, sleep
  duration, weight, mood)
- **Acceptance:** you can open `/analytics`, browse 5 metrics, and tap
  into each for a historical chart

**Phase 2 — Full Browse**

- Add every remaining metric to the catalog
- Polish: sparklines on cards, 7-day change indicators, highlights
  panel on detail view
- Stats row (min/avg/max)
- **Acceptance:** every metric Pulse tracks appears in Browse with a
  working detail view

**Phase 3 — Reports**

- This Week / This Month / Year in Review / Recovery / Training Load
- Each report is a fixed layout reusing components from Browse
- **Acceptance:** 5 reports each render correctly with real data

**Phase 4 — Compare**

- Dual-metric selector + overlay chart
- Pearson correlation
- Preset pairs
- **Acceptance:** can pick any two numeric metrics and see them
  overlaid with a correlation score

**Phase 5 — Polish & performance**

- Add `v_metrics_weekly` / `v_metrics_monthly` if queries are slow
- Empty states, loading skeletons
- Personal records / streaks surfaced on metric detail pages
- Mobile layout polish

### Acceptance criteria (v1 = Phases 1–3)

- [ ] `/analytics` renders with three tabs
- [ ] Browse tab shows every Pulse metric, grouped by category
- [ ] Each metric card shows current value + 30-day sparkline
- [ ] Detail view supports D/W/M/6M/Y/All ranges for every metric
- [ ] Reports tab has at least 3 working reports
- [ ] All charts use the same visual style (consistent axes, colors,
  tooltips)
- [ ] Page loads in under 2 seconds on Vercel production with real data
- [ ] Works on mobile (Browse grid → single column; charts reflow)

### Out of scope (noted, deferred)

- Compare tab → Phase 4
- Materialized views → Phase 5
- Apple Health-style “notable days” ML → future
- Sharing / export → future
- Goal-setting integration → coordinate with Profile page work

-----

## Part 2 — Agent instructions

*These instructions are written for any capable AI coding agent
(Claude Code, Cursor, Cody, Aider, GitHub Copilot Workspace, etc.).
They assume access to the repo, ability to run the dev server, and
ability to read Supabase schema.*

### Context the agent needs before starting

1. **Read these files first** (they describe the existing app):
- `docs/01-architecture.md` — data pipeline and stack
- `docs/02-database-schema.md` — every table, view, column
- Repo `README.md` (if present)
- The existing Insights page (find with `grep -r "insights" src/app`)
- An existing page with charts (likely Dashboard) to match styling
1. **Know the stack:**
- Next.js (App Router), React, TypeScript
- Supabase (RLS-scoped queries, production tables already exist)
- Hosted on Vercel at `health.festinalente.dev`
- Charting library: check `package.json` — likely Recharts or
  Visx. **Do not introduce a new charting library.**
1. **Know the conventions:**
- Supabase user ID is scoped by RLS via `auth.uid()`; the app
  already has an authenticated Supabase client
- Data fetching pattern: find how Dashboard does it and match
- Dates are stored as user-local dates in production tables — do
  not re-apply timezone conversion on read
- **Always test against deployed Vercel production, not local** for
  final verification (performance numbers differ)

### Ground rules

- **Do not modify the database schema.** Every metric already has a
  home. If you think you need a new column, stop and ask the user.
- **Do not touch Insights page code.** Analytics is additive.
- **Match existing styling** (Tailwind classes, component patterns).
  Find the Dashboard’s chart card and copy its look.
- **One metric, one source of truth.** The catalog (see Step 3) is
  the only place metric definitions live. No hardcoded metric lists
  elsewhere.
- **Never hardcode the user ID** in queries. Use the authenticated
  Supabase client. (The known `a5dafd53-…` UUID is only for SQL
  Editor debugging, never in app code.)
- **Commit after each step below.** Keep commits small and named per
  the step (e.g. “analytics: scaffold route and tabs”).

### Step-by-step implementation

#### Step 0 — Discovery (read-only)

Before writing any code, run these commands and report findings back:

```bash
# Identify charting library
cat package.json | grep -E "recharts|visx|chart|d3"

# Find existing chart components to mimic
grep -rl "LineChart\|AreaChart\|BarChart" src/

# Find the Supabase client factory
grep -rl "createClient\|createBrowserClient" src/lib

# Find the navigation component to update
grep -rl "Dashboard.*Exercise.*Health" src/components
```

Output: a short summary of (a) charting lib, (b) one reference chart
component, (c) Supabase client path, (d) nav component path.
**Stop and wait for user approval before proceeding.**

#### Step 1 — Scaffold route and tab shell

Goal: `/analytics` renders with three clickable tabs. No data yet.

Create:

- `src/app/analytics/page.tsx` — redirects to `/analytics/browse`
- `src/app/analytics/layout.tsx` — renders `<AnalyticsTabs />` + children
- `src/app/analytics/browse/page.tsx` — placeholder “Browse”
- `src/app/analytics/reports/page.tsx` — placeholder “Reports”
- `src/app/analytics/compare/page.tsx` — placeholder “Compare”
- `src/components/analytics/AnalyticsTabs.tsx` — three pill links

Update the main nav component to include Analytics between Health and
Insights.

**Commit:** `analytics: scaffold route and tabs`

**Acceptance:** navigating to `/analytics` loads the Browse placeholder
with three working tabs.

#### Step 2 — Time range selector (shared primitive)

Goal: reusable D/W/M/6M/Y/All pill selector that manages state via
query params (so refreshes preserve the view).

Create:

- `src/components/analytics/TimeRangeSelector.tsx`
- Accepts `value` and `onChange`, renders 6 pills
- Returns an object `{ startDate: Date, endDate: Date, label: string }`

**Commit:** `analytics: add TimeRangeSelector primitive`

**Acceptance:** component renders, tapping a pill updates state. Test
in isolation by dropping it on Browse placeholder temporarily.

#### Step 3 — Metrics catalog

Goal: single source of truth for every metric.

Create `src/lib/analytics/metrics-catalog.ts`. Start with exactly
these 5 metrics (full catalog comes in Phase 2):

|id              |category|label             |table               |column            |aggregation|chartType|
|----------------|--------|------------------|--------------------|------------------|-----------|---------|
|`steps`         |activity|Steps             |health_metrics_daily|steps             |sum        |bar      |
|`resting_hr`    |heart   |Resting Heart Rate|health_metrics_daily|resting_heart_rate|avg        |line     |
|`sleep_duration`|sleep   |Sleep Duration    |sleep_events        |total_sleep_hours |avg        |bar      |
|`weight`        |body    |Weight            |health_metrics_body |weight_kg         |latest     |line     |
|`mood_valence`  |mind    |Mood              |state_of_mind       |valence           |avg        |line     |

Export:

- `METRICS: Metric[]`
- `getMetricById(id: string): Metric | undefined`
- `getMetricsByCategory(cat: Category): Metric[]`

**Commit:** `analytics: add metrics catalog with 5 initial entries`

**Acceptance:** `getMetricById('steps')` returns the entry.

#### Step 4 — Generic metric query function

Goal: one function that, given a metric + date range, returns
`{ date: string, value: number }[]`.

Create `src/lib/analytics/queries.ts`:

```ts
export async function queryMetric(
  client: SupabaseClient,
  metric: Metric,
  startDate: Date,
  endDate: Date
): Promise<{ date: string; value: number }[]>
```

Implementation notes for the agent:

- For tables with a `date` column (`health_metrics_daily`,
  `sleep_events`, `health_metrics_body`): direct query, no aggregation
- For tables with timestamp columns (`state_of_mind.recorded_at`):
  group by date, apply the metric’s `aggregation`
- Use the metric’s `table` and `column` fields
- Handle NULL values by filtering them out
- Return rows sorted ascending by date

**Commit:** `analytics: add generic queryMetric helper`

**Acceptance:** log output for `queryMetric(steps, 7 days ago, today)`
shows real step counts.

#### Step 5 — Browse grid

Goal: cards for all 5 metrics, grouped by category.

Create:

- `src/components/analytics/MetricCard.tsx` — shows label, current
  value, small sparkline (last 30 days)
- Update `src/app/analytics/browse/page.tsx` — fetch latest value +
  sparkline data for each metric, group by category, render cards

Tap handler: navigate to `/analytics/browse/[id]`.

**Commit:** `analytics: implement browse grid with metric cards`

**Acceptance:** Browse tab shows 5 cards in category groupings, each
with a real value and sparkline.

#### Step 6 — Metric detail view

Goal: tap a card → dedicated page with time range selector and main
chart.

Create `src/app/analytics/browse/[metric]/page.tsx`:

- Look up metric via `getMetricById(params.metric)`
- Render header with metric label + unit
- Render `TimeRangeSelector` (default: Month)
- Render main chart using the metric’s `chartType` and queried data
- Render stats row: min / avg / max / total (scoped to range)

Create `src/components/analytics/MetricDetailChart.tsx` and
`src/components/analytics/StatsRow.tsx`.

**Commit:** `analytics: implement metric detail view`

**Acceptance:** tapping a Browse card opens a detail page with a
working chart and range selector. Changing range updates the chart.

#### Step 7 — Expand catalog to all metrics (Phase 2 kickoff)

At this point, stop and check in with the user. Confirm the 5-metric
shell works end-to-end before expanding.

Once approved, add the full catalog (agent will need to cross-
reference `docs/02-database-schema.md`). Expected additions:

- **Activity:** active energy, exercise minutes, stand hours,
  distance, workouts count
- **Heart:** HRV, average HR, ECG classifications (categorical —
  needs special handling)
- **Sleep:** REM hours, deep hours, core hours, awake hours, sleep
  start/end, wrist temperature
- **Body:** body fat %, BMI
- **Mind:** mood entries `mood_score`, state-of-mind labels
  frequency
- **Nutrition:** calories, protein, carbs, fat (from
  `food_entries`, excluding `journal_mode = true`)

**Commit:** `analytics: expand catalog to full metric set`

#### Step 8 — Reports tab (Phase 3)

Each report is a fixed layout reusing `MetricDetailChart`. Build in
this order (ship each):

1. **This Week** — 4-chart grid (steps, sleep, resting HR, mood)
1. **This Month** — same 4 metrics with week-over-week delta badges
1. **Recovery Report** — sleep duration, HRV, resting HR, wrist temp
1. **Training Load** — workouts per week, active energy trend,
   exercise minutes
1. **Year in Review** — yearly totals, PRs, streaks (needs
   aggregation helpers, do last)

File per report: `src/app/analytics/reports/[report]/page.tsx`.
Reports landing lists them as tiles via `ReportCard`.

**Commit per report:** `analytics: add [report-name] report`

#### Step 9 — Compare tab (Phase 4)

Defer until Phases 1–3 are live and user has used them for a week.
Spec lives in this doc, Part 1, Section “Compare”.

#### Step 10 — Performance pass (Phase 5)

Only if measurably slow:

- Add indexes if query plans show sequential scans
- Consider `v_metrics_weekly` materialized view
- Add loading skeletons
- Use React Query (if already in app) for caching across navigations

### Testing expectations

For every PR:

- Manually verify on Vercel production (not just local)
- Confirm no console errors
- Confirm empty states render when a user has no data for the range
- Confirm mobile layout works (Chrome devtools narrow viewport)

No automated tests required for v1 unless the repo already has a test
setup — in which case follow existing patterns.

### Progress reporting

After each step, the agent should report:

- What was done
- Files changed (list)
- Any deviations from this plan and why
- Any blockers encountered
- What it will do next

If the agent hits a question this plan doesn’t answer, it should
stop and ask rather than guess.

### Common pitfalls to avoid

- **Don’t reinvent the Dashboard’s data-fetching pattern** — find it,
  copy it
- **Don’t build the Compare tab early** — Browse + Reports first
- **Don’t add new Supabase tables** — the data is all there
- **Don’t skip the metrics catalog** — hardcoded metric lists in
  components is how this becomes unmaintainable
- **Don’t hardcode time zones** — production tables already store
  user-local dates
- **Don’t duplicate existing views** — reuse `v_daily_activity` and
  `v_day_summary` where they already give you what you need

### Definition of done (v1)

All boxes in the Phase 3 acceptance criteria above are checked, the
plan has been followed, code is committed to the `main` branch, and
the deployed Vercel build renders Analytics correctly for the real
authenticated user with real data.