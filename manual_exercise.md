# Manual Exercise Logging (AI-Assisted)

## Overview

A new feature for the Pulse Exercise page that lets the user describe an activity in free text (e.g. “rode my motorcycle through twisty mountain roads for 5 hours”) and have an LLM estimate the calorie expenditure on a **conservative** basis. This fills gaps where the Apple Watch / HAE pipeline under-reports or misses activities entirely — motorcycle riding, manual labor, yard work, unrecorded walks, moving house, etc.

The pattern mirrors the existing AI-assisted food entry flow: unstructured user input → structured, validated record stored in Supabase.

## Rationale

- Apple Watch misses or underestimates activities that don’t match its trained workout profiles (motorcycling is the canonical example — isometric muscle work, thermoregulation, and sustained focus burn real calories that wrist motion + HR patterns can’t see).
- Manual “Other” workouts in the Watch are clunky and still rely on the same sensor limitations.
- A free-text + AI flow is fast to use and more honest than pretending every activity fits a predefined category.

## Data Model

### New table: `manual_activities`

A dedicated table, separate from `exercise_events`, to keep **measured** data (HAE) cleanly separated from **estimated** data (AI).

```sql
CREATE TABLE manual_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- When the activity happened
  start_time      timestamptz NOT NULL,
  end_time        timestamptz NOT NULL,
  duration_min    integer GENERATED ALWAYS AS
                    (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::int STORED,

  -- User input
  description     text NOT NULL,              -- raw user text
  intensity_hint  text CHECK (intensity_hint IN ('easy','moderate','hard')),

  -- AI output (structured)
  activity_category   text,                   -- e.g. 'motorcycle_riding', 'yard_work'
  met_value           numeric(4,2),           -- MET used for calculation
  calories_estimated  integer NOT NULL,       -- conservative estimate (lower bound)
  calories_range_low  integer,                -- optional: for transparency
  calories_range_high integer,
  ai_notes            text,                   -- model's reasoning / caveats
  ai_model            text,                   -- e.g. 'claude-sonnet-4-5'

  -- Overlap handling
  overlaps_hae        boolean DEFAULT false,  -- set by a trigger or at insert time
  overlap_decision    text CHECK (overlap_decision IN ('keep_both','use_manual','use_hae','pending')),

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_activities_user_time
  ON manual_activities (user_id, start_time DESC);

CREATE INDEX idx_manual_activities_overlap
  ON manual_activities (user_id, overlaps_hae)
  WHERE overlaps_hae = true;
```

### Combined view: `combined_activities`

For UI consumption, a view UNIONs HAE workouts and manual activities with a common shape and a `source` column so the frontend can display them together and label them.

```sql
CREATE OR REPLACE VIEW combined_activities AS
SELECT
  id,
  user_id,
  start_time,
  end_time,
  workout_type AS activity_type,
  active_energy_kcal AS calories,
  'hae'::text AS source,
  NULL::text AS description,
  NULL::text AS ai_notes
FROM exercise_events
UNION ALL
SELECT
  id,
  user_id,
  start_time,
  end_time,
  activity_category AS activity_type,
  calories_estimated AS calories,
  'manual_ai'::text AS source,
  description,
  ai_notes
FROM manual_activities
WHERE overlap_decision != 'use_hae' OR overlap_decision IS NULL;
```

The `WHERE` clause means that if the user chose to keep HAE data over the manual entry, the manual entry is hidden from the combined view (but still retained in the table for audit / reversibility).

## AI Prompt Design

### Goals

1. Return a **conservative** estimate — bias low when uncertain.
1. Use **published MET values** rather than freestyling.
1. Return structured JSON that maps cleanly to the table schema.
1. Explain reasoning briefly so the user can sanity-check.

### Draft Prompt

```
You are a fitness calorie estimator. Given a free-text description of a
physical activity, estimate calorie expenditure on a CONSERVATIVE basis.

The user weighs {weight_kg} kg. The activity lasted {duration_min} minutes.
Additional intensity hint from the user: {intensity_hint or 'none'}.

Rules:
- Use standard MET values from the Compendium of Physical Activities.
- When a range of MET values applies, ALWAYS choose the lower end unless the
  description clearly indicates high intensity.
- Calories = MET * weight_kg * (duration_min / 60).
- For activities with significant isometric or postural components that aren't
  reflected in standard MET tables (e.g. motorcycle riding, driving off-road,
  tool use), use the closest conservative match and note it.
- If the description is vague or implausible, return a low estimate and flag
  it in ai_notes.
- NEVER invent exotic high-MET values. When in doubt, round down.

Return ONLY valid JSON matching this schema:
{
  "activity_category": "snake_case_category",
  "met_value": number,
  "calories_estimated": integer,   // conservative / lower-bound estimate
  "calories_range_low": integer,
  "calories_range_high": integer,
  "ai_notes": "one or two sentences explaining MET choice and any caveats"
}

User description: {description}
```

