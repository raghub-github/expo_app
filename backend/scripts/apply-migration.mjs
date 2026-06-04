import postgres from "postgres";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config();

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <sql-file>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const body = fs.readFileSync(path.resolve(file), "utf8");
  await sql.unsafe(body);
  console.log(`Applied ${file}`);
} finally {
  await sql.end();
}
