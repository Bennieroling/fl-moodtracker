# Sofi — UI/UX Improvement Plan

A phased roadmap for improving the look, feel, and user experience of the Sofi food + mood tracking app (`apps/web`). Phases are ordered so each builds on the previous and every phase ends in a shippable state.

---

## Phase 0 — Foundations (prep, ~0.5 day)

Set up the infrastructure the later phases depend on. No user-visible changes.

- [x] Pick an accent color + verify `chart-1`…`chart-5` tokens in `apps/web/app/globals.css`. Document the palette in a short comment block.
- [x] Create `apps/web/components/entry/` directory for shared logging components (used from Phase 2 onward).
- [x] Create `apps/web/components/skeletons/` directory for loading placeholders.
- [x] Add `recharts` to `apps/web/package.json` if not already present (Exercise page uses it; Insights will too).
- [x] Audit existing Lucide icon usage so Phase 1 icon swaps stay consistent.

### Phase 0 progress log (April 9, 2026)
- Added a documented palette comment block in `apps/web/app/globals.css` and verified all `chart-1` to `chart-5` tokens exist in both light and dark themes.
- Created `apps/web/components/entry/.gitkeep` and `apps/web/components/skeletons/.gitkeep` so the new shared component folders are tracked and ready for Phase 2/Phase 1 skeleton work.
- Confirmed `recharts` is already present in `apps/web/package.json` (`^3.1.2`), so no dependency change was needed.
- Completed icon audit for consistent Phase 1 implementation:
  - App nav currently uses Lucide icons with a separate brand emoji in `apps/web/app/(app)/layout.tsx`.
  - Meal selectors in Dashboard/Historic/Voice Recorder use emoji labels (`🌅`, `☀️`, `🌙`, `🍎`).
  - Mood pickers consistently use emoji scales (`😢` through `😄`) across Dashboard/Historic/Day detail/Calendar.
  - Recent-entry type markers in Dashboard/Historic still use emoji (`🍽️`, `📝`), so Phase 1 should choose either full emoji or full icon treatment and apply it globally.

**Exit criteria:** repo builds, no visual change, directories and deps ready.

---

## Phase 1 — Quick wins (1–2 days)

High-impact, low-risk polish. Ship this phase on its own — users will feel it immediately.

### 1.1 Instant mood save (remove the Save button)
- **Files:** `apps/web/app/(app)/dashboard/page.tsx:126-173`, `:449-466`; mirror in `apps/web/app/(app)/historic/page.tsx`.
- Tap an emoji → optimistic UI update → background `upsertMoodEntry` → toast on error only.
- Remove the separate "Save Mood" button and its loading state.

### 1.2 Skeleton loaders replace bare spinners
- **Files:** `components/skeletons/summary-skeleton.tsx` (new), `dashboard/page.tsx:416-419`, `insights/page.tsx` summary cards, `historic/page.tsx` summary grid.
- Use shadcn `<Skeleton>` matching the real card layout. No more `<Loader2>` in cards.

### 1.3 Replace navigation emoji with Lucide icons
- **File:** `apps/web/app/(app)/layout.tsx:14-21`.
- Swap 🍎 brand mark for a Lucide icon (e.g. `UtensilsCrossed` or a custom SVG). Sweep meal selectors for emoji consistency — either all emoji or all icons, pick one.

### 1.4 Colorblind-safe calorie balance
- **File:** `apps/web/app/(app)/historic/page.tsx` (calorie balance block around line 471).
- Add text label ("Deficit" / "On track" / "Over") + `TrendingDown`/`TrendingUp` icon alongside the color. Never rely on color alone.

### 1.5 Calendar days become real buttons
- **File:** `apps/web/app/(app)/calendar/page.tsx:228-250`.
- Convert `<div onClick>` to `<button>`. Add `aria-label` with the date + mood summary. Arrow-key navigation is nice-to-have, deferrable.

