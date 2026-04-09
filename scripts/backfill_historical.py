#!/usr/bin/env python3
"""Backfill HealthFit historical .xlsx exports into Supabase.

Usage:
  python scripts/backfill_historical.py --input-dir ./exports

Required env vars:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SYNC_USER_ID
"""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from supabase import Client, create_client


DATE_FORMULA_RE = re.compile(r"^=DATE\((\d+),(\d+),(\d+)\)$", re.IGNORECASE)


@dataclass
class ParseCounters:
  daily_skipped: int = 0
  body_skipped: int = 0
  workouts_skipped: int = 0


def parse_numeric(value: Any) -> float | None:
  if value is None:
    return None
  if isinstance(value, (int, float)):
    return float(value)

  raw = str(value).strip()
  if not raw or raw.lower() == "n/a":
    return None

  try:
    return float(raw.replace(",", ""))
  except ValueError:
    return None


def parse_duration_seconds(value: Any) -> int | None:
  if value is None:
    return None

  if isinstance(value, (int, float)):
    numeric = float(value)
    if 0 < numeric < 2:
      return int(round(numeric * 86400))
    return int(round(numeric))

  raw = str(value).strip()
  if not raw:
    return None

  if raw.replace(".", "", 1).isdigit():
    numeric = float(raw)
    if 0 < numeric < 2:
      return int(round(numeric * 86400))
    return int(round(numeric))

  parts = raw.split(":")
  if len(parts) == 3:
    h, m, s = parts
    if all(p.strip().isdigit() for p in parts):
      return int(h) * 3600 + int(m) * 60 + int(s)
  if len(parts) == 2:
    m, s = parts
    if m.strip().isdigit() and s.strip().isdigit():
      return int(m) * 60 + int(s)

  return None


def parse_date(value: Any) -> str | None:
  if value is None:
    return None

  if isinstance(value, datetime):
    return value.date().isoformat()

  if isinstance(value, pd.Timestamp):
    return value.date().isoformat()

  if isinstance(value, (int, float)):
    base = datetime(1899, 12, 30, tzinfo=timezone.utc)
    dt = base + timedelta(days=int(round(float(value))))
    return dt.date().isoformat()

  raw = str(value).strip()
  if not raw:
    return None

  m = DATE_FORMULA_RE.match(raw)
  if m:
    y, month, day = map(int, m.groups())
    return datetime(y, month, day).date().isoformat()

  for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
    try:
      return datetime.strptime(raw, fmt).date().isoformat()
    except ValueError:
      pass

  try:
    return pd.to_datetime(raw).date().isoformat()
  except Exception:
    return None


def parse_timestamp(date_value: str | None, time_value: Any) -> str | None:
  if not date_value or time_value is None:
    return None

  if isinstance(time_value, pd.Timestamp):
    return time_value.to_pydatetime().replace(tzinfo=timezone.utc).isoformat()

  if isinstance(time_value, datetime):
    return time_value.replace(tzinfo=timezone.utc).isoformat()

  if isinstance(time_value, (int, float)):
    numeric = float(time_value)
    if numeric >= 2:
      base = datetime(1899, 12, 30, tzinfo=timezone.utc)
      dt = base + timedelta(days=numeric)
      return dt.isoformat()
    seconds = int(max(0, min(86399, numeric * 86400)))
    hh = seconds // 3600
    mm = (seconds % 3600) // 60
    ss = seconds % 60
    return f"{date_value}T{hh:02d}:{mm:02d}:{ss:02d}+00:00"

  raw = str(time_value).strip()
  if not raw:
    return None

  if "T" in raw:
    try:
      return pd.to_datetime(raw, utc=True).isoformat()
    except Exception:
      return None

  candidate = raw if len(raw.split(":")) == 3 else f"{raw}:00"
  try:
    return pd.to_datetime(f"{date_value}T{candidate}Z", utc=True).isoformat()
  except Exception:
    return None


def read_workbook(path: Path) -> dict[str, pd.DataFrame]:
  sheets: dict[str, pd.DataFrame] = {}
  xls = pd.ExcelFile(path)
  for sheet_name in xls.sheet_names:
    sheets[sheet_name] = pd.read_excel(path, sheet_name=sheet_name)
  return sheets


def normalize_headers(df: pd.DataFrame) -> pd.DataFrame:
  df = df.copy()
  df.columns = [str(c).strip() for c in df.columns]
  return df


def find_col(df: pd.DataFrame, names: list[str]) -> str | None:
  cols = set(df.columns)
  for name in names:
    if name in cols:
      return name
  return None


