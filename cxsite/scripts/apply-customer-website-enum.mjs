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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("NO_DATABASE_URL");
  process.exit(1);
}

const sqlEnum = fs.readFileSync(
  path.join(root, "drizzle/0100_customer_website_ticket_source.sql"),
  "utf8",
);
const sqlCheck = fs.readFileSync(
  path.join(root, "drizzle/0101_customer_website_raised_by_check.sql"),
  "utf8",
);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(sqlEnum);
await client.query(sqlCheck);
const r = await client.query(
  `SELECT e.enumlabel
   FROM pg_enum e
   JOIN pg_type t ON e.enumtypid = t.oid
   WHERE t.typname = 'unified_ticket_source'
     AND e.enumlabel = 'CUSTOMER_WEBSITE'`,
);
console.log(r.rows.length ? "CUSTOMER_WEBSITE_OK" : "CUSTOMER_WEBSITE_MISSING");
console.log("RAISED_BY_CHECK_UPDATED");
await client.end();
