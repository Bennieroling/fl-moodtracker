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

  try {
    const body = await req.json();
    const payload = body?.data ?? body; // HAE wraps in { data: {...} }

    let metricsInserted = 0;
    let workoutsInserted = 0;
    let otherInserted = 0;

    // --- METRICS ---
    const metrics = payload?.metrics ?? [];
    for (const metric of metrics) {
      const name = metric.name ?? "unknown";
      const units = metric.units ?? null;
      const dataPoints = metric.data ?? [];

      const rows = dataPoints.map((dp: any) => ({
        user_id: userId,
        metric_name: name,
        metric_units: units,
        date: dp.date ?? dp.startDate ?? null,
        qty: dp.qty ?? dp.Avg ?? null,
        raw_payload: dp,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("staging_hae_metrics")
          .upsert(rows, { onConflict: "user_id,metric_name,date" });
        if (error) console.error(`Metrics upsert error (${name}):`, error);
        else metricsInserted += rows.length;
      }
    }

    // --- WORKOUTS ---
    const workouts = payload?.workouts ?? [];
    for (const w of workouts) {
      const row = {
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
      };

      const { error } = await supabase
        .from("staging_hae_workouts")
        .upsert([row], { onConflict: "user_id,workout_name,start_time" });
      if (error) console.error("Workout upsert error:", error);
      else workoutsInserted++;
    }

    // --- EVERYTHING ELSE (ECG, State of Mind, Heart Rate Notifications, etc.) ---
    const knownKeys = ["metrics", "workouts"];
    for (const key of Object.keys(payload)) {
      if (knownKeys.includes(key)) continue;

      const items = Array.isArray(payload[key]) ? payload[key] : [payload[key]];
      for (const item of items) {
        const { error } = await supabase
          .from("staging_hae_other")
          .insert({ user_id: userId, data_type: key, raw_payload: item });
        if (error) console.error(`Other insert error (${key}):`, error);
        else otherInserted++;
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