### 1.6 Always-visible Edit/Delete on recent entries
- **File:** `apps/web/app/(app)/dashboard/page.tsx:563-584`.
- Remove `MoreHorizontal` dropdown; show `Edit` and `Trash2` icon buttons directly. Same treatment in `historic/page.tsx`.

### Phase 1 progress log (started April 9, 2026)
- [x] 1.1 Instant mood save implemented in both Dashboard and Historic:
  - Emoji click now triggers immediate optimistic mood update.
  - `upsertMoodEntry` runs in the background.
  - Explicit "Save Mood" button and mood loading state were removed.
  - Error path rolls UI back to prior mood and shows destructive toast.
- [x] 1.2 Skeleton loaders
  - Added reusable `apps/web/components/ui/skeleton.tsx`.
  - Added `apps/web/components/skeletons/summary-skeleton.tsx`.
  - Replaced summary-card loading spinners in:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
    - `apps/web/app/(app)/insights/page.tsx` (summary section now skeletons while loading).
- [x] 1.3 Navigation icon swaps
  - Replaced the header brand emoji with Lucide `UtensilsCrossed` in `apps/web/app/(app)/layout.tsx`.
  - Meal selector style decision: keep emoji labels everywhere for consistency (Dashboard, Historic, Voice recorder, edit forms).
- [x] 1.4 Colorblind-safe calorie balance
  - Added explicit status text labels (`Deficit`, `On track`, `Over`) and directional icons in Historic calorie balance summary.
- [x] 1.5 Calendar day buttons + a11y label
  - Converted clickable day cells from `<div>` to `<button type="button">`.
  - Added `aria-label` including absolute date and mood summary.
  - Added keyboard focus ring styles for day cells.
- [x] 1.6 Always-visible Edit/Delete controls
  - Removed overflow dropdown from recent entries in Dashboard and Historic.
  - Added always-visible `Edit` / `Trash2` icon buttons with `aria-label`s.

**Exit criteria:** app visibly snappier, no spinners in cards, accessibility warnings resolved for calendar + calorie balance. Ship to production.

---

## Phase 2 — Consolidation (2–4 days)

Kill the duplication between Dashboard, Historic, and Calendar. This unlocks every future change by giving us one place to edit.

### 2.1 Extract shared entry components
- **New files:**
  - `components/entry/mood-picker.tsx`
  - `components/entry/meal-selector.tsx`
  - `components/entry/entry-editor-dialog.tsx` (the full edit form currently inlined in dashboard + historic)
  - `components/entry/log-food-card.tsx` (the "Log Your Food" card with photo/voice/text/manual tabs)
  - `components/entry/recent-entries-list.tsx`
- **Refactor:** `dashboard/page.tsx` and `historic/page.tsx` import from `components/entry/`. Delete the inlined duplicates.

### 2.2 Make Calendar day-modal editable
- **File:** `apps/web/app/(app)/calendar/page.tsx` (daily summary dialog).
- Use the new `<EntryEditorDialog>` + `<MoodPicker>` inside the modal so users can edit a past day without navigating to Historic.

### 2.3 Delete dead code
- Remove the now-unused inline `MoodPicker` / `MealSelector` / edit form in dashboard and historic. Ensure nothing else imports them.

### Phase 2 progress log (started April 9, 2026)
- [x] 2.1 Extract shared entry components
  - Added:
    - `apps/web/components/entry/mood-picker.tsx`
    - `apps/web/components/entry/meal-selector.tsx`
    - `apps/web/components/entry/entry-editor-dialog.tsx`
    - `apps/web/components/entry/log-food-card.tsx`
    - `apps/web/components/entry/recent-entries-list.tsx`
    - `apps/web/components/entry/index.ts` (barrel exports)
  - Refactored both pages to import shared entry UI from `components/entry`:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
- [x] 2.2 Make Calendar day-modal editable
  - Updated `apps/web/app/(app)/calendar/page.tsx` to use shared components in the day dialog:
    - `MoodPicker` for in-place mood editing (optimistic UI + rollback on error).
    - `EntryEditorDialog` for editing an existing food entry directly from the modal.
  - Added direct Edit/Delete controls per food entry row in the day modal and wired them to `updateFoodEntry` / `deleteFoodEntry` with refresh.
