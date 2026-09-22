/**
 * Staging verification for the Transactions read model.
 *
 * Run against a real database (staging), NOT in CI without a DB:
 *   cd dashboard && DATABASE_URL=postgres://... npx tsx scripts/verify-transactions-union.ts
 *
 * It (1) probes each UNION source table in isolation so a failure names the exact
 * branch, (2) runs the full listTransactions() + a detail fetch, (3) checks for
 * duplicate transaction rows, and (4) prints per-source counts for a sanity
 * cross-check. Read-only — makes no writes.
 */
import { getSql } from "../src/lib/db/client";
import { listTransactions, getTransactionDetail } from "../src/lib/db/operations/transactions";

const SOURCE_PROBES: Array<{ name: string; sql: string }> = [
  { name: "pending_orders (customer food/grocery)", sql: `SELECT count(*)::int AS c FROM pending_orders` },
  {
    name: "order_payment (parcel + person_ride captures)",
    sql: `SELECT count(*)::int AS c FROM orders_core_payments ocp JOIN orders_core oc ON oc.order_id = ocp.order_id WHERE oc.order_type IN ('parcel','person_ride')`,
  },
  { name: "onboarding_payments (rider onboarding)", sql: `SELECT count(*)::int AS c FROM onboarding_payments` },
  { name: "rider_wallet_payments (rider wallet)", sql: `SELECT count(*)::int AS c FROM rider_wallet_payments` },
  { name: "subscription_payments (merchant subscription)", sql: `SELECT count(*)::int AS c FROM subscription_payments` },
  { name: "merchant_wallet_dues_payments (merchant dues)", sql: `SELECT count(*)::int AS c FROM merchant_wallet_dues_payments` },
  { name: "customer_wallet_topup_intents (wallet top-up)", sql: `SELECT count(*)::int AS c FROM customer_wallet_topup_intents` },
];

async function main() {
  const sql = getSql();
  let failures = 0;

  console.log("=== 1. Per-source probes (isolate any bad column/cast) ===");
  for (const p of SOURCE_PROBES) {
    try {
      const r = await sql.unsafe(p.sql);
      console.log(`  OK   ${p.name}: rows=${(r[0] as unknown as { c: number })?.c ?? "?"}`);
    } catch (e) {
      failures++;
      console.error(`  FAIL ${p.name}: ${(e as Error).message}`);
    }
  }

  console.log("\n=== 2. Full listTransactions() (limit 20, no filters) ===");
  try {
    const res = await listTransactions({ limit: 20 });
    console.log(`  rows=${res.rows.length} hasMore=${res.hasMore} nextCursor=${res.nextCursor ? "yes" : "no"}`);
    const uids = res.rows.map((r) => r.uid);
    const dupInPage = uids.length !== new Set(uids).size;
    console.log(`  duplicate uids in page: ${dupInPage ? "YES (BUG)" : "no"}`);
    const bySource = res.rows.reduce<Record<string, number>>((a, r) => ((a[r.source] = (a[r.source] ?? 0) + 1), a), {});
    console.log(`  by source:`, bySource);
    if (dupInPage) failures++;

    if (res.rows[0]) {
      console.log("\n  sample row:", JSON.stringify(res.rows[0], null, 2));
      const d = await getTransactionDetail(res.rows[0].uid);
      console.log(`  detail: breakdown=${d.breakdown.length} lifecycleEvents=${d.lifecycle.length}`);
    }
  } catch (e) {
    failures++;
    console.error(`  FAIL listTransactions: ${(e as Error).message}`);
  }

  console.log("\n=== 3. Per-app spot check ===");
  for (const app of ["customer", "merchant", "rider"] as const) {
    try {
      const r = await listTransactions({ app, limit: 5 });
      console.log(`  ${app}: ${r.rows.length} rows`);
    } catch (e) {
      failures++;
      console.error(`  FAIL ${app}: ${(e as Error).message}`);
    }
  }

  console.log(`\n=== DONE — ${failures === 0 ? "ALL CHECKS PASSED" : failures + " FAILURE(S)"} ===`);
  console.log("Next: run EXPLAIN (ANALYZE) on the union feed under a realistic dataset and add indexes only if the plan shows a hot seq-scan on a filter column.");
  await sql.end({ timeout: 5 });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verification crashed:", e);
  process.exit(1);
});
