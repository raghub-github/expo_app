/**
 * Standalone staging verification (no Next.js server-only import).
 * Extracts the real UNION_CTE from the operations source (it has no ${} params)
 * and runs it directly via postgres.js. Read-only.
 *
 *   cd dashboard
 *   DATABASE_URL='postgres://...' node scripts/verify-transactions-db.mjs
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required"); process.exit(1); }

const src = readFileSync(new URL("../src/lib/db/operations/transactions.ts", import.meta.url), "utf8");
const m = src.match(/const UNION_CTE = sql`([\s\S]*?)`;/);
if (!m) { console.error("could not extract UNION_CTE from transactions.ts"); process.exit(1); }
const CTE = m[1]; // "WITH all_txn AS ( ... )"

const sql = postgres(url, { max: 1, prepare: false, ssl: "require", idle_timeout: 5 });

const PROBES = [
  ["pending_orders", "SELECT count(*)::int AS c FROM pending_orders"],
  ["order_payment(parcel/ride)", "SELECT count(*)::int AS c FROM orders_core_payments ocp JOIN orders_core oc ON oc.order_id=ocp.order_id WHERE oc.order_type IN ('parcel','person_ride')"],
  ["onboarding_payments", "SELECT count(*)::int AS c FROM onboarding_payments"],
  ["rider_wallet_payments", "SELECT count(*)::int AS c FROM rider_wallet_payments"],
  ["subscription_payments", "SELECT count(*)::int AS c FROM subscription_payments"],
  ["merchant_wallet_dues_payments", "SELECT count(*)::int AS c FROM merchant_wallet_dues_payments"],
  ["merchant_onboarding_payments", "SELECT count(*)::int AS c FROM merchant_onboarding_payments"],
  ["customer_wallet_topup_intents", "SELECT count(*)::int AS c FROM customer_wallet_topup_intents"],
];

let fails = 0;
try {
  console.log("=== 1. per-source probes ===");
  for (const [name, q] of PROBES) {
    try { const r = await sql.unsafe(q); console.log(`  OK   ${name}: rows=${r[0].c}`); }
    catch (e) { fails++; console.error(`  FAIL ${name}: ${e.message}`); }
  }

  console.log("\n=== 2. full UNION list (limit 20) ===");
  try {
    const rows = await sql.unsafe(`${CTE} SELECT t.* FROM all_txn t ORDER BY t.created_at DESC, t.uid DESC LIMIT 20`);
    console.log(`  rows=${rows.length}`);
    const uids = rows.map((r) => r.uid);
    console.log(`  duplicate uids: ${uids.length !== new Set(uids).size ? "YES (BUG)" : "no"}`);
    const bySrc = {};
    for (const r of rows) bySrc[r.source] = (bySrc[r.source] || 0) + 1;
    console.log("  by source:", bySrc);
    if (rows[0]) console.log("  sample:", JSON.stringify(rows[0]));
  } catch (e) { fails++; console.error(`  FAIL union list: ${e.message}`); }

  console.log("\n=== 3. per-app counts (via union) ===");
  for (const app of ["customer", "merchant", "rider"]) {
    try { const r = await sql.unsafe(`${CTE} SELECT count(*)::int AS c FROM all_txn t WHERE t.app='${app}'`); console.log(`  ${app}: ${r[0].c}`); }
    catch (e) { fails++; console.error(`  FAIL ${app}: ${e.message}`); }
  }

  console.log("\n=== 4. status distribution (via union) ===");
  try {
    const r = await sql.unsafe(`${CTE} SELECT t.app, t.norm_status, count(*)::int AS c FROM all_txn t GROUP BY 1,2 ORDER BY 1,2`);
    for (const row of r) console.log(`  ${row.app.padEnd(9)} ${row.norm_status.padEnd(24)} ${row.c}`);
  } catch (e) { fails++; console.error(`  FAIL status dist: ${e.message}`); }
} finally {
  await sql.end({ timeout: 5 });
}
console.log(`\n=== ${fails === 0 ? "ALL CHECKS PASSED" : fails + " FAILURE(S)"} ===`);
process.exit(fails === 0 ? 0 : 1);
