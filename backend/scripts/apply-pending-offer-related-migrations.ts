/**
 * Apply recent pending migrations that may be missing (idempotent).
 * Focus: platform offers + nearby numbered files that can break features if skipped.
 * Run from backend: npx tsx scripts/apply-pending-offer-related-migrations.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const dashboardRoot = path.resolve(backendRoot, "../dashboard");

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });

type Item = { label: string; file: string };

const ITEMS: Item[] = [
  // Offer foundation (safe if already applied)
  { label: "geo_platform_offer_bindings", file: path.join(backendRoot, "drizzle/0187_geo_platform_offer_bindings.sql") },
  { label: "platform_offers_cofunding", file: path.join(backendRoot, "drizzle/0218_platform_offers_cofunding.sql") },
  // Recent backend
  { label: "0490_customer_addresses_last_used_at", file: path.join(backendRoot, "drizzle/0490_customer_addresses_last_used_at.sql") },
  { label: "0491_order_cancelled_refund_notification_templates", file: path.join(backendRoot, "drizzle/0491_order_cancelled_refund_notification_templates.sql") },
  { label: "0492_platform_offer_usage_engine", file: path.join(backendRoot, "drizzle/0492_platform_offer_usage_engine.sql") },
  { label: "0493_platform_offer_analytics_audit", file: path.join(backendRoot, "drizzle/0493_platform_offer_analytics_audit.sql") },
  { label: "0494_platform_offer_coupon_code", file: path.join(backendRoot, "drizzle/0494_platform_offer_coupon_code.sql") },
  { label: "0495_platform_offer_promo_config", file: path.join(backendRoot, "drizzle/0495_platform_offer_promo_config.sql") },
  // Dashboard mirrors / recent local
  { label: "0480_analytics_record_scope", file: path.join(dashboardRoot, "drizzle/0480_analytics_record_scope.sql") },
  { label: "0481_order_routed_to_rider_assign_actions", file: path.join(dashboardRoot, "drizzle/0481_order_routed_to_rider_assign_actions.sql") },
  { label: "0481_payout_withdrawal_reversal_not_earnings", file: path.join(dashboardRoot, "drizzle/0481_payout_withdrawal_reversal_not_earnings.sql") },
  { label: "0482_platform_offer_usage_engine", file: path.join(dashboardRoot, "drizzle/0482_platform_offer_usage_engine.sql") },
  { label: "0483_platform_offer_analytics_audit", file: path.join(dashboardRoot, "drizzle/0483_platform_offer_analytics_audit.sql") },
  { label: "0484_platform_offer_coupon_code", file: path.join(dashboardRoot, "drizzle/0484_platform_offer_coupon_code.sql") },
  { label: "0485_platform_offer_promo_config", file: path.join(dashboardRoot, "drizzle/0485_platform_offer_promo_config.sql") },
];

function isBenign(msg: string): boolean {
  return /already exists|duplicate key|conflict|skipping/i.test(msg);
}

async function main() {
  console.log("Applying pending offer-related + recent migrations (idempotent)...\n");
  const results: { label: string; status: string; detail?: string }[] = [];

  for (const item of ITEMS) {
    if (!fs.existsSync(item.file)) {
      results.push({ label: item.label, status: "SKIP", detail: "file missing" });
      console.log(`SKIP  ${item.label}`);
      continue;
    }
    process.stdout.write(`RUN   ${item.label} ... `);
    try {
      const body = fs.readFileSync(item.file, "utf8");
      await sql.unsafe(body);
      console.log("OK");
      results.push({ label: item.label, status: "OK" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isBenign(msg)) {
        console.log(`WARN (${msg.split("\n")[0]})`);
        results.push({ label: item.label, status: "WARN", detail: msg.split("\n")[0] });
      } else {
        console.log("FAIL");
        console.error(msg);
        results.push({ label: item.label, status: "FAIL", detail: msg });
        await sql.end();
        process.exit(1);
      }
    }
  }

  const verify = await sql`
    SELECT
      to_regclass('public.platform_offer_usages') IS NOT NULL AS usages_table,
      to_regclass('public.geo_platform_offer_bindings') IS NOT NULL AS geo_bindings,
      to_regclass('public.offer_order_applications') IS NOT NULL AS offer_apps,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='platform_offer_usages'
          AND column_name='order_sale_amount'
      ) AS order_sale_amount,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='billing_platform_offers'
          AND column_name='consume_mode'
      ) AS consume_mode,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='billing_platform_offers'
          AND column_name='max_uses_per_user'
      ) AS max_uses_per_user
  `;

  console.log("\nVerify:", verify[0]);
  console.log("\nSummary:");
  for (const r of results) {
    console.log(`  ${r.status.padEnd(4)} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
  }

  const v = verify[0] as Record<string, boolean>;
  if (!v.usages_table || !v.order_sale_amount || !v.consume_mode || !v.max_uses_per_user || !v.offer_apps) {
    console.error("\nCritical offer schema still incomplete.");
    process.exit(1);
  }
  console.log("\nDone — offer schema ready.");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
