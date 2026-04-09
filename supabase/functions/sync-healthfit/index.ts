import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

type SupabaseClientLike = ReturnType<typeof createClient>;

type SyncResult = {
  sheetName: string;
  rowsFetched: number;
  rowsUpserted: number;
  error: string | null;
  durationMs: number;
};

type HeaderMap = Record<string, number>;

const DEFAULT_LAST_SYNC_DATE = "2020-01-01";

const DAILY_HEADERS = {
  date: ["Date"],
  active_energy_kcal: ["Active Energy (kcal)"],
  resting_energy_kcal: ["Resting Energy (kcal)"],
  resting_heart_rate: ["Resting Heart Rate (bpm)", "Resting HR (bpm)"],
  hrv: ["HRV (ms)"],
  steps: ["Steps (count)", "Steps"],
  vo2max: ["VO2max (mL/min·kg)", "VO2max", "VO2 Max"],
  exercise_time_minutes: ["Exercise Time (min)", "Exercise Time"],
  stand_hours: ["Stand Hours (hr)", "Stand Time (hr)"],
} as const;

const WEIGHT_HEADERS = {
  date: ["Date"],
  weight_kg: ["Weight (kg)", "Weight"],
  body_fat_pct: ["Body Fat (%)", "Body Fat"],
  bmi: ["BMI"],
} as const;

const WORKOUT_HEADERS = {
  workout_date: ["Date"],
  started_at: ["Start", "Start Time"],
  ended_at: ["End", "End Time"],
  workout_type: ["Type", "Workout Type"],
  duration_seconds: ["Duration"],
  distance_km: ["Distance (km)", "Distance"],
  active_energy_kcal: ["Active Energy (kcal)"],
  total_energy_kcal: ["Total Energy (kcal)"],
  avg_heart_rate: ["Avg Heart Rate (bpm)", "Average Heart Rate (bpm)"],
  max_heart_rate: ["Max Heart Rate (bpm)"],
  elevation_gain_m: ["Elevation Ascended (m)", "Elevation Gain (m)"],
  temperature: ["Temperature (°C)", "Temperature (C)"],
  humidity: ["Humidity (%)", "Humidity"],
  hr_zone_type: ["HR Zone Type"],
  hrz0_seconds: ["HR Zone 0 (s)"],
  hrz1_seconds: ["HR Zone 1 (s)"],
  hrz2_seconds: ["HR Zone 2 (s)"],
  hrz3_seconds: ["HR Zone 3 (s)"],
  hrz4_seconds: ["HR Zone 4 (s)"],
  hrz5_seconds: ["HR Zone 5 (s)"],
  trimp: ["TRIMP"],
  mets: ["METs", "METS"],
  rpe: ["RPE"],
} as const;

const getRequiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const toTrimmedString = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const parseNumeric = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = toTrimmedString(value);
  if (!raw) return null;

  const normalized = raw.replace(/,/g, "");
  if (!normalized || /^n\/?a$/i.test(normalized)) return null;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
};

const parseDuration = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Sheets duration cells can be fractions of a day when UNFORMATTED_VALUE is used.
    if (value > 0 && value < 2) return Math.max(0, Math.round(value * 86400));
    return Math.max(0, Math.round(value));
  }

  const raw = toTrimmedString(value);
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    if (numeric > 0 && numeric < 2) return Math.max(0, Math.round(numeric * 86400));
    return Math.max(0, Math.round(numeric));
  }

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return Math.max(0, Math.round(minutes * 60 + seconds));
  }

  return null;
};