- [x] 2.3 Delete dead code
  - Removed inline duplicated `MoodPicker`, `MealSelector`, log-food card body, recent entries list, and edit-entry dialog implementations from Dashboard and Historic.

**Exit criteria:** single source of truth for logging UI, Calendar can edit, diff shows net line reduction.

---

## Phase 3 — Information architecture (2–3 days)

Fix the "three overlapping date paradigms" problem.

### 3.1 Decide: merge Dashboard + Historic, or keep both with unified date controls
- **Recommendation:** merge. Dashboard becomes a "Log" page with a date stepper that defaults to today. "Historic" disappears from the nav.
- **Alternative (less disruptive):** keep both but add the same `<DateStepper>` component to the top of each, so the interaction is identical.

### 3.2 Implement `<DateStepper>` component
- **New file:** `components/entry/date-stepper.tsx`.
- Prev-day / date-picker / next-day, with "Today" quick action. Disables "next" when the selected date is today.

### 3.3 Update navigation
- **File:** `apps/web/app/(app)/layout.tsx`.
- Remove "Historic" link if merging. Update `navigation` array. Add redirect from `/historic` → `/dashboard?date=...` to preserve old links.

### 3.4 Breadcrumb / page header component
- **New file:** `components/page-header.tsx`.
- Uniform title + description + action slot for every `(app)` page. Replaces the ad-hoc headers currently in each page.

### Phase 3 progress log (started April 9, 2026)
- [x] 3.1 Decision: keep Dashboard and Historic as separate routes for now, but unify date controls and page framing to make interaction identical.
- [x] 3.2 Implemented shared `DateStepper`
  - Added `apps/web/components/entry/date-stepper.tsx`.
  - Wired `DateStepper` into:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
  - Historic now uses the same date stepper interaction and no longer has a separate custom date-selection card.
- [ ] 3.3 Navigation merge/removal
  - Deferred because we chose non-merge path for this iteration.
- [x] 3.4 Implemented shared page header
  - Added `apps/web/components/page-header.tsx`.
  - Replaced ad-hoc headers with `PageHeader` in:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
    - `apps/web/app/(app)/calendar/page.tsx`
    - `apps/web/app/(app)/insights/page.tsx`

**Exit criteria:** clear mental model — one place to log any day, one place to browse by month (Calendar), one place for analytics (Insights). Nav is shorter.

---

## Phase 4 — Dashboard visual hierarchy (2–3 days)

Make the primary screen actually look like a primary screen.

### 4.1 Redesign Today's Summary
- **File:** `apps/web/app/(app)/dashboard/page.tsx:409-447`.
- Two hero tiles: **Calories** (giant bold number, goal ring or progress bar) and **Mood** (large emoji + feeling label).
- Secondary row: **Meals logged** as a caption, **Macros** as a small donut or stacked bar (not 3 lines of text).

### 4.2 Section grouping
- Break the six-flat-cards layout into two sections: "Log" (mood + food entry) and "Today" (summary + recent entries). Use subtle section headers, not more cards.

### 4.3 Micro-interactions pass
- Mood emoji: hover scale + glow, selected state pulse.
- Meal buttons: subtle bounce on click.
- Recent entry rows: row highlight on hover, smooth enter/exit on add/delete.
- All via Tailwind `transition-*` and `group-hover:*` — no animation library.

### Phase 4 progress log (started April 9, 2026)
- [x] 4.1 Redesign Today's Summary
  - Reworked `apps/web/app/(app)/dashboard/page.tsx` summary into:
    - Hero tile: Calories (large metric + progress bar toward default goal).
    - Hero tile: Mood (large emoji + feeling label).
    - Secondary tiles: Meals logged and stacked macro distribution bar with percentages.
- [x] 4.2 Section grouping
  - Reorganized Dashboard into clear sections with subtle headers:
    - `Today` section for summary + recent entries.
    - `Log` section for mood picker + food logging.
