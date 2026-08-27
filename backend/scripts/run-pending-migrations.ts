/**
 * Apply only RECENT pending drizzle migrations (numeric id >= 480 by default).
 *
 * This project historically ran SQL files ad-hoc without a full tracker, so
 * replaying 0002… would be destructive / fail on live DBs. We only auto-apply
 * the modern tail and record them in public.schema_migrations.
 *
 * Usage:
 *   npx tsx scripts/run-pending-migrations.ts
 *   npx tsx scripts/run-pending-migrations.ts --from=0480
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/config/loadEnv.js";
import postgres from "postgres";
import { getEnv } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const drizzleDir = path.resolve(backendRoot, "drizzle");

const fromArg = process.argv.find((a) => a.startsWith("--from="));
const FROM_NUM = Number(fromArg?.split("=")[1] ?? 480);

loadEnv();
const env = getEnv();
const sql = postgres(env.DATABASE_URL, { max: 1, idle_timeout: 30, connect_timeout: 30 });

/** CREATE INDEX CONCURRENTLY needs session mode, not PgBouncer transaction pooling. */
function toSessionModeUrl(url: string): string {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}

function isConcurrentIndexSql(content: string): boolean {
  return /CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(content);
}

function listForwardMigrations(): string[] {
  return fs
    .readdirSync(drizzleDir)
    .filter((f) => /^\d+_.*\.sql$/i.test(f) && !/_rollback\.sql$/i.test(f))
    .sort((a, b) => {
      const na = Number(a.match(/^(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/^(\d+)/)?.[1] ?? 0);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
}

function versionKey(file: string): string {
  return file.replace(/\.sql$/i, "");
}

async function ensureTracker() {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER
    );
  `);
}

async function appliedSet(): Promise<Set<string>> {
  const rows = await sql<{ version: string; name: string }[]>`
    SELECT version, name FROM public.schema_migrations
  `;
  const set = new Set<string>();
  for (const r of rows) {
    set.add(String(r.version));
    set.add(String(r.name));
    const base = path.basename(String(r.name));
    set.add(base);
    set.add(base.replace(/\.sql$/i, ""));
  }
  return set;
}

async function probeApplied(file: string): Promise<boolean> {
  // Lightweight existence probes for known recent migrations.
  const probes: Record<string, string> = {
    "0480_analytics_record_scope.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='analytics_events' AND column_name='record_scope'
      ) OR to_regclass('public.analytics_record_scope') IS NOT NULL AS ok`,
    "0481_payout_withdrawal_reversal_not_earnings.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchant_payout_summaries'
          AND column_name='withdrawal_reversal_credits'
      ) AS ok`,
    "0482_notification_revoke.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE column_name ILIKE '%revok%' AND table_name ILIKE '%notification%'
      ) OR EXISTS (
        SELECT 1 FROM pg_proc WHERE proname ILIKE '%revoke%notification%'
      ) AS ok`,
    "0483_order_refunds_customer_capture.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='order_refunds' AND column_name='refund_reference'
      ) AS ok`,
    "0483_merchant_store_transactional_reset_v2.sql": `
      SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'merchant_store_transactional_reset_v2'
      ) AS ok`,
    "0484_gaticash_unique_txn_id.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='order_refunds'
          AND column_name='original_gati_cash_txn_id'
      ) AS ok`,
    "0485_unique_refund_rrn.sql": `
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'order_refunds_refund_reference_uniq'
      ) AS ok`,
    "0486_subscription_plan_snapshot.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='merchant_subscriptions'
          AND column_name='plan_name_snapshot'
      ) AS ok`,
    "0487_repair_accept_timeout_pending_refunds.sql": `
      SELECT EXISTS (
        SELECT 1 FROM public.schema_migrations
        WHERE version = '0487_repair_accept_timeout_pending_refunds'
      ) AS ok`,
    "0523_order_refunds_orderid_created_idx.sql": `
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_or_orderid_created_active_refund'
      ) AS ok`,
    "0535_customer_menu_visible_pending_items.sql": `
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.proname = 'store_has_customer_visible_menu'
          AND pg_get_functiondef(p.oid) LIKE '%PENDING%'
      ) AS ok`,
    "0536a_referral_merchant_enum.sql": `
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'referral_user_type' AND e.enumlabel = 'merchant'
      ) AS ok`,
    "0536_referral_engine_merchant_and_modes.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='referral_settings'
          AND column_name='campaign_budget'
      ) AS ok`,
    "0537_referral_scope_and_rider_code_restore.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='referral_settings'
          AND column_name='merchant_qualification_scope'
      ) AS ok`,
    "0539_wallet_freeze_unify.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='rider_wallet'
          AND column_name='freeze_reason'
      ) AS ok`,
    "0540_referral_merchant_rule_and_notify.sql": `
      SELECT EXISTS (
        SELECT 1 FROM referral_reward_rules WHERE rule_code = 'MERCHANT_STORE_APPROVED'
      ) OR EXISTS (
        SELECT 1 FROM notification_templates WHERE code = 'REFERRAL_REWARD_MERCHANT'
      ) AS ok`,
    "0572_competitor_snapshots_area_peers.sql": `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'merchant_store_competitor_refresh_meta'
      ) AS ok`,
  };
  const q = probes[file];
  if (!q) return false;
  try {
    const rows = await sql.unsafe(q);
    return Boolean((rows?.[0] as { ok?: boolean } | undefined)?.ok);
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Connecting… (only migrations >= ${FROM_NUM})`);
  await ensureTracker();
  const applied = await appliedSet();
  const files = listForwardMigrations().filter((f) => {
    const n = Number(f.match(/^(\d+)/)?.[1] ?? 0);
    return n >= FROM_NUM;
  });

  const toRun: string[] = [];
  for (const f of files) {
    const ver = versionKey(f);
    if (applied.has(ver) || applied.has(f)) {
      console.log(`skip (tracked): ${f}`);
      continue;
    }
    if (/backfill/i.test(f)) {
      console.log(`skip (I/O backfill — run manually if needed): ${f}`);
      continue;
    }
    if (await probeApplied(f)) {
      await sql`
        INSERT INTO public.schema_migrations (version, name, execution_time_ms)
        VALUES (${ver}, ${f}, NULL)
        ON CONFLICT (version) DO NOTHING
      `;
      console.log(`skip (already on DB, tracked now): ${f}`);
      continue;
    }
    toRun.push(f);
  }

  console.log("Pending to run:", toRun.length ? toRun.join(", ") : "(none)");

  for (const f of toRun) {
    const full = path.join(drizzleDir, f);
    const content = fs.readFileSync(full, "utf8");
    const ver = versionKey(f);
    const started = Date.now();
    console.log(`\n→ Applying ${f} …`);
    try {
      if (isConcurrentIndexSql(content)) {
        const sessionUrl = toSessionModeUrl(env.DATABASE_URL);
        const sessionSql = postgres(sessionUrl, {
          max: 1,
          idle_timeout: 30,
          connect_timeout: 60,
          prepare: false,
        });
        try {
          await sessionSql.unsafe("SET statement_timeout = 0");
          await sessionSql.unsafe(content);
        } finally {
          await sessionSql.end({ timeout: 5 });
        }
      } else {
        await sql.unsafe(content);
      }
      const ms = Date.now() - started;
      await sql`
        INSERT INTO public.schema_migrations (version, name, execution_time_ms)
        VALUES (${ver}, ${f}, ${ms})
        ON CONFLICT (version) DO UPDATE
          SET name = EXCLUDED.name,
              applied_at = NOW(),
              execution_time_ms = EXCLUDED.execution_time_ms
      `;
      console.log(`✓ ${f} (${ms}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${f} failed:`, msg);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log("\nDone.");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
