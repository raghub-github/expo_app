/**
 * Reconciliation checks for OMS+Billing+Ledger.
 *
 * Usage:
 *   npx tsx scripts/reconcile-oms-ledger.ts --limit=2000
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
  const limit = Math.max(1, parseInt(arg("limit", "2000"), 10));

  try {
    const [a] = await sql<{ bad_count: number }[]>`
      SELECT COUNT(*)::int AS bad_count
      FROM (
        SELECT b.order_id, b.version_no, b.payable_total,
               COALESCE((
                 SELECT SUM(final_amount)::numeric FROM order_charge_lines c
                 WHERE c.order_id = b.order_id AND c.version_no = b.version_no
               ), 0) AS charge_sum,
               COALESCE((
                 SELECT SUM(amount)::numeric FROM order_discount_lines d
                 WHERE d.order_id = b.order_id AND d.version_no = b.version_no
               ), 0) AS discount_sum,
               COALESCE((
                 SELECT SUM(tax_amount)::numeric FROM order_tax_lines t
                 WHERE t.order_id = b.order_id AND t.version_no = b.version_no
               ), 0) AS tax_sum
        FROM order_bill_summary_versions b
        ORDER BY b.created_at DESC
        LIMIT ${limit}
      ) q
      WHERE ABS(COALESCE(q.payable_total, 0) - (COALESCE(q.charge_sum, 0) - COALESCE(q.discount_sum, 0) + COALESCE(q.tax_sum, 0))) > 0.05
    `;

    const [b] = await sql<{ bad_count: number }[]>`
      SELECT COUNT(*)::int AS bad_count
      FROM (
        SELECT e.journal_id,
               COALESCE(SUM(CASE WHEN e.direction = 'debit' THEN e.amount ELSE 0 END), 0) AS debit_sum,
               COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE 0 END), 0) AS credit_sum
        FROM ledger_entries e
        GROUP BY e.journal_id
      ) x
      WHERE ABS(x.debit_sum - x.credit_sum) > 0.01
    `;

    const [c] = await sql<{ duplicate_count: number }[]>`
      SELECT COUNT(*)::int AS duplicate_count
      FROM (
        SELECT order_id, idempotency_key, COUNT(*) AS n
        FROM order_rider_assignment_events
        GROUP BY order_id, idempotency_key
        HAVING COUNT(*) > 1
      ) d
    `;

    console.log(`[reconcile] bill_math_failures=${a?.bad_count ?? 0}`);
    console.log(`[reconcile] unbalanced_journals=${b?.bad_count ?? 0}`);
    console.log(`[reconcile] rider_idempotency_duplicates=${c?.duplicate_count ?? 0}`);
    if ((a?.bad_count ?? 0) > 0 || (b?.bad_count ?? 0) > 0 || (c?.duplicate_count ?? 0) > 0) {
      process.exitCode = 2;
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[reconcile] failed", e);
  process.exit(1);
});
