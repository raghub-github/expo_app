import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const r = await client.query(`
  SELECT ut.ticket_id, LEFT(ut.subject, 60) AS subject, ut.group_id, g.group_name
  FROM unified_tickets ut
  LEFT JOIN ticket_groups g ON g.id = ut.group_id
  WHERE ut.ticket_source::text = 'CUSTOMER_WEBSITE'
     OR COALESCE(ut.metadata->>'source', '') = 'gatimitra_customer_website'
  ORDER BY ut.id DESC
  LIMIT 5
`);
console.table(r.rows);
await client.end();
