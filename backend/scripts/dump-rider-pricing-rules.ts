/**
 * READ-ONLY dump of the seeded rider pricing rules, so the payout model can be corrected
 * safely (the seed script and the live DB have diverged — e.g. food orders resolve vehicle=NULL
 * but some leg rules were seeded with vehicle_type='2_wheeler', so they never match).
 *
 * Writes NOTHING. Run on the VPS:
 *   cd /opt/gatimitra && git fetch -q origin diag/rider-payout-recheck \
 *     && git checkout origin/diag/rider-payout-recheck -- backend/scripts/dump-rider-pricing-rules.ts \
 *     && cd backend && npx tsx scripts/dump-rider-pricing-rules.ts
 */

import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1, prepare: false });

async function run() {
  try {
    // 1) rider_leg_pricing — grouped by config, with how many geo nodes carry it.
    const legs = await sql`
      SELECT leg, service_type::text AS service, vehicle_type::text AS vehicle,
             min_km::text AS min_km, max_km::text AS max_km,
             base_amount::text AS base, rate_per_km::text AS rate,
             min_amount::text AS min_amount, max_amount::text AS max_amount,
             funding, is_active,
             COUNT(DISTINCT geo_ref_id) AS geo_nodes,
             MIN(id) AS sample_id
      FROM rider_leg_pricing
      GROUP BY leg, service_type, vehicle_type, min_km, max_km, base_amount,
               rate_per_km, min_amount, max_amount, funding, is_active
      ORDER BY service, leg, vehicle NULLS FIRST, min_km::numeric
    `;
    console.log("\n========== rider_leg_pricing (grouped configs) ==========");
    console.log("leg | service | vehicle | km-slab | base | rate/km | minAmt | maxAmt | funding | active | #geo | sampleId");
    for (const r of legs as Record<string, string>[]) {
      console.log(
        `${r.leg} | ${r.service} | ${r.vehicle ?? "NULL"} | ${r.min_km}-${r.max_km ?? "∞"} | ` +
          `${r.base ?? "-"} | ${r.rate} | ${r.min_amount ?? "-"} | ${r.max_amount ?? "-"} | ` +
          `${r.funding} | ${r.is_active} | ${r.geo_nodes} | ${r.sample_id}`
      );
    }

    // 2) The mismatch: food/parcel leg rules whose vehicle_type is NOT the value the order
    //    resolver uses. Food resolves vehicle=NULL, so any food rule with a non-NULL vehicle
    //    is DEAD (never matches a real food order).
    const deadFood = await sql`
      SELECT COUNT(*) AS n FROM rider_leg_pricing
      WHERE service_type='food' AND vehicle_type IS NOT NULL AND is_active=true
    `;
    const liveFood = await sql`
      SELECT COUNT(*) AS n FROM rider_leg_pricing
      WHERE service_type='food' AND vehicle_type IS NULL AND is_active=true
    `;
    console.log(
      `\n[food leg rules] vehicle=NULL (match real food orders): ${(liveFood[0] as { n: string }).n}  |  ` +
        `vehicle!=NULL (DEAD for food): ${(deadFood[0] as { n: string }).n}`
    );

    // 3) service_payout_rules — the % pool + waiting, grouped.
    const pay = await sql`
      SELECT service_type::text AS service, vehicle_type::text AS vehicle,
             rider_percentage::text AS rider_pct, platform_percentage::text AS plat_pct,
             waiting_charge_per_min::text AS wait_per_min, waiting_free_minutes::text AS wait_free,
             waiting_max_charge::text AS wait_max, waiting_funding_mode AS wait_fund,
             is_active,
             COUNT(DISTINCT geo_ref_id) AS geo_nodes
      FROM service_payout_rules
      WHERE deleted_at IS NULL
      GROUP BY service_type, vehicle_type, rider_percentage, platform_percentage,
               waiting_charge_per_min, waiting_free_minutes, waiting_max_charge,
               waiting_funding_mode, is_active
      ORDER BY service, vehicle NULLS FIRST
    `;
    console.log("\n========== service_payout_rules (grouped) ==========");
    console.log("service | vehicle | rider% | plat% | wait/min | freeMin | waitMax | waitFund | active | #geo");
    for (const r of pay as Record<string, string>[]) {
      console.log(
        `${r.service} | ${r.vehicle ?? "NULL"} | ${r.rider_pct} | ${r.plat_pct} | ` +
          `${r.wait_per_min ?? "-"} | ${r.wait_free ?? "-"} | ${r.wait_max ?? "-"} | ` +
          `${r.wait_fund ?? "-"} | ${r.is_active} | ${r.geo_nodes}`
      );
    }

    // 4) Non-state overrides (pincode/district/etc.) — so a re-seed doesn't miss admin edits.
    const overrides = await sql`
      SELECT 'leg' AS tbl, geo_level::text AS lvl, COUNT(*) AS n
      FROM rider_leg_pricing WHERE geo_level <> 'state'
      GROUP BY geo_level
      UNION ALL
      SELECT 'payout' AS tbl, geo_level::text AS lvl, COUNT(*) AS n
      FROM service_payout_rules WHERE geo_level <> 'state' AND deleted_at IS NULL
      GROUP BY geo_level
    `;
    console.log("\n========== non-state overrides (admin edits to preserve) ==========");
    if ((overrides as unknown[]).length === 0) console.log("(none — all rules are state-level)");
    for (const r of overrides as Record<string, string>[]) {
      console.log(`${r.tbl} @ ${r.lvl}: ${r.n}`);
    }

    console.log("\n=== done ===\n");
  } finally {
    await sql.end({ timeout: 3 }).catch(() => undefined);
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
