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

  // Per-user token auth via hae_ingest_tokens table
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Look up the token to get the owning user_id
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("hae_ingest_tokens")
    .select("user_id")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = tokenRow.user_id;

  // Fire-and-forget: update last_used_at on the token
  supabase
    .from("hae_ingest_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token", token)
    .then();

  console.log(`Auth OK for user ${userId}, content-length: ${req.headers.get("content-length") ?? "unknown"}`);

  try {
    const body = await req.json();
    const payload = body?.data ?? body; // HAE wraps in { data: {...} }

    console.log(`Ingest start for user ${userId}`);

    // --- METRICS: flatten all data points across all metric types → single batch upsert ---
    const metrics = payload?.metrics ?? [];
    const metricRows = metrics.flatMap((metric: any) => {
      const name = metric.name ?? "unknown";
      const units = metric.units ?? null;
      return (metric.data ?? []).map((dp: any) => ({
        user_id: userId,
        metric_name: name,
        metric_units: units,
        date: dp.date ?? dp.startDate ?? null,
        qty: dp.qty ?? dp.Avg ?? null,
        raw_payload: dp,
      }));
    });

    let metricsInserted = 0;
    const METRIC_BATCH = 1000;
    for (let i = 0; i < metricRows.length; i += METRIC_BATCH) {
      const batch = metricRows.slice(i, i + METRIC_BATCH);
      const { error } = await supabase
        .from("staging_hae_metrics")
        .upsert(batch, { onConflict: "user_id,metric_name,date" });
      if (error) console.error(`Metrics upsert error (batch ${i / METRIC_BATCH}):`, error);
      else metricsInserted += batch.length;
    }
    console.log(`Metrics done: ${metricsInserted}`);

    // --- WORKOUTS: build all rows then single batch upsert ---
    const workouts = payload?.workouts ?? [];
    const workoutRows = workouts.map((w: any) => ({
      user_id: userId,
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
    }));

    let workoutsInserted = 0;
    if (workoutRows.length > 0) {
      const { error } = await supabase
        .from("staging_hae_workouts")
        .upsert(workoutRows, { onConflict: "user_id,workout_name,start_time" });
      if (error) console.error("Workouts upsert error:", error);
      else workoutsInserted = workoutRows.length;
    }
    console.log(`Workouts done: ${workoutsInserted}`);

    // --- EVERYTHING ELSE: one insert per data_type (not per item) ---
    const knownKeys = ["metrics", "workouts"];
    let otherInserted = 0;
    for (const key of Object.keys(payload)) {
      if (knownKeys.includes(key)) continue;
      const items = Array.isArray(payload[key]) ? payload[key] : [payload[key]];
      const rows = items.map((item: any) => ({
        user_id: userId,
        data_type: key,
        raw_payload: item,
      }));
      if (rows.length > 0) {
        const { error } = await supabase
          .from("staging_hae_other")
          .insert(rows);
        if (error) console.error(`Other insert error (${key}):`, error);
        else otherInserted += rows.length;
      }
    }

    console.log(`Ingested for user ${userId}: ${metricsInserted} metrics, ${workoutsInserted} workouts, ${otherInserted} other`);

    return new Response(
      JSON.stringify({
        success: true,
        metrics_inserted: metricsInserted,
        workouts_inserted: workoutsInserted,
        other_inserted: otherInserted,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
