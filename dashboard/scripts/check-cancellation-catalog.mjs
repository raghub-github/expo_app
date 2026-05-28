import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("NO_DATABASE_URL");
  process.exit(1);
}
const sql = postgres(url, { prepare: false });
try {
  const catalog = await sql`
    SELECT count(*)::int AS c FROM order_cancellation_reason_catalog
  `;
  console.log("catalog rows:", catalog[0]?.c);
  try {
    const attrs = await sql`
      SELECT count(*)::int AS c FROM order_cancellation_attributes
    `;
    console.log("attribute rows:", attrs[0]?.c);
  } catch (e) {
    console.log("attributes table error:", e.message);
  }
} catch (e) {
  console.log("catalog error:", e.message);
} finally {
  await sql.end();
}