- [x] 4.3 Micro-interactions pass
  - Added mood hover scale/glow + selected pulse in `apps/web/components/entry/mood-picker.tsx`.
  - Added subtle press/bounce interaction to meal selector buttons in `apps/web/components/entry/meal-selector.tsx`.
  - Added hover highlight + enter animation for recent entry rows in `apps/web/components/entry/recent-entries-list.tsx`.

**Exit criteria:** Dashboard reads at a glance, hierarchy is clear, feels alive.

---

## Phase 5 — Insights rebuild (3–5 days)

Bring Insights up to Exercise-page polish.

### 5.1 Replace hand-rolled charts with Recharts
- **File:** `apps/web/app/(app)/insights/page.tsx:179-246`.
- **Mood trend:** `<LineChart>` with smooth curve, week/month toggle.
- **Macro distribution:** `<PieChart>` donut or `<BarChart>` stacked.
- **Top foods:** `<BarChart>` horizontal, not hand-drawn divs.
- Use `chart-1`…`chart-5` CSS tokens so charts respect theme + dark mode.

### 5.2 Redesign Insights summary cards
- 4 summary tiles (avg mood, calories, meals, streak) get the same hierarchy treatment as Dashboard — bigger primary numbers, smaller captions.

### 5.3 AI summary + tips section
- Move to a dedicated card with distinct styling (subtle accent background, `Sparkles` icon) so users know it's AI-generated, not data.

### 5.4 Skeleton loaders for chart cards
- Use `components/skeletons/` placeholders sized to match final chart dimensions — no layout shift when data arrives.

### Phase 5 progress log (started April 9, 2026)
- [x] 5.1 Replace hand-rolled charts with Recharts
  - Updated `apps/web/app/(app)/insights/page.tsx` to use Recharts:
    - `LineChart` for weekly mood + calories trend.
    - `PieChart` donut for macro distribution.
    - Horizontal `BarChart` for top foods.
  - Chart color styling now uses CSS chart tokens (`hsl(var(--chart-1..3))`) for theme consistency.
- [x] 5.2 Redesign Insights summary cards
  - Refreshed the four summary tiles with larger headline metrics, cleaner captions, and subtle gradient hierarchy.
- [x] 5.3 AI summary + tips section
  - Styled AI cards as distinct accent blocks and used `Sparkles` icon treatment to reinforce AI-generated content.
- [x] 5.4 Skeleton loaders for chart cards
  - Added `apps/web/components/skeletons/insights-charts-skeleton.tsx`.
  - Insights now renders chart-sized skeleton placeholders while loading.

**Exit criteria:** Insights looks like it belongs in the same app as Exercise. No hand-rolled data viz remains.

---

## Phase 6 — Logging quality & trust (3–4 days)

Improve the confidence users have in AI-driven logging.

### 6.1 Confidence indicators on AI analysis
- **Files:** `components/upload/photo-uploader.tsx`, `voice-recorder.tsx`, `text-analyzer.tsx`.
- Show detected foods as editable chips: `banana (92%)` with ability to remove or rename before save.
- Add a "Review" step between analysis and save — no more silent commits.

### 6.2 Voice transcript review
- Show transcribed text before insertion. User can edit the transcript, re-analyze, or cancel.

### 6.3 Optimistic UI for food entries
- Same pattern as mood: entry appears in "Recent Entries" immediately, rolls back on error.

### 6.4 Clearer empty states with CTAs
- Empty "Recent Entries" should link to the meal selector, not just say "scroll up."
- Empty Insights should explain what to do to populate it.

### Phase 6 progress log (started April 9, 2026)
- [x] 6.1 Confidence indicators on AI analysis
  - Added editable detected-food review in:
    - `apps/web/components/upload/photo-uploader.tsx`
    - `apps/web/components/upload/voice-recorder.tsx`
    - `apps/web/components/upload/text-analyzer.tsx`
  - Users can now rename/remove/add detected foods before saving.