def normalize_daily(df: pd.DataFrame, counters: ParseCounters) -> list[dict[str, Any]]:
  if df.empty:
    return []

  df = normalize_headers(df)
  date_col = find_col(df, ["Date"])
  if not date_col:
    return []

  rows: list[dict[str, Any]] = []
  for _, r in df.iterrows():
    date = parse_date(r.get(date_col))
    if not date:
      counters.daily_skipped += 1
      continue

    def val(names: list[str]) -> Any:
      c = find_col(df, names)
      return r.get(c) if c else None

    exercise_raw = val(["Exercise Time (min)", "Exercise Time"])
    exercise_numeric = parse_numeric(exercise_raw)
    exercise_minutes = exercise_numeric if exercise_numeric is not None else (
      (parse_duration_seconds(exercise_raw) or 0) / 60.0 if exercise_raw is not None else None
    )

    rows.append({
      "date": date,
      "active_energy_kcal": parse_numeric(val(["Active Energy (kcal)"])),
      "resting_energy_kcal": parse_numeric(val(["Resting Energy (kcal)"])),
      "resting_heart_rate": parse_numeric(val(["Resting Heart Rate (bpm)", "Resting HR (bpm)"])),
      "hrv": parse_numeric(val(["HRV (ms)"])),
      "steps": parse_numeric(val(["Steps (count)", "Steps"])),
      "vo2max": parse_numeric(val(["VO2max (mL/min·kg)", "VO2max", "VO2 Max"])),
      "exercise_time_minutes": exercise_minutes,
      "stand_hours": parse_numeric(val(["Stand Hours (hr)", "Stand Time (hr)"])),
      "source": "healthfit",
      "updated_at": datetime.now(timezone.utc).isoformat(),
    })

  return rows


def normalize_body(df: pd.DataFrame, counters: ParseCounters) -> list[dict[str, Any]]:
  if df.empty:
    return []

  df = normalize_headers(df)
  date_col = find_col(df, ["Date"])
  if not date_col:
    return []

  rows: list[dict[str, Any]] = []
  for _, r in df.iterrows():
    date = parse_date(r.get(date_col))
    if not date:
      counters.body_skipped += 1
      continue

    rows.append({
      "date": date,
      "weight_kg": parse_numeric(r.get(find_col(df, ["Weight (kg)", "Weight"]))),
      "body_fat_pct": parse_numeric(r.get(find_col(df, ["Body Fat (%)", "Body Fat"]))),
      "bmi": parse_numeric(r.get(find_col(df, ["BMI"]))),
      "source": "healthfit",
      "updated_at": datetime.now(timezone.utc).isoformat(),
    })

  return rows


def normalize_workouts(df: pd.DataFrame, counters: ParseCounters) -> list[dict[str, Any]]:
  if df.empty:
    return []

  df = normalize_headers(df)

  def col(names: list[str]) -> str | None:
    return find_col(df, names)

  date_col = col(["Date"])
  start_col = col(["Start", "Start Time"])
  if not date_col or not start_col:
    return []

  rows: list[dict[str, Any]] = []
  for _, r in df.iterrows():
    workout_date = parse_date(r.get(date_col))
    started_at = parse_timestamp(workout_date, r.get(start_col))
    if not workout_date or not started_at:
      counters.workouts_skipped += 1
      continue

    duration_seconds = parse_duration_seconds(r.get(col(["Duration"])))
    duration_minutes = (duration_seconds / 60.0) if duration_seconds is not None else None
    avg_hr = parse_numeric(r.get(col(["Avg Heart Rate (bpm)", "Average Heart Rate (bpm)"])))
    max_hr = parse_numeric(r.get(col(["Max Heart Rate (bpm)"])))

    rows.append({
      "workout_date": workout_date,
      "started_at": started_at,
      "ended_at": parse_timestamp(workout_date, r.get(col(["End", "End Time"]))),
      "workout_type": str(r.get(col(["Type", "Workout Type"])) or "Unknown").strip(),
      "duration_seconds": duration_seconds,
      "distance_km": parse_numeric(r.get(col(["Distance (km)", "Distance"]))),
      "elevation_gain_m": parse_numeric(r.get(col(["Elevation Ascended (m)", "Elevation Gain (m)"]))),
      "active_energy_kcal": parse_numeric(r.get(col(["Active Energy (kcal)"]))),
      "total_energy_kcal": parse_numeric(r.get(col(["Total Energy (kcal)"]))),
      "avg_heart_rate": avg_hr,
      "max_heart_rate": max_hr,
      "hr_zone_type": (str(r.get(col(["HR Zone Type"])) or "").strip() or None),
      "hrz0_seconds": parse_duration_seconds(r.get(col(["HR Zone 0 (s)"]))) or 0,
      "hrz1_seconds": parse_duration_seconds(r.get(col(["HR Zone 1 (s)"]))) or 0,
      "hrz2_seconds": parse_duration_seconds(r.get(col(["HR Zone 2 (s)"]))) or 0,
      "hrz3_seconds": parse_duration_seconds(r.get(col(["HR Zone 3 (s)"]))) or 0,
      "hrz4_seconds": parse_duration_seconds(r.get(col(["HR Zone 4 (s)"]))) or 0,
      "hrz5_seconds": parse_duration_seconds(r.get(col(["HR Zone 5 (s)"]))) or 0,
      "trimp": parse_numeric(r.get(col(["TRIMP"]))),
      "mets": parse_numeric(r.get(col(["METs", "METS"]))),
      "rpe": parse_numeric(r.get(col(["RPE"]))),
      "temperature": parse_numeric(r.get(col(["Temperature (°C)", "Temperature (C)"]))),
      "humidity": parse_numeric(r.get(col(["Humidity (%)", "Humidity"]))),
      "total_minutes": duration_minutes,
      "move_minutes": duration_minutes,
      "avg_hr": avg_hr,
      "max_hr": max_hr,
      "source": "healthfit",
      "updated_at": datetime.now(timezone.utc).isoformat(),
    })

  return rows