### Example Expected Output (motorcycle, 5 hours, moderate)

```json
{
  "activity_category": "motorcycle_riding",
  "met_value": 2.5,
  "calories_estimated": 1050,
  "calories_range_low": 1050,
  "calories_range_high": 1680,
  "ai_notes": "Standard MET for motorcycling is 2.5–3.5. Used lower bound per conservative policy. Isometric core/arm work and thermoregulation can push actual burn higher, especially on technical terrain."
}
```

## Overlap Handling (flag and let user decide)

### Detection

On insert (or via trigger), check whether the `[start_time, end_time]` window overlaps with any existing `exercise_events` row for the same user:

```sql
SELECT EXISTS (
  SELECT 1 FROM exercise_events
  WHERE user_id = NEW.user_id
    AND tstzrange(start_time, end_time, '[]') &&
        tstzrange(NEW.start_time, NEW.end_time, '[]')
)
```

If `true`, set `overlaps_hae = true` and `overlap_decision = 'pending'`.

### UI Flow

When overlap is detected, the Exercise page surfaces a small banner on the manual entry:

> ⚠ This activity overlaps with an existing Apple Watch workout (Outdoor Walk, 42 min, 180 kcal). How should we count it?
> 
> - **Keep both** (may double-count calories)
> - **Use manual estimate only** (hide Watch workout in totals)
> - **Use Watch data only** (keep the manual entry for reference, exclude from totals)

The choice writes to `overlap_decision`, which the `combined_activities` view respects.

## UI / UX

### Entry form (Exercise page)

A new “Log Activity” card / modal with:

- **Description** — multi-line text input
  - Placeholder: “e.g. 4-hour motorcycle ride on mountain roads, warm weather, moderate pace”
- **Start time** — datetime picker (defaults to `now() - duration`)
- **Duration** — number input (minutes) + quick buttons (30m / 1h / 2h / 4h)
- **Intensity hint** — optional pill selector (Easy / Moderate / Hard)
- **Submit** — calls edge function, shows loading state

### Result confirmation

After the AI returns:

- Show estimated calories prominently
- Show MET used and category
- Show AI notes (collapsible)
- Show “Save” / “Edit & retry” / “Cancel” buttons
- On save, insert into `manual_activities`

### Display in lists

Combined activity list on the Exercise page pulls from `combined_activities`, with:

- Source badge: `⌚ Watch` vs `✍ Manual (AI)`
- Manual entries show a subtle “estimated” indicator next to calories
- Tapping a manual entry shows the full AI reasoning

## Implementation Phases

### Phase 1 — Data foundation

1. Create `manual_activities` table (migration)
1. Create `combined_activities` view
1. Add RLS policies (`user_id = auth.uid()` for select/insert/update/delete)
1. Add unique constraint to prevent exact-duplicate inserts

### Phase 2 — Edge function

1. New edge function `estimate-manual-activity`
1. Accepts `{ description, start_time, end_time, intensity_hint }`
1. Fetches user weight from profile
1. Calls Anthropic API with the prompt above
1. Detects overlap with `exercise_events`
1. Returns AI result + overlap info (does NOT insert yet — let the user confirm)

### Phase 3 — UI: entry form

1. Add “Log Activity” button on Exercise page
1. Build form + validation
1. Wire to edge function
1. Render result preview with Save / Edit / Cancel

### Phase 4 — UI: overlap resolution

1. On save, if overlap exists, show overlap resolution dialog
1. Persist `overlap_decision`
1. Update dashboard totals to respect the decision

### Phase 5 — UI: combined list + badges

1. Update Exercise page list to read from `combined_activities`
1. Add source badges and “estimated” indicator
1. Expandable AI reasoning on tap

### Phase 6 — Dashboard integration

1. Make sure daily calorie totals on Dashboard include manual activities (respecting `overlap_decision`)
1. Optionally: surface a “manual activities this week” chip

## Open Questions (for later)

- Should we let the user edit the AI estimate before saving? (Probably yes — power users will want to override.)
- Should we cache the user’s previous descriptions for faster re-entry? (e.g. “motorcycle ride” autocompletes with previous defaults)
- Do we want a monthly summary of “calories Apple Watch missed”? Could be a nice insight.
- Should AI confidence be surfaced as a first-class field, or is the text note enough?

## Risks / Considerations

- **Model drift**: store `ai_model` on each row so future changes to the prompt or model are traceable.
- **User gaming**: trivial to over-estimate by describing activities generously. Conservative prompting helps but this is a personal tracker, so not a serious concern.
- **Weight dependency**: calorie calc depends on user weight. Use latest `body_metrics` entry; fall back to a profile default.
- **Timezone**: store everything in UTC (`timestamptz`), display in the user’s local TZ as elsewhere in Pulse.
