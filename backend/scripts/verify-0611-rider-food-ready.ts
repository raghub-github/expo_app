/**
 * I/O-light verify: RIDER_FOOD_READY template exists after 0611.
 * Usage: npx tsx scripts/verify-0611-rider-food-ready.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 15,
});

async function main() {
  const rows = await sql<{
    code: string;
    title_template: string;
    enabled: boolean;
  }[]>`
    SELECT code, title_template, enabled
    FROM notification_templates
    WHERE code = 'RIDER_FOOD_READY' AND locale = 'en'
    LIMIT 1
  `;
  if (!rows[0]) {
    console.error("RIDER_FOOD_READY missing — re-run drizzle/0611_rider_food_ready_template.sql");
    process.exitCode = 1;
    return;
  }
  console.log("[0611 ok]", rows[0]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