- [x] 6.2 Voice transcript review
  - In `apps/web/components/upload/voice-recorder.tsx`, transcript is now editable during review.
  - Added explicit transcript re-analysis action (re-runs AI text analysis from edited transcript) and cancel path.
- [x] 6.3 Optimistic UI for food entries
  - Added optimistic insert behavior for photo/voice/text/manual logging in:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
  - New entries appear immediately in Recent/Day lists and roll back on failure.
- [x] 6.4 Clearer empty states with CTAs
  - Added actionable empty-state CTA buttons in shared recent/day entries list (`apps/web/components/entry/recent-entries-list.tsx`).
  - Wired CTA in Dashboard/Historic to jump users directly into meal logging flow.

**Exit criteria:** users trust the AI logging, can correct mistakes before they hit the DB, and always have a next action from an empty state.

---

## Phase 7 — Accessibility & mobile polish (2–3 days)

- [ ] Audit all interactive elements for `aria-label` + keyboard focus rings.
- [x] Calendar arrow-key navigation between days.
- [x] `prefers-reduced-motion` respected for all micro-interactions added in Phase 4.
- [x] Exercise page tables → stacked cards on mobile (`exercise/page.tsx:356-383`).
- [x] Historic/Dashboard date input width: remove hardcoded `w-52`, use responsive.
- [x] Edit Entry dialog: stacked single-column on mobile instead of 2×2 grid.
- [ ] Run Lighthouse + axe on Dashboard, Insights, Calendar, Exercise. Fix everything Serious+.

### Phase 7 progress log (started April 9, 2026)
- [x] Calendar keyboard navigation
  - Added arrow-key day-to-day focus navigation (`← → ↑ ↓`) on calendar day buttons in `apps/web/app/(app)/calendar/page.tsx`.
- [x] Reduced motion support
  - Added global `prefers-reduced-motion: reduce` override in `apps/web/app/globals.css` to minimize animation/transition motion.
- [x] Exercise mobile stacked cards
  - Converted both aggregate and daily overview table sections to render stacked card lists on mobile with desktop tables preserved from `md` up (`apps/web/app/(app)/exercise/page.tsx`).
- [x] Responsive date input width
  - Updated `DateStepper` date input width to responsive (`w-full sm:w-44`) in `apps/web/components/entry/date-stepper.tsx`.
- [x] Edit dialog mobile layout
  - Changed edit dialog nutrition grid to single-column on mobile and two columns on `sm+` in `apps/web/components/entry/entry-editor-dialog.tsx`.
- [ ] Full interactive-element audit + Lighthouse/axe run
  - Added several high-impact `aria-label`s (e.g., icon buttons in Calendar/Exercise controls), but full route-wide automated audits remain pending due environment constraints.

**Exit criteria:** Lighthouse a11y ≥ 95 on all main routes, mobile usable without horizontal scroll.

---

## Phase 8 — Onboarding & retention (3–5 days, optional)

Only do this after Phases 1–5 ship. It's high-value but depends on the rest being polished.

### 8.1 First-run onboarding sheet
- **New file:** `apps/web/app/(app)/onboarding/page.tsx` or modal triggered on first dashboard load.
- 3 steps: (1) preferred logging method, (2) reminder time, (3) log your first meal. Dismissible, once per user, persisted on profile.

### 8.2 Tooltip tour for logging methods
- First visit to the food logging card, show a dismissible tooltip trail explaining Photo / Voice / Text / Manual tabs.

### 8.3 Empty-state CTAs everywhere
- Every empty state routes the user to the next logical action with a button, not just text.

### Phase 8 progress log (started April 9, 2026)
- [x] 8.1 First-run onboarding sheet
  - Added dedicated onboarding route: `apps/web/app/(app)/onboarding/page.tsx`.
  - Implemented 3-step flow:
    - Preferred logging method
    - Reminder time
    - First-meal handoff to Dashboard
  - Added first-run redirect from Dashboard when onboarding is not completed (local per-user completion key in `localStorage`).
