import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
// Prefer local pg; fall back to cxsite (dashboard may not depend on pg).
const pg =
  (() => {
    try {
      return require("pg");
    } catch {
      return require(path.join(root, "..", "cxsite", "node_modules", "pg"));
    }
  })();

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.join(root, ".env.local"));
loadEnv(path.join(root, ".env"));
// Fallback: same DB as cxsite when dashboard env is missing
loadEnv(path.join(root, "..", "cxsite", ".env.local"));
loadEnv(path.join(root, "..", "cxsite", ".env"));

const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
if (!url) {
  console.error("NO_DATABASE_URL");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(root, "drizzle/0512_customer_website_ticket_group.sql"),
  "utf8",
);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  const g = await client.query(
    `SELECT id, group_code, group_name, is_active
     FROM ticket_groups WHERE group_code = 'GRP_CUSTOMER_WEBSITE'`,
  );
  console.log(
    g.rows[0]
      ? `GROUP_OK id=${g.rows[0].id} name=${g.rows[0].group_name} active=${g.rows[0].is_active}`
      : "GROUP_MISSING",
  );
  const c = await client.query(
    `SELECT COUNT(*)::int AS n FROM unified_tickets
     WHERE group_id = (
       SELECT id FROM ticket_groups WHERE group_code = 'GRP_CUSTOMER_WEBSITE' LIMIT 1
     )
       AND (
         ticket_source::text = 'CUSTOMER_WEBSITE'
         OR COALESCE(metadata->>'source','') = 'gatimitra_customer_website'
       )`,
  );
  console.log(`ASSIGNED_TICKETS=${c.rows[0]?.n ?? 0}`);
  console.log("MIGRATION_0512_OK");
} finally {
  await client.end();
}
