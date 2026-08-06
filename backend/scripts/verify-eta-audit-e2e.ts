/**
 * End-to-end Phase 3 ETA audit check.
 * Usage: npx tsx scripts/verify-eta-audit-e2e.ts [ORDER_ID]
 */
import { loadEnv } from "../src/config/loadEnv.js";
loadEnv();

import { getEtaTimelineForOrder } from "../src/modules/eta/eta.history-service.js";
import { getEtaDriftAnalytics } from "../src/modules/eta/eta.analytics.js";
import { runLiveEtaForOrder } from "../src/modules/eta/eta.live-engine.js";
import { getSql } from "../src/db/client.js";

const orderId = process.argv[2] || "GM10000248";

async function main() {
  console.log("Order:", orderId);

  const before = await getEtaTimelineForOrder(orderId, {
    audience: "admin",
    order: "desc",
    limit: 5,
  });
  console.log("timeline.before.count", before.entries.length);
  if (before.entries[0]) {
    console.log("timeline.before.latest", {
      etaVersion: before.entries[0].etaVersion,
      id: before.entries[0].id,
      label: before.entries[0].label,
      stage: before.entries[0].stage,
    });
  }

  const run = await runLiveEtaForOrder(orderId, "STATUS_CHANGE");
  console.log(
    "recalc",
    run
      ? {
          changed: run.changed,
          version: run.stageAware.etaVersion,
          stage: run.stageAware.currentStage,
          display: run.stageAware.displayEta,
        }
      : "null (inactive/missing)"
  );

  const after = await getEtaTimelineForOrder(orderId, {
    audience: "admin",
    order: "desc",
    limit: 3,
  });
  const top = after.entries[0];
  if (!top) {
    console.error("FAIL: no timeline entries after recalc");
    process.exit(1);
  }
  const versionMatchesId = top.etaVersion === top.id;
  console.log("timeline.after.top", {
    etaVersion: top.etaVersion,
    id: top.id,
    versionMatchesId,
    stage: top.stage,
    displayEta: top.displayEta,
    totalEta: top.totalEta,
    delta: top.deltaMinutes,
    source: top.etaSource,
    confidence: top.confidence,
    freeze: top.freezeCountdown,
    hasPrevious: Boolean(top.previous),
    hasNext: Boolean(top.next),
  });
  if (!versionMatchesId) {
    console.error("FAIL: etaVersion !== history id");
    process.exit(1);
  }

  const sql = getSql();
  const row = await sql<
    Array<{
      id: number;
      order_status: string | null;
      current_stage: string | null;
      display_eta_minutes: number | null;
      previous_snapshot: unknown;
      new_snapshot: unknown;
    }>
  >`
    SELECT id, order_status, current_stage, display_eta_minutes,
           previous_snapshot, new_snapshot
    FROM order_eta_history
    WHERE id = ${top.id}
    LIMIT 1
  `;
  const dbRow = row[0];
  console.log("db.row.audit_fields", {
    id: dbRow?.id,
    order_status: dbRow?.order_status,
    current_stage: dbRow?.current_stage,
    display_eta_minutes: dbRow?.display_eta_minutes,
    hasPrevSnap: dbRow?.previous_snapshot != null,
    hasNewSnap: dbRow?.new_snapshot != null,
  });

  if (run?.changed) {
    if (!dbRow?.current_stage && !dbRow?.new_snapshot) {
      console.error("FAIL: new changed row missing audit fields");
      process.exit(1);
    }
  }

  const customer = await getEtaTimelineForOrder(orderId, {
    audience: "customer",
    order: "asc",
    limit: 50,
  });
  console.log(
    "customer.timeline.labels",
    customer.entries.map((e) => e.label)
  );
  if (customer.entries.some((e) => e.riderId != null || e.breakdown != null)) {
    console.error("FAIL: customer audience leaked admin fields");
    process.exit(1);
  }

  const drift = await getEtaDriftAnalytics({ days: 30 });
  console.log("analytics.drift", {
    sampleSize: drift.sampleSize,
    avgAbsDeltaMinutes: drift.avgAbsDeltaMinutes,
    topReasons: drift.byReason.slice(0, 3),
  });
  if (drift.sampleSize <= 0) {
    console.error("FAIL: drift sample empty unexpectedly");
    process.exit(1);
  }

  console.log("Phase 3 E2E verification PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