const parseDate = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    const dt = new Date(ms);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  const raw = toTrimmedString(value);
  if (!raw) return null;

  const dateFormula = raw.match(/^=DATE\((\d+),(\d+),(\d+)\)$/i);
  if (dateFormula) {
    const year = Number(dateFormula[1]);
    const month = Number(dateFormula[2]);
    const day = Number(dateFormula[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoLike) {
    const year = Number(isoLike[1]);
    const month = Number(isoLike[2]);
    const day = Number(isoLike[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  const slashDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]);
    const year = Number(slashDate[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseTimestamp = (dateStr: string | null, timeValue: unknown): string | null => {
  if (!dateStr) return null;
  if (timeValue === null || timeValue === undefined) return null;

  if (typeof timeValue === "number" && Number.isFinite(timeValue)) {
    // If a full serial datetime is provided, use it directly.
    if (timeValue >= 2) {
      const serialMs = Date.UTC(1899, 11, 30) + timeValue * 86400000;
      const serialDate = new Date(serialMs);
      if (!Number.isNaN(serialDate.getTime())) return serialDate.toISOString();
    }

    // Otherwise treat as time-of-day fraction (0..1) and combine with date.
    const fraction = Math.max(0, Math.min(0.999999, timeValue));
    const totalSeconds = Math.floor(fraction * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const iso = `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}Z`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const timeStr = toTrimmedString(timeValue);
  if (!timeStr) return null;

  if (timeStr.includes("T")) {
    const direct = new Date(timeStr);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
  }

  const maybeWithSeconds = /^\d{1,2}:\d{2}$/.test(timeStr) ? `${timeStr}:00` : timeStr;
  const iso = `${dateStr}T${maybeWithSeconds}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildHeaderMap = (headerRow: unknown[]): HeaderMap => {
  const map: HeaderMap = {};
  headerRow.forEach((header, index) => {
    const normalized = toTrimmedString(header);
    if (normalized) map[normalized] = index;
  });
  return map;
};

const getCellByHeader = (row: unknown[], headerMap: HeaderMap, aliases: readonly string[]) => {
  for (const alias of aliases) {
    const idx = headerMap[alias];
    if (idx !== undefined) {
      return row[idx];
    }
  }
  return null;
};

const getGoogleAccessToken = async (serviceAccountJson: string): Promise<string> => {
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

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`Google auth failed: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
};

const fetchSheetRows = async (
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  range = "A:Z",
): Promise<unknown[][]> => {
  const encodedRange = encodeURIComponent(`${tabName}!${range}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Sheets API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return (data.values ?? []) as unknown[][];
};

const getLastSyncedDate = async (
  supabase: SupabaseClientLike,
  tableName: string,
  dateColumn: string,
  userId: string,
): Promise<string> => {
  const { data, error } = await supabase
    .from(tableName)
    .select(dateColumn)
    .eq("user_id", userId)
    .order(dateColumn, { ascending: false })
    .limit(1);

  if (error) {
    console.error(`Failed to query last synced date for ${tableName}:`, error);
    return DEFAULT_LAST_SYNC_DATE;
  }

  const lastDate = data?.[0]?.[dateColumn] as string | undefined;
  return lastDate ?? DEFAULT_LAST_SYNC_DATE;
};

const writeSyncLog = async (
  supabase: SupabaseClientLike,
  result: SyncResult,
) => {
  const { error } = await supabase.from("sync_log").insert({
    sheet_name: result.sheetName,
    rows_fetched: result.rowsFetched,
    rows_upserted: result.rowsUpserted,
    error_message: result.error,
    duration_ms: result.durationMs,
  });

  if (error) {
    console.error("Failed to write sync_log entry:", error);
  }
};

const normalizeDailyMetricsRows = (rows: unknown[][], lastDate: string) => {
  if (rows.length < 2) return { fetched: 0, upsertRows: [] as Record<string, unknown>[] };

  const headerMap = buildHeaderMap(rows[0]);
  const rowMap = new Map<string, Record<string, unknown>>();

  for (const row of rows.slice(1)) {
    const parsedDate = parseDate(getCellByHeader(row, headerMap, DAILY_HEADERS.date));
    if (!parsedDate || parsedDate <= lastDate) continue;

    rowMap.set(parsedDate, {
      date: parsedDate,
      active_energy_kcal: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.active_energy_kcal)),
      resting_energy_kcal: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.resting_energy_kcal)),
      resting_heart_rate: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.resting_heart_rate)),
      hrv: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.hrv)),
      steps: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.steps)),
      vo2max: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.vo2max)),
      exercise_time_minutes: (() => {
        const raw = getCellByHeader(row, headerMap, DAILY_HEADERS.exercise_time_minutes);
        const parsed = parseNumeric(raw);
        if (parsed !== null) return parsed;
        const durationSeconds = parseDuration(raw);
        return durationSeconds === null ? null : durationSeconds / 60.0;
      })(),
      stand_hours: parseNumeric(getCellByHeader(row, headerMap, DAILY_HEADERS.stand_hours)),
      source: "healthfit",
      updated_at: new Date().toISOString(),
    });
  }

  const upsertRows = Array.from(rowMap.values());
  return { fetched: Math.max(rows.length - 1, 0), upsertRows };
};

const normalizeBodyRows = (rows: unknown[][], lastDate: string) => {
  if (rows.length < 2) return { fetched: 0, upsertRows: [] as Record<string, unknown>[] };

  const headerMap = buildHeaderMap(rows[0]);
  const upsertRows: Record<string, unknown>[] = [];

  for (const row of rows.slice(1)) {
    const parsedDate = parseDate(getCellByHeader(row, headerMap, WEIGHT_HEADERS.date));
    if (!parsedDate || parsedDate <= lastDate) continue;

    upsertRows.push({
      date: parsedDate,
      weight_kg: parseNumeric(getCellByHeader(row, headerMap, WEIGHT_HEADERS.weight_kg)),
      body_fat_pct: parseNumeric(getCellByHeader(row, headerMap, WEIGHT_HEADERS.body_fat_pct)),
      bmi: parseNumeric(getCellByHeader(row, headerMap, WEIGHT_HEADERS.bmi)),
      source: "healthfit",
      updated_at: new Date().toISOString(),
    });
  }

  return { fetched: Math.max(rows.length - 1, 0), upsertRows };
};

const normalizeWorkoutRows = (rows: unknown[][], lastDate: string) => {
  if (rows.length < 2) return { fetched: 0, upsertRows: [] as Record<string, unknown>[] };

  const headerMap = buildHeaderMap(rows[0]);
  const upsertRows: Record<string, unknown>[] = [];

  for (const row of rows.slice(1)) {
    const workoutDate = parseDate(getCellByHeader(row, headerMap, WORKOUT_HEADERS.workout_date));
    if (!workoutDate || workoutDate <= lastDate) continue;

    const startedAt = parseTimestamp(workoutDate, getCellByHeader(row, headerMap, WORKOUT_HEADERS.started_at));
    if (!startedAt) continue;

    const endedAt = parseTimestamp(workoutDate, getCellByHeader(row, headerMap, WORKOUT_HEADERS.ended_at));
    const durationSeconds = parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.duration_seconds));
    const durationMinutes = durationSeconds === null ? null : durationSeconds / 60.0;
    const avgHeartRate = parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.avg_heart_rate));
    const maxHeartRate = parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.max_heart_rate));

    upsertRows.push({
      workout_date: workoutDate,
      started_at: startedAt,
      ended_at: endedAt,
      workout_type: toTrimmedString(getCellByHeader(row, headerMap, WORKOUT_HEADERS.workout_type)) || "Unknown",
      duration_seconds: durationSeconds,
      distance_km: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.distance_km)),
      elevation_gain_m: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.elevation_gain_m)),
      active_energy_kcal: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.active_energy_kcal)),
      total_energy_kcal: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.total_energy_kcal)),
      avg_heart_rate: avgHeartRate,
      max_heart_rate: maxHeartRate,
      hr_zone_type: toTrimmedString(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hr_zone_type)) || null,
      hrz0_seconds: parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hrz0_seconds)) ?? 0,
      hrz1_seconds: parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hrz1_seconds)) ?? 0,
      hrz2_seconds: parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hrz2_seconds)) ?? 0,
      hrz3_seconds: parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hrz3_seconds)) ?? 0,
      hrz4_seconds: parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hrz4_seconds)) ?? 0,
      hrz5_seconds: parseDuration(getCellByHeader(row, headerMap, WORKOUT_HEADERS.hrz5_seconds)) ?? 0,
      trimp: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.trimp)),
      mets: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.mets)),
      rpe: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.rpe)),
      temperature: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.temperature)),
      humidity: parseNumeric(getCellByHeader(row, headerMap, WORKOUT_HEADERS.humidity)),
      total_minutes: durationMinutes,
      move_minutes: durationMinutes,
      avg_hr: avgHeartRate,
      max_hr: maxHeartRate,
      source: "healthfit",
      updated_at: new Date().toISOString(),
    });
  }

  return { fetched: Math.max(rows.length - 1, 0), upsertRows };
};

const syncDailyMetrics = async (
  supabase: SupabaseClientLike,
  accessToken: string,
  spreadsheetId: string,
  userId: string,
): Promise<SyncResult> => {
  const start = Date.now();
  const sheetName = "health_metrics";

  try {
    const rows = await fetchSheetRows(accessToken, spreadsheetId, "Daily Metrics");
    const lastDate = await getLastSyncedDate(supabase, "health_metrics_daily", "date", userId);
    const normalized = normalizeDailyMetricsRows(rows, lastDate);

    if (normalized.upsertRows.length) {
      const payload = normalized.upsertRows.map((row) => ({ ...row, user_id: userId }));
      const { error } = await supabase
        .from("health_metrics_daily")
        .upsert(payload, { onConflict: "user_id,date" });
      if (error) throw new Error(`Daily metrics upsert failed: ${error.message}`);
    }

    return {
      sheetName,
      rowsFetched: normalized.fetched,
      rowsUpserted: normalized.upsertRows.length,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      sheetName,
      rowsFetched: 0,
      rowsUpserted: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
};

const syncBodyMetrics = async (
  supabase: SupabaseClientLike,
  accessToken: string,
  spreadsheetId: string,
  userId: string,
): Promise<SyncResult> => {
  const start = Date.now();
  const sheetName = "body";

  try {
    const rows = await fetchSheetRows(accessToken, spreadsheetId, "Weight");
    const lastDate = await getLastSyncedDate(supabase, "health_metrics_body", "date", userId);
    const normalized = normalizeBodyRows(rows, lastDate);

    if (normalized.upsertRows.length) {
      const payload = normalized.upsertRows.map((row) => ({ ...row, user_id: userId }));
      const { error } = await supabase
        .from("health_metrics_body")
        .upsert(payload, { onConflict: "user_id,date" });
      if (error) throw new Error(`Body metrics upsert failed: ${error.message}`);
    }

    return {
      sheetName,
      rowsFetched: normalized.fetched,
      rowsUpserted: normalized.upsertRows.length,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      sheetName,
      rowsFetched: 0,
      rowsUpserted: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
};

const syncWorkouts = async (
  supabase: SupabaseClientLike,
  accessToken: string,
  spreadsheetId: string,
  userId: string,
): Promise<SyncResult> => {
  const start = Date.now();
  const sheetName = "workouts";

  try {
    const rows = await fetchSheetRows(accessToken, spreadsheetId, "Workouts");
    const lastDate = await getLastSyncedDate(supabase, "exercise_events", "workout_date", userId);
    const normalized = normalizeWorkoutRows(rows, lastDate);

    if (normalized.upsertRows.length) {
      const payload = normalized.upsertRows.map((row) => ({ ...row, user_id: userId }));
      const { error } = await supabase
        .from("exercise_events")
        .upsert(payload, { onConflict: "user_id,workout_date,started_at" });
      if (error) throw new Error(`Workouts upsert failed: ${error.message}`);
    }

    return {
      sheetName,
      rowsFetched: normalized.fetched,
      rowsUpserted: normalized.upsertRows.length,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      sheetName,
      rowsFetched: 0,
      rowsUpserted: 0,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
};

serve(async () => {
  const supabase = createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  try {
    const userId = getRequiredEnv("SYNC_USER_ID");
    const healthSheetId = getRequiredEnv("HEALTH_SHEET_ID");
    const workoutsSheetId = getRequiredEnv("WORKOUTS_SHEET_ID");
    const serviceAccountJson = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON");

    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(serviceAccountJson);
    } catch (error) {
      const result: SyncResult = {
        sheetName: "google_auth",
        rowsFetched: 0,
        rowsUpserted: 0,
        error: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      };
      await writeSyncLog(supabase, result);
      throw error;
    }

    const results = [
      await syncDailyMetrics(supabase, accessToken, healthSheetId, userId),
      await syncBodyMetrics(supabase, accessToken, healthSheetId, userId),
      await syncWorkouts(supabase, accessToken, workoutsSheetId, userId),
    ];

    for (const result of results) {
      await writeSyncLog(supabase, result);
    }

    const hasErrors = results.some((result) => result.error);
    return new Response(JSON.stringify({ ok: !hasErrors, results }), {
      status: hasErrors ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-healthfit error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
