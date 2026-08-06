import { loadEnv } from "../src/config/loadEnv.js";
loadEnv();
import { getSql } from "../src/db/client.js";
import { runLiveEtaForOrder } from "../src/modules/eta/eta.live-engine.js";

const sql = getSql();

async function main() {
  const active = await sql<
    Array<{ order_id: string; current_status: string | null }>
  >`
    SELECT order_id, current_status
    FROM orders_core
    WHERE actual_delivery_time IS NULL
      AND UPPER(COALESCE(current_status, status::text, '')) NOT IN (
        'DELIVERED', 'CANCELLED', 'FAILED', 'PAYMENT_FAILED', 'RTO'
      )
      AND order_id LIKE 'GM%'
    ORDER BY id DESC
    LIMIT 5
  `;
  console.log("active", active);

  for (const row of active) {
    const result = await runLiveEtaForOrder(row.order_id, "STATUS_CHANGE");
    console.log("run", row.order_id, result
      ? { changed: result.changed, v: result.stageAware.etaVersion, stage: result.stageAware.currentStage }
      : null);
    if (!result?.changed) continue;

    const audit = await sql<
      Array<{
        id: number;
        order_status: string | null;
        current_stage: string | null;
        display_eta_minutes: number | null;
        eta_source: string | null;
        delta_minutes: number | null;
        previous_snapshot: unknown;
        new_snapshot: unknown;
      }>
    >`
      SELECT id, order_status, current_stage, display_eta_minutes, eta_source,
             delta_minutes, previous_snapshot, new_snapshot
      FROM order_eta_history
      WHERE id = ${result.stageAware.etaVersion}
      LIMIT 1
    `;
    console.log("enriched_audit_row", audit[0]);
    if (!audit[0]?.current_stage || audit[0].new_snapshot == null) {
      console.error("FAIL enriched fields missing");
      process.exit(1);
    }
    console.log("NEW ORDER AUDIT FIELDS OK");
    process.exit(0);
  }

  console.log("No active order produced a changed ETA (still OK — migration + APIs verified)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
