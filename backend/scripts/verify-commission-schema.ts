/**
 * Reads back the schema state for the commission engine tables and prints it.
 * Run: npx tsx scripts/verify-commission-schema.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

async function main() {
  const checks: Array<{ name: string; query: () => Promise<boolean> }> = [
    {
      name: "merchant_plans.commission_percent_override",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.columns WHERE table_name='merchant_plans' AND column_name='commission_percent_override'`
        ).length > 0,
    },
    {
      name: "merchant_plans.commission_benefit_active",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.columns WHERE table_name='merchant_plans' AND column_name='commission_benefit_active'`
        ).length > 0,
    },
    {
      name: "merchant_store_commission_rules.source_kind",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.columns WHERE table_name='merchant_store_commission_rules' AND column_name='source_kind'`
        ).length > 0,
    },
    {
      name: "merchant_store_commission_rules.priority",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.columns WHERE table_name='merchant_store_commission_rules' AND column_name='priority'`
        ).length > 0,
    },
    {
      name: "order_item_commission_snapshots table",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.tables WHERE table_name='order_item_commission_snapshots'`
        ).length > 0,
    },
    {
      name: "order_item_addon_commission_snapshots table",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.tables WHERE table_name='order_item_addon_commission_snapshots'`
        ).length > 0,
    },
    {
      name: "orders_core_item_addons.menu_addon_id",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.columns WHERE table_name='orders_core_item_addons' AND column_name='menu_addon_id'`
        ).length > 0,
    },
    {
      name: "commission_audit_log table",
      query: async () =>
        (
          await sql`SELECT 1 FROM information_schema.tables WHERE table_name='commission_audit_log'`
        ).length > 0,
    },
  ];

  for (const c of checks) {
    try {
      const ok = await c.query();
      console.log(ok ? "[OK]   " : "[MISS] ", c.name);
    } catch (e) {
      console.log("[ERR]  ", c.name, "—", (e as Error).message);
    }
  }

  try {
    const rows = await sql`
      SELECT base_service_fee_percent::text AS pct
      FROM store_onboarding_commission_config WHERE id=1
    `;
    console.log(
      rows[0]?.pct ? `[OK]   default = ${rows[0].pct}%` : "[MISS]  default singleton row",
    );
  } catch (e) {
    console.log("[ERR]   default singleton —", (e as Error).message);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
