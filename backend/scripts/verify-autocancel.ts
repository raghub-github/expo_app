/** READ-ONLY: verify gm_rider_auto_cancel_config (migration 0474). */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";
loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
async function run() {
  try {
    const reg = await sql`SELECT to_regclass('public.gm_rider_auto_cancel_config') AS reg`;
    console.log("table:", reg[0].reg ? "EXISTS" : "MISSING");
    if (reg[0].reg) {
      const rows = await sql`
        SELECT service_type, phase, is_enabled, penalty_amount,
               opposite_direction_km, no_movement_minutes, location_off_minutes,
               route_deviation_m, warning_interval_minutes, updated_at
        FROM public.gm_rider_auto_cancel_config
        ORDER BY service_type`;
      console.log("rows:");
      rows.forEach((r) =>
        console.log(
          `  ${String(r.service_type).padEnd(12)} ${r.phase} enabled=${r.is_enabled} ` +
            `pen=${r.penalty_amount} oppKm=${r.opposite_direction_km} noMove=${r.no_movement_minutes} ` +
            `locOff=${r.location_off_minutes} warnEvery=${r.warning_interval_minutes} updated=${r.updated_at?.toISOString?.() ?? r.updated_at}`
        )
      );
    }
    console.log("OK");
  } catch (e) {
    console.error("verify failed:", e);
    process.exit(1);
  } finally {
    await sql.end();
  }
}
run();
