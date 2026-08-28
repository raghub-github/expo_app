/**
 * Apply 0579 merchant_stores.banner_video_url (ADD COLUMN IF NOT EXISTS only).
 * Run from dashboard: npx tsx scripts/run-0579-banner-video-url.ts
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

async function main() {
  const sql = postgres(toSessionModeUrl(databaseUrl), {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 30,
  });
  try {
    const before = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'merchant_stores'
          AND column_name = 'banner_video_url'
      ) AS exists
    `;
    console.log("before:", before[0]?.exists);

    const migrationPath = path.join(process.cwd(), "drizzle", "0579_merchant_stores_banner_video_url.sql");
    await sql.unsafe(fs.readFileSync(migrationPath, "utf-8"));

    const after = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'merchant_stores'
          AND column_name = 'banner_video_url'
      ) AS exists
    `;
    console.log(after[0]?.exists ? "✅ 0579 applied (banner_video_url present)" : "❌ column missing");
    if (!after[0]?.exists) process.exit(1);

    const poolerSql = postgres(databaseUrl, { max: 1, idle_timeout: 5, connect_timeout: 30 });
    try {
      await poolerSql`SELECT banner_video_url FROM merchant_stores LIMIT 1`;
      console.log("✅ pooler (6543) can read banner_video_url");
    } finally {
      await poolerSql.end({ timeout: 5 });
    }
  } catch (e) {
    console.error("❌ 0579 failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
