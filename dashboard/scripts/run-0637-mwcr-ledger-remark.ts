/**
 * Apply 0637 merchant_wallet_credit_requests.ledger_remark + approved_amount.
 * I/O-safe: session-mode URL, IF NOT EXISTS checks, idempotent re-run.
 *
 * Run from dashboard:
 *   npx tsx scripts/run-0637-mwcr-ledger-remark.ts
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

const databaseUrlRaw = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
if (!databaseUrlRaw) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const databaseUrl: string = databaseUrlRaw;

function toSessionModeUrl(url: string): string {
  const u = new URL(url);
  if (u.port === "6543") u.port = "5432";
  u.searchParams.delete("pgbouncer");
  return u.toString();
}

async function columnExists(
  sql: postgres.Sql,
  columnName: string
): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'merchant_wallet_credit_requests'
        AND column_name = ${columnName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function main() {
  const sql = postgres(toSessionModeUrl(databaseUrl), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });
  try {
    const beforeRemark = await columnExists(sql, "ledger_remark");
    const beforeAmount = await columnExists(sql, "approved_amount");
    console.log("before:", { ledger_remark: beforeRemark, approved_amount: beforeAmount });

    const migrationPath = path.join(process.cwd(), "drizzle", "0637_mwcr_ledger_remark.sql");
    if (!fs.existsSync(migrationPath)) {
      console.error("Migration file missing:", migrationPath);
      process.exit(1);
    }
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));

    const afterRemark = await columnExists(sql, "ledger_remark");
    const afterAmount = await columnExists(sql, "approved_amount");
    console.log("after:", { ledger_remark: afterRemark, approved_amount: afterAmount });

    if (!afterRemark || !afterAmount) {
      console.error("❌ 0637 incomplete — columns missing");
      process.exit(1);
    }
    console.log("✅ 0637 applied (ledger_remark + approved_amount present)");

    // Verify pooler can see columns too (when using 6543).
    const poolerSql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 30 });
    try {
      await poolerSql`SELECT ledger_remark, approved_amount FROM merchant_wallet_credit_requests LIMIT 1`;
      console.log("✅ pooler can read ledger_remark / approved_amount");
    } finally {
      await poolerSql.end({ timeout: 5 });
    }
  } catch (e) {
    console.error("❌ 0637 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
