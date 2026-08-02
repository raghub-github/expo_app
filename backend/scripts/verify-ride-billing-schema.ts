/**
 * Smoke-check ride billing tables/columns created by 0463–0469.
 * Usage: npx tsx scripts/verify-ride-billing-schema.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

const REQUIRED_TABLES = [
  "ride_settlements",
  "ride_settlement_ledger",
  "ride_wallet_config",
  "ride_wallet_config_history",
  "ride_night_configs",
  "ride_toll_events",
  "service_cancellation_compensation_rules",
  "service_cancellation_settlements",
  "ride_billing_activity",
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  service_payout_rules: [
    "waiting_max_charge",
    "waiting_funding_mode",
    "waiting_customer_share_pct",
    "waiting_company_share_pct",
  ],
  state_surge_configs: ["funding_mode", "customer_share_pct", "company_share_pct"],
  ride_wallet_config: ["commission_on_toll"],
  orders_ride: ["cash_collected_at", "cash_collected_by_rider_id", "settlement_id"],
};

async function main() {
  let failed = 0;

  for (const table of REQUIRED_TABLES) {
    const rows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${table}
      ) AS exists
    `;
    const ok = rows[0]?.exists === true;
    console.log(ok ? `OK  table ${table}` : `FAIL table ${table}`);
    if (!ok) failed++;
  }

  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    for (const col of cols) {
      const rows = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ${table}
            AND column_name = ${col}
        ) AS exists
      `;
      const ok = rows[0]?.exists === true;
      console.log(ok ? `OK  column ${table}.${col}` : `FAIL column ${table}.${col}`);
      if (!ok) failed++;
    }
  }

  // Seed sanity: inactive fare component rules and cancel rules exist
  const fareSeeds = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM billing_pricing_rules
    WHERE metadata->>'source' = 'ride_fare_components_seed_v1'
  `;
  const cancelSeeds = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM service_cancellation_compensation_rules
    WHERE metadata->>'source' = 'cancel_comp_seed_v1'
  `;
  const taxSeeds = await sql<{ n: string }[]>`
    SELECT COUNT(*)::text AS n FROM billing_pricing_rules
    WHERE metadata->>'source' = 'ride_component_tax_seed_v1'
  `;
  console.log(`OK  fare component seeds: ${fareSeeds[0]?.n}`);
  console.log(`OK  cancel compensation seeds: ${cancelSeeds[0]?.n}`);
  console.log(`OK  component tax seeds: ${taxSeeds[0]?.n}`);

  // Wallet policy singleton
  const policy = await sql`
    SELECT service_negative_threshold, global_block_threshold,
           cash_settlement_enabled, commission_on_toll
    FROM ride_wallet_config WHERE is_active = TRUE LIMIT 1
  `;
  console.log("OK  active wallet policy:", policy[0] ?? "(none — defaults used at runtime)");

  await sql.end();
  if (failed > 0) {
    console.error(`\n${failed} schema check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll ride billing schema checks passed.");
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
