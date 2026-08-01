import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
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
  const rows = await sql`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'prevent_service%'
    ORDER BY 1
  `;
  console.log(rows.map((r) => r.relname));

  const levels = await sql`
    SELECT access_level, COUNT(*)::int AS n
    FROM dashboard_access
    WHERE COALESCE(is_active, true) = true
    GROUP BY 1
    ORDER BY 2 DESC
  `;
  console.log("access_level distribution:", levels);

  const analytics = await sql`
    SELECT access_point_group, COUNT(*)::int AS n
    FROM dashboard_access_points
    WHERE dashboard_type = 'ANALYTICS'
      AND COALESCE(is_active, true) = true
    GROUP BY 1
  `;
  console.log("analytics points:", analytics);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
