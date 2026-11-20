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

const sql = fs.readFileSync(
  path.join(root, "drizzle/0103_customer_reviews_unique_email.sql"),
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
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'customer_reviews'
       AND indexname = 'customer_reviews_email_lower_uidx'`,
  );
  console.log(idx.rows[0] ? "UNIQUE_EMAIL_INDEX_OK" : "UNIQUE_EMAIL_INDEX_MISSING");
  console.log("MIGRATION_0103_OK");
} finally {
  await client.end();
}
