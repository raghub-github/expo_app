/**
 * READ-ONLY verification for the tracking migrations (0471-0473).
 * Confirms tables/columns/indexes exist and reports row counts. No writes.
 * Usage (from backend/): npx tsx scripts/verify-tracking.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

async function run() {
  try {
    const tables = ["tracking_config", "tracking_sessions", "tracking_events", "tracking_violations"];
    console.log("=== tracking tables present? ===");
    for (const t of tables) {
      const r = await sql`SELECT to_regclass(${"public." + t}) AS reg`;
      console.log(`  ${t.padEnd(22)} ${r[0].reg ? "EXISTS" : "MISSING"}`);
    }

    console.log("\n=== order_rider_tracking new columns ===");
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_rider_tracking'
        AND column_name IN ('session_id','assignment_id','service_type','sequence_number','source')
      ORDER BY column_name`;
    console.log("  " + cols.map((c) => c.column_name).join(", "));

    console.log("\n=== tracking_sessions.geo_state column (0473) ===");
    const geo = await sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tracking_sessions' AND column_name='geo_state'`;
    console.log("  " + (geo.length ? `${geo[0].column_name} (${geo[0].data_type})` : "MISSING"));

    console.log("\n=== key indexes ===");
    const idx = await sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname IN (
        'tracking_sessions_active_order_rider_uidx',
        'tracking_sessions_order_started_idx',
        'tracking_events_order_created_idx',
        'tracking_violations_status_idx',
        'order_rider_tracking_session_seq_idx')
      ORDER BY indexname`;
    idx.forEach((i) => console.log("  " + i.indexname));

    console.log("\n=== tracking_config singleton row ===");
    const cfg = await sql`SELECT id, tracking_interval_seconds, movement_threshold_m, stationary_timeout_seconds, deviation_distance_m, enable_stationary_rule, enable_deviation_rule, enable_wrong_direction_rule FROM public.tracking_config WHERE id=1`;
    console.log("  " + (cfg.length ? JSON.stringify(cfg[0]) : "NO ROW"));

    console.log("\n=== row counts ===");
    for (const t of tables) {
      const c = await sql.unsafe(`SELECT count(*)::int AS n FROM public.${t}`);
      console.log(`  ${t.padEnd(22)} ${c[0].n}`);
    }
    const ort = await sql`SELECT count(*)::int AS n FROM public.order_rider_tracking WHERE session_id IS NOT NULL`;
    console.log(`  order_rider_tracking (session_id set) ${ort[0].n}`);

    console.log("\nOK");
  } catch (err) {
    console.error("Verification failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
