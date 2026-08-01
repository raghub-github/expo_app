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

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) {
    console.error("NO_DATABASE_URL");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const migrationPath = path.join(process.cwd(), "drizzle", "0480_analytics_record_scope.sql");
  const q = fs.readFileSync(migrationPath, "utf8");
  await sql.unsafe(q);
  console.log("0480_analytics_record_scope.sql applied successfully");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
