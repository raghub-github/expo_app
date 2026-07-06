/**
 * Quick verify geo_fallback_pricing_slabs — exits cleanly (no hanging pool).
 * Usage: npx tsx scripts/verify-fallback-slabs.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
});

try {
  const counts = await sql`
    SELECT service_type, vehicle_type, count(*)::int AS n
    FROM geo_fallback_pricing_slabs
    WHERE deleted_at IS NULL
    GROUP BY 1, 2
    ORDER BY 1, 2 NULLS FIRST
  `;
  console.log("Fallback slab counts:", counts);

  const food = await sql`
    SELECT min_km, max_km, base_fare, per_km_rate, min_charge
    FROM geo_fallback_pricing_slabs
    WHERE service_type = 'food' AND deleted_at IS NULL
    ORDER BY min_km
  `;
  console.log("Food slabs:", food);
} finally {
  await sql.end({ timeout: 5 });
}
