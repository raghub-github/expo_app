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
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_users'
      AND column_name IN ('full_name','first_name','last_name','email','system_user_id','primary_role')
    ORDER BY 1
  `;
  console.log("cols", cols.map((c) => c.column_name));

  const rows = await sql`
    SELECT id, system_user_id, full_name, email, primary_role::text AS primary_role
    FROM system_users
    WHERE deleted_at IS NULL
      AND (
        full_name ILIKE '%admin%'
        OR full_name ILIKE '%agent%'
        OR full_name ILIKE '%super%'
        OR full_name ILIKE '%manager%'
      )
    ORDER BY id
    LIMIT 30
  `;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
