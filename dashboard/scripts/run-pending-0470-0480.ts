/**
 * Apply pending local migrations 0470–0480 (idempotent SQL files).
 * Run from dashboard: npx tsx scripts/run-pending-0470-0480.ts
 */
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const MIGRATIONS = [
  "0470_unified_referral_rewards_engine.sql",
  "0471_referral_engine_hardening.sql",
  "0472_referral_codes_resync.sql",
  "0473_store_requires_visible_menu.sql",
  "0474_legacy_referral_relationships_backfill.sql",
  "0475_referral_deep_link_packages.sql",
  "0476_prevent_services.sql",
  "0477_prevent_services_realtime.sql",
  "0478_prevent_services_audit_actions.sql",
  "0479_prevent_services_trigger_fired.sql",
  "0480_analytics_record_scope.sql",
];

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) {
    console.error("NO_DATABASE_URL");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const drizzleDir = path.join(process.cwd(), "drizzle");

  console.log("Applying migrations 0470–0480 (idempotent)...\n");

  for (const file of MIGRATIONS) {
    const full = path.join(drizzleDir, file);
    if (!fs.existsSync(full)) {
      console.log(`SKIP  ${file} (file missing)`);
      continue;
    }
    const body = fs.readFileSync(full, "utf8");
    process.stdout.write(`RUN   ${file} ... `);
    try {
      await sql.unsafe(body);
      console.log("OK");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Idempotent re-runs may hit duplicate objects; report and continue when safe.
      const benign =
        /already exists|duplicate key|conflict/i.test(msg) ||
        /does not exist/i.test(msg);
      if (benign) {
        console.log(`WARN (${msg.split("\n")[0]})`);
      } else {
        console.log("FAIL");
        console.error(msg);
        await sql.end();
        process.exit(1);
      }
    }
  }

  // Quick post-checks
  const checks = await sql`
    SELECT
      to_regclass('public.prevent_service_rules') IS NOT NULL AS prevent_rules,
      to_regclass('public.prevent_services_realtime_signal') IS NOT NULL AS prevent_realtime,
      (
        SELECT COUNT(*)::int
        FROM public.dashboard_access_points
        WHERE dashboard_type = 'ANALYTICS'
          AND access_point_group IN ('ANALYTICS_OWN', 'ANALYTICS_OVERALL')
          AND COALESCE(is_active, true) = true
      ) AS analytics_scope_points
  `;
  console.log("\nPost-check:", checks[0]);
  await sql.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