def upsert_rows(
  client: Client,
  table: str,
  rows: list[dict[str, Any]],
  user_id: str,
  on_conflict: str,
) -> int:
  if not rows:
    return 0

  payload = [{**row, "user_id": user_id} for row in rows]
  response = client.table(table).upsert(payload, on_conflict=on_conflict).execute()
  return len(response.data or [])


def main() -> None:
  parser = argparse.ArgumentParser(description="Backfill historical HealthFit xlsx exports into Supabase.")
  parser.add_argument("--input-dir", required=True, help="Directory containing .xlsx files")
  args = parser.parse_args()

  supabase_url = os.environ.get("SUPABASE_URL")
  service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
  user_id = os.environ.get("SYNC_USER_ID")

  if not supabase_url or not service_key or not user_id:
    raise SystemExit("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_USER_ID")

  client = create_client(supabase_url, service_key)
  input_dir = Path(args.input_dir)
  if not input_dir.exists():
    raise SystemExit(f"Input directory does not exist: {input_dir}")

  files = sorted(input_dir.glob("*.xlsx"))
  if not files:
    raise SystemExit(f"No .xlsx files found in: {input_dir}")

  counters = ParseCounters()
  daily_by_date: dict[str, dict[str, Any]] = {}
  body_by_date: dict[str, dict[str, Any]] = {}
  workouts_by_key: dict[tuple[str, str], dict[str, Any]] = {}

  for file_path in files:
    sheets = read_workbook(file_path)

    daily_sheet = sheets.get("Daily Metrics")
    if daily_sheet is not None:
      for row in normalize_daily(daily_sheet, counters):
        daily_by_date[row["date"]] = row

    body_sheet = sheets.get("Weight")
    if body_sheet is not None:
      for row in normalize_body(body_sheet, counters):
        body_by_date[row["date"]] = row

    workouts_sheet = sheets.get("Workouts")
    if workouts_sheet is not None:
      for row in normalize_workouts(workouts_sheet, counters):
        key = (row["workout_date"], row["started_at"])
        workouts_by_key[key] = row

  daily_rows = list(daily_by_date.values())
  body_rows = list(body_by_date.values())
  workout_rows = list(workouts_by_key.values())

  daily_count = upsert_rows(client, "health_metrics_daily", daily_rows, user_id, "user_id,date")
  body_count = upsert_rows(client, "health_metrics_body", body_rows, user_id, "user_id,date")
  workout_count = upsert_rows(
    client,
    "exercise_events",
    workout_rows,
    user_id,
    "user_id,workout_date,started_at",
  )

  print("Backfill complete")
  print(f"  Files read: {len(files)}")
  print(f"  health_metrics_daily upserted: {daily_count}")
  print(f"  health_metrics_body upserted: {body_count}")
  print(f"  exercise_events upserted: {workout_count}")
  print("Skipped rows due to parse errors:")
  print(f"  daily: {counters.daily_skipped}")
  print(f"  body: {counters.body_skipped}")
  print(f"  workouts: {counters.workouts_skipped}")


if __name__ == "__main__":
  main()
