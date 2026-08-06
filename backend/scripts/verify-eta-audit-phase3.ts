/**
 * Verify Phase 3 ETA audit columns + sample history/timeline/analytics.
 * Usage: npx tsx scripts/verify-eta-audit-phase3.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

const REQUIRED_COLS = [
  "order_status",
  "current_stage",
  "display_eta_minutes",
  "total_eta_minutes",
  "confidence",
  "freeze_countdown",
  "eta_source",
  "delta_minutes",
  "previous_snapshot",
  "new_snapshot",
];

async function main() {
  const cols = await sql<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_eta_history'
      AND column_name = ANY(${REQUIRED_COLS})
  `;
  const present = new Set(cols.map((c) => c.column_name));
  const missing = REQUIRED_COLS.filter((c) => !present.has(c));
  if (missing.length) {
    console.error("MISSING columns:", missing.join(", "));
    process.exit(1);
  }
  console.log("OK columns:", REQUIRED_COLS.join(", "));

  const indexes = await sql<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'order_eta_history'
      AND indexname IN (
        'idx_order_eta_history_stage',
        'idx_order_eta_history_source',
        'idx_order_eta_history_store_created'
      )
  `;
  console.log(
    "OK indexes:",
    indexes.map((i) => i.indexname).join(", ") || "(none — check if created)"
  );

  const recent = await sql<
    Array<{
      id: number;
      order_id_text: string;
      recalc_reason: string;
      current_stage: string | null;
      display_eta_minutes: number | null;
      delta_minutes: number | null;
      metadata: unknown;
      created_at: string;
    }>
  >`
    SELECT id, order_id_text, recalc_reason, current_stage, display_eta_minutes,
           delta_minutes, metadata, created_at::text
    FROM order_eta_history
    ORDER BY id DESC
    LIMIT 5
  `;
  console.log("Recent history rows:", recent.length);
  for (const r of recent) {
    const meta =
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {};
    console.log(
      `  #${r.id} ${r.order_id_text} reason=${r.recalc_reason} stage=${r.current_stage ?? meta.stageAware ? "meta" : "null"} display=${r.display_eta_minutes} delta=${r.delta_minutes}`
    );
  }

  // Drift analytics query smoke (same shape as getEtaDriftAnalytics)
  const drift = await sql<Array<{ sample_size: string }>>`
    SELECT COUNT(*)::text AS sample_size
    FROM order_eta_history
    WHERE created_at >= NOW() - interval '30 days'
  `;
  console.log("Drift sample (30d):", drift[0]?.sample_size ?? "0");

  console.log("Phase 3 migration verification PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end();
  });
