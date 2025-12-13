# Exercise component
## Exercise tab
create a new tab in the UI called Exercise.
In this tab we need an overview of the exercises done. and calories burnt etc. steps done etc etc.

## Summary
In the Calendar when selecting a day, it gives you now an overview of your mood and what you consumed.
There the exercise summary should now also pop up.

## DATA


SUPABASE DATA STRUCTURE

1) exercise_daily (table)
Purpose:
Daily aggregated exercise & movement data derived from Apple Health / HealthFit exports.
There is exactly ONE row per calendar day.

Columns:
- date (date, primary key) — ISO format YYYY-MM-DD
- exercise_time_minutes (numeric) — total exercise duration in minutes
- move_time_minutes (numeric) — total movement time in minutes
- stand_time_minutes (numeric, nullable)
- active_energy_kcal (numeric) — calories burned via activity
- distance_km (numeric) — total distance covered
- source (text) — e.g. "healthfit"
- updated_at (timestamptz)

Example query:
select *
from exercise_daily
where date = '2025-10-23';

---

2) health_metrics_daily (table)
Purpose:
Daily general health metrics such as calories and steps.

There is exactly ONE row per calendar day.

Columns:
- date (date, primary key)
- total_energy_kcal (numeric)
- active_energy_kcal (numeric)
- resting_energy_kcal (numeric)
- steps (integer)
- source (text)
- updated_at (timestamptz)

---

3) v_daily_activity (view)
Purpose:
UI-ready daily overview combining health and exercise data.
This is the PREFERRED data source for most UI screens.

This view joins:
- health_metrics_daily
- exercise_daily
on the column: date

Columns (simplified):
- date
- total_energy_kcal
- active_energy_kcal
- resting_energy_kcal
- steps
- exercise_time_minutes
- move_time_minutes
- exercise_kcal (same as exercise_daily.active_energy_kcal)
- distance_km

Example query:
select *
from v_daily_activity
order by date desc
limit 14;

---

UI REQUIREMENTS

Daily Overview Screen:
- Query v_daily_activity
- Display ONE row per day
- Show:
  - total calories
  - active vs resting calories
  - steps
  - exercise time (minutes)
  - distance (km)

Exercise / Movement Tiles:
- Use data from exercise_daily
- Display tiles such as:
  - Exercise time (minutes)
  - Active calories
  - Distance (km)
  - Move time

Tiles should:
- Be date-based
- Require no client-side aggregation (already handled in DB)

Charts / Trends:
- Use v_daily_activity
- X-axis: date
- Y-axis examples:
  - steps
  - exercise_time_minutes
  - active_energy_kcal

---

IMPORTANT NOTES

- All dates are normalized to ISO format (YYYY-MM-DD)
- There is ONE row per day; no duplicates
- NULL exercise fields mean no exercise recorded for that day
- The UI should READ from these tables/views only (no writes)

Build clean, readable UI components that consume this data efficiently.