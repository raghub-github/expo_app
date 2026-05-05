/**
 * Fail deploy/CI if hybrid OMS columns are missing on orders_core.
 * Usage (from backend): npx tsx scripts/verify-orders-core-schema.ts
 *
 * Requires DATABASE_URL (via .env or environment).
 */
import postgres from "postgres";
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";

const REQUIRED = ["order_id", "billing_snapshot", "billing_ruleset_version"] as const;

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

async function main() {
  try {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders_core'
        AND column_name IN ${sql([...REQUIRED])}
    `;
    const have = new Set(rows.map((r) => r.column_name));
    const missing = REQUIRED.filter((c) => !have.has(c));
    if (missing.length > 0) {
      console.error(
        "[verify-orders-core-schema] Missing columns on public.orders_core:",
        missing.join(", "),
        "\nApply backend/drizzle migrations (0094+ for order_id, 0188+ for billing snapshot)."
      );
      process.exit(1);
    }
    console.log("[verify-orders-core-schema] OK — orders_core has:", [...REQUIRED].join(", "));
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[verify-orders-core-schema] Failed:", e);
  process.exit(1);
});