- [x] 8.2 Tooltip tour for logging methods
  - Added dismissible step-by-step tooltip guide in `apps/web/components/entry/log-food-card.tsx` explaining Photo / Voice / Text / Manual tabs.
  - Guide is persisted per user in `localStorage` once dismissed.
- [x] 8.3 Empty-state CTAs everywhere
  - Added actionable CTA buttons to Insights empty states in `apps/web/app/(app)/insights/page.tsx` directing users to Dashboard logging flow.

**Exit criteria:** new user goes from signup → first logged meal in under 60 seconds without asking for help.

---

## Phase 9 — Design system hardening (ongoing)

Low-priority cleanups worth doing once the app is visually stable.

- [x] Extract a shared `MacroDisplay` component used by Dashboard, Historic, Calendar modal, Insights.
- [x] Standardize Card structure: every card has `CardHeader` with title + description, consistent spacing.
- [x] Typography scale: define `text-display`, `text-metric`, `text-caption` utility classes. Replace ad-hoc font sizes.
- [x] Dark mode pass — verify every new component + chart respects the theme.
- [x] Storybook or a `/design` route that showcases all shared components for future reference.

### Phase 9 progress log (started April 9, 2026)
- [x] Shared `MacroDisplay` extracted
  - Added `apps/web/components/macro-display.tsx`.
  - Replaced duplicated macro UI blocks in:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
    - `apps/web/app/(app)/calendar/page.tsx` (day modal summary)
- [x] Typography utility classes added
  - Added `text-display`, `text-metric`, and `text-caption` utility classes in `apps/web/app/globals.css`.
  - Applied to shared page header and key dashboard metric/caption surfaces.
- [x] Card-header structure normalization
  - Added shared `StandardCardHeader` in `apps/web/components/ui/standard-card-header.tsx`.
  - Applied consistent title/description card headers across primary app routes:
    - `apps/web/app/(app)/dashboard/page.tsx`
    - `apps/web/app/(app)/historic/page.tsx`
    - `apps/web/app/(app)/calendar/page.tsx`
    - `apps/web/app/(app)/insights/page.tsx`
    - `apps/web/app/(app)/onboarding/page.tsx`
- [x] Dark mode pass
  - Updated hard-coded color treatments to theme-aware variants and dark-safe classes:
    - Macro bar segments now use `chart-1..3` tokens in `apps/web/components/macro-display.tsx`.
    - Dashboard/Insights gradient accents include dark-mode variants.
    - Calendar mood color badges/day styles now include dark palette classes.
    - Historic calorie balance colors now include dark-mode text variants.
- [x] `/design` showcase route
  - Added `apps/web/app/(app)/design/page.tsx` with live examples for:
    - `PageHeader`
    - `DateStepper`
    - `StandardCardHeader`
    - `MoodPicker`
    - `MealSelector`
    - `MacroDisplay`

---

## Suggested rollout order

1. **Phase 0** — 0.5 day prep
2. **Phase 1** — ship quick wins (biggest perceived improvement per hour of work)
3. **Phase 2** — consolidation (unlocks everything downstream)
4. **Phase 4** — Dashboard redesign (users see this most)
5. **Phase 5** — Insights rebuild (biggest visual polish jump)
6. **Phase 3** — IA cleanup (can slot earlier if the three-date-paradigm confusion is a frequent complaint)
7. **Phase 6** — logging trust
8. **Phase 7** — a11y + mobile
9. **Phase 8** — onboarding
10. **Phase 9** — ongoing hardening

Phases 1, 2, 4, and 5 together take roughly 8–14 working days and would deliver ~80% of the visible improvement. Everything after is refinement.

---

## Definition of done (applies to every phase)

- [ ] `pnpm --filter web build` passes locally
- [ ] No new TypeScript or ESLint errors
- [ ] Manual smoke test on desktop + mobile viewport
- [ ] Lighthouse a11y score not regressed
- [ ] Changes shipped behind no feature flag (these are pure UI changes, safe to ship directly)
- [ ] Commit message explains the *why*, not just the *what*
