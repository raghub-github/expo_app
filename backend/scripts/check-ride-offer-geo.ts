import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

async function run() {
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'billing_platform_offers'
      ORDER BY ordinal_position
    `;
    const offers = await sql`
      SELECT
        id,
        name,
        coupon_code,
        service_type,
        target_scope,
        customer_segment,
        offer_kind,
        discount_type,
        value_numeric::text AS value_numeric,
        max_discount_amount::text AS max_discount_amount,
        min_order_amount::text AS min_order_amount,
        is_active,
        is_hidden,
        offer_audience,
        promo_config,
        starts_at,
        ends_at,
        priority
      FROM billing_platform_offers
      ORDER BY id
    `;
    const binds = await sql`
      SELECT
        b.platform_offer_id,
        b.geo_level::text AS geo_level,
        COALESCE(s.name, r.name, d.name, b.geo_ref_id::text) AS node_name
      FROM geo_platform_offer_bindings b
      LEFT JOIN states s ON b.geo_level = 'state' AND s.id = b.geo_ref_id
      LEFT JOIN regions r ON b.geo_level = 'region' AND r.id = b.geo_ref_id
      LEFT JOIN districts d ON b.geo_level = 'district' AND d.id = b.geo_ref_id
      ORDER BY b.platform_offer_id
    `;
    console.log(JSON.stringify({ columns: cols.map((c) => c.column_name), offers, binds }, null, 2));
  } finally {
    await sql.end({ timeout: 2 });
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
