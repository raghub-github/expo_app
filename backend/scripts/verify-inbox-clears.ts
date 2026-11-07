/**
 * Smoke-verify notification_inbox_clears + Clear All isolation.
 * Usage: npx tsx scripts/verify-inbox-clears.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

async function main() {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'notification_inbox_clears'
  `;
  if (tables.length === 0) {
    throw new Error("notification_inbox_clears missing — run 0647 migration");
  }
  console.log("PASS table exists");

  const riderA = `usr_verify_clear_a_${Date.now()}`;
  const riderB = `usr_verify_clear_b_${Date.now()}`;

  await sql`
    INSERT INTO public.notification_inbox_clears (user_id, cleared_at, updated_at)
    VALUES (${riderA}, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET cleared_at = EXCLUDED.cleared_at, updated_at = EXCLUDED.updated_at
  `;
  console.log("PASS upsert rider A clear");

  const aRows = await sql`
    SELECT user_id FROM public.notification_inbox_clears WHERE user_id = ${riderA}
  `;
  const bRows = await sql`
    SELECT user_id FROM public.notification_inbox_clears WHERE user_id = ${riderB}
  `;
  if (aRows.length !== 1) throw new Error("rider A clear row missing");
  if (bRows.length !== 0) throw new Error("rider B should be untouched");
  console.log("PASS rider isolation (A cleared, B untouched)");

  // Idempotent second clear
  await sql`
    INSERT INTO public.notification_inbox_clears (user_id, cleared_at, updated_at)
    VALUES (${riderA}, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET cleared_at = EXCLUDED.cleared_at, updated_at = EXCLUDED.updated_at
  `;
  const aCount = await sql`
    SELECT COUNT(*)::int AS n FROM public.notification_inbox_clears WHERE user_id = ${riderA}
  `;
  if (Number((aCount[0] as { n: number }).n) !== 1) throw new Error("duplicate clear rows");
  console.log("PASS idempotent clear (single row)");

  await sql`DELETE FROM public.notification_inbox_clears WHERE user_id IN (${riderA}, ${riderB})`;
  console.log("PASS cleanup");
  console.log("ALL CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("FAIL", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
