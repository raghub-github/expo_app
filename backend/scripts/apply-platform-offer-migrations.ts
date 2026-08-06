/**
 * Check + apply platform offer migrations (idempotent SQL files).
 * Run from backend: npx tsx scripts/apply-platform-offer-migrations.ts
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

/** Prefer backend numbering; dashboard mirrors are identical when both exist. */
const MIGRATIONS: { id: string; paths: string[] }[] = [
  {
    id: "0492_platform_offer_usage_engine",
    paths: [
      path.join(backendRoot, "drizzle/0492_platform_offer_usage_engine.sql"),
      path.join(dashboardRoot, "drizzle/0482_platform_offer_usage_engine.sql"),
    ],
  },
  {
    id: "0493_platform_offer_analytics_audit",
    paths: [
      path.join(backendRoot, "drizzle/0493_platform_offer_analytics_audit.sql"),
      path.join(dashboardRoot, "drizzle/0483_platform_offer_analytics_audit.sql"),
    ],
  },
];

async function status() {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'billing_platform_offers'
      AND column_name IN (
        'max_uses_total','max_uses_per_user','max_uses_per_day','max_uses_per_month',
        'consume_mode','restore_on_cancel','restore_on_refund'
      )
    ORDER BY column_name`;
  const [usages] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'platform_offer_usages'
    ) AS exists`;
  const [sale] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_offer_usages'
        AND column_name = 'order_sale_amount'
    ) AS exists`;
  const chks = await sql`
    SELECT conname FROM pg_constraint
    WHERE conname IN (
      'billing_platform_offers_consume_mode_chk',
      'billing_platform_offers_budget_used_nonneg_chk',
      'billing_platform_offers_budget_used_cap_chk',
      'platform_offer_usages_status_chk'
    )
    ORDER BY conname`;
  const idxs = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname IN (
      'platform_offer_usages_offer_order_uidx',
      'platform_offer_usages_offer_applied_idx',
      'offer_order_applications_platform_created_idx',
      'action_audit_log_platform_offer_idx'
    )
    ORDER BY indexname`;
  return { cols, usages, sale, chks, idxs };
}

async function applyFile(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  await sql.unsafe(content);
}

async function run() {
  console.log("=== Platform offer migration status (before) ===");
  const before = await status();
  console.log(JSON.stringify(before, null, 2));

  for (const m of MIGRATIONS) {
    const file = m.paths.find((p) => fs.existsSync(p));
    if (!file) {
      console.error(`Missing migration file for ${m.id}`);
      process.exit(1);
    }
    console.log(`\nApplying ${m.id} via ${path.relative(backendRoot, file)} ...`);
    try {
      await applyFile(file);
      console.log(`OK: ${m.id}`);
    } catch (err) {
      console.error(`FAILED: ${m.id}`, err);
      process.exit(1);
    }
  }

  // Also ensure dashboard-numbered mirrors are applied if somehow different
  // (idempotent — safe to re-run)

  console.log("\n=== Platform offer migration status (after) ===");
  const after = await status();
  console.log(JSON.stringify(after, null, 2));

  const needCols = [
    "consume_mode",
    "max_uses_per_day",
    "max_uses_per_month",
    "max_uses_per_user",
    "max_uses_total",
    "restore_on_cancel",
    "restore_on_refund",
  ];
  const haveCols = new Set((after.cols as { column_name: string }[]).map((c) => c.column_name));
  const missingCols = needCols.filter((c) => !haveCols.has(c));
  if (missingCols.length || !after.usages?.exists || !after.sale?.exists) {
    console.error("\nVerification failed:", { missingCols, usages: after.usages, sale: after.sale });
    process.exit(1);
  }
  console.log("\nAll platform offer migrations applied and verified.");
  await sql.end();
}

run().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
