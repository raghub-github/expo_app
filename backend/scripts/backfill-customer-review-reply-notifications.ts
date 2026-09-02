/**
 * Send push/inbox for existing merchant review replies that never notified customers.
 * Usage: npx tsx scripts/backfill-customer-review-reply-notifications.ts [--days=30] [--dry-run]
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";
import { notifyCustomerStoreReviewReply } from "../src/lib/customer-review-reply-notify.js";

loadEnv();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const daysArg = args.find((a) => a.startsWith("--days="));
const days = daysArg ? Math.max(1, Number(daysArg.split("=")[1]) || 30) : 30;

const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

async function main() {
  const rows = await sql<{ id: number }[]>`
    SELECT msr.id
    FROM merchant_store_ratings msr
    JOIN customers c ON c.id = msr.customer_id
    WHERE msr.merchant_responded_at IS NOT NULL
      AND (
        NULLIF(TRIM(msr.merchant_response), '') IS NOT NULL
        OR COALESCE(jsonb_array_length(msr.merchant_responses::jsonb), 0) > 0
      )
      AND msr.merchant_responded_at >= NOW() - (${days}::int || ' days')::interval
    ORDER BY msr.merchant_responded_at DESC
  `;

  console.log(
    `Found ${rows.length} review repl${rows.length === 1 ? "y" : "ies"} in last ${days} day(s)${dryRun ? " (dry run)" : ""}.`
  );

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const reviewId = Number(row.id);
    if (!Number.isInteger(reviewId) || reviewId < 1) continue;
    if (dryRun) {
      console.log(`[dry-run] would notify reviewId=${reviewId}`);
      sent += 1;
      continue;
    }
    try {
      await notifyCustomerStoreReviewReply(sql, { reviewId });
      sent += 1;
      console.log(`notified reviewId=${reviewId}`);
    } catch (e) {
      failed += 1;
      console.warn(`failed reviewId=${reviewId}:`, (e as Error)?.message ?? e);
    }
  }

  console.log(`Done. sent=${sent} failed=${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
