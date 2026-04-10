/**
 * Backfill OMS billing decomposition + snapshot + ledger references for existing finalized orders.
 *
 * Usage:
 *   npx tsx scripts/backfill-oms-ledger.ts --limit=1000 --dry-run
 *   npx tsx scripts/backfill-oms-ledger.ts --limit=1000
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getSql } from "../src/db/client.js";

function arg(name: string, fallback: string): string {
  const k = `--${name}=`;
  const v = process.argv.find((x) => x.startsWith(k));
  return v ? v.slice(k.length) : fallback;
}

async function main() {
  loadEnv();
  const sql = getSql();
  const dryRun = process.argv.includes("--dry-run");
  const limit = Math.max(1, parseInt(arg("limit", "1000"), 10));

  try {
    const rows = await sql<{ order_id: string; billing_snapshot: unknown; billing_ruleset_version: number | null }[]>`
      SELECT p.finalized_order_id AS order_id, p.billing_snapshot, p.billing_ruleset_version
      FROM pending_orders p
      WHERE p.finalized_order_id IS NOT NULL
        AND p.billing_snapshot IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM order_version_snapshots ovs
          WHERE ovs.order_id = p.finalized_order_id AND ovs.version_no = 1
        )
      ORDER BY p.finalized_at DESC NULLS LAST
      LIMIT ${limit}
    `;

    console.log(`[backfill] candidate orders=${rows.length} dryRun=${dryRun}`);
    if (dryRun || rows.length === 0) return;

    let done = 0;
    for (const r of rows) {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO order_version_snapshots (order_id, version_no, source, snapshot, ruleset_version)
          VALUES (${r.order_id}, 1, 'backfill_pending_snapshot', ${JSON.stringify(r.billing_snapshot ?? {})}::jsonb, ${r.billing_ruleset_version})
          ON CONFLICT (order_id, version_no) DO NOTHING
        `;
      });
      done += 1;
      if (done % 100 === 0) console.log(`[backfill] processed=${done}`);
    }
    console.log(`[backfill] completed=${done}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[backfill] failed", e);
  process.exit(1);
});
