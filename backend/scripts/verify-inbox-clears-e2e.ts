/**
 * End-to-end Clear All persistence against notification_dispatch_logs.
 * Simulates Rider A clear while Rider B stays untouched; new post-clear row stays.
 *
 * Usage: npx tsx scripts/verify-inbox-clears-e2e.ts
 */
import { randomUUID } from "node:crypto";
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

async function insertLog(opts: {
  userId: string;
  role: string;
  title: string;
  queuedAt: string;
}) {
  const nid = randomUUID();
  await sql`
    INSERT INTO public.notification_dispatch_logs (
      notification_id, recipient_user_id, recipient_role, channel,
      title, body, status, queued_at
    ) VALUES (
      ${nid}::uuid, ${opts.userId}, ${opts.role}, 'in_app',
      ${opts.title}, ${"body"}, 'delivered', ${opts.queuedAt}::timestamptz
    )
  `;
  return nid;
}

async function inboxFor(userId: string, role: string, clearedAt: Date | null) {
  return sql`
    SELECT notification_id::text AS notification_id, title
    FROM public.notification_dispatch_logs d
    WHERE recipient_user_id = ${userId}
      AND (
        recipient_role IS NULL
        OR lower(recipient_role) = lower(${role})
      )
      ${
        clearedAt
          ? sql`AND d.queued_at > ${clearedAt.toISOString()}::timestamptz`
          : sql``
      }
      AND channel = 'in_app'
    ORDER BY queued_at DESC
  `;
}

async function main() {
  const stamp = Date.now();
  const riderA = `usr_e2e_clear_a_${stamp}`;
  const riderB = `usr_e2e_clear_b_${stamp}`;
  const past = new Date(stamp - 60_000).toISOString();
  const future = new Date(stamp + 60_000).toISOString();

  const a1 = await insertLog({ userId: riderA, role: "rider", title: "A-old-1", queuedAt: past });
  const a2 = await insertLog({ userId: riderA, role: "rider", title: "A-old-2", queuedAt: past });
  const b1 = await insertLog({ userId: riderB, role: "rider", title: "B-old-1", queuedAt: past });

  const beforeA = await inboxFor(riderA, "rider", null);
  const beforeB = await inboxFor(riderB, "rider", null);
  if (beforeA.length < 2) throw new Error("Rider A should see old notifications");
  if (beforeB.length < 1) throw new Error("Rider B should see old notifications");
  console.log("PASS seeded inboxes", { a: beforeA.length, b: beforeB.length });

  // Simulate POST /clear-all for Rider A only
  await sql`
    UPDATE public.notification_dispatch_logs
    SET status = 'clicked', clicked_at = COALESCE(clicked_at, now()), delivered_at = COALESCE(delivered_at, now())
    WHERE recipient_user_id = ${riderA} AND clicked_at IS NULL
  `;
  const clearRows = (await sql`
    INSERT INTO public.notification_inbox_clears (user_id, cleared_at, updated_at)
    VALUES (${riderA}, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET cleared_at = EXCLUDED.cleared_at, updated_at = EXCLUDED.updated_at
    RETURNING cleared_at
  `) as unknown as Array<{ cleared_at: Date }>;
  const clearedAt = new Date(clearRows[0]!.cleared_at);
  console.log("PASS Rider A clear-all persisted", clearedAt.toISOString());

  const afterA = await inboxFor(riderA, "rider", clearedAt);
  const afterB = await inboxFor(riderB, "rider", null);
  const bClear = await sql`SELECT 1 FROM public.notification_inbox_clears WHERE user_id = ${riderB}`;
  if (afterA.length !== 0) throw new Error("Rider A old notifications must be hidden after clear");
  if (afterB.length < 1) throw new Error("Rider B inbox must remain");
  if (bClear.length !== 0) throw new Error("Rider B must not have a clear row");
  console.log("PASS isolation after clear", { aVisible: afterA.length, bVisible: afterB.length });

  const aNew = await insertLog({
    userId: riderA,
    role: "rider",
    title: "A-new-after-clear",
    queuedAt: future,
  });
  const afterNew = await inboxFor(riderA, "rider", clearedAt);
  const titles = afterNew.map((r) => String((r as { title: string }).title));
  if (!titles.includes("A-new-after-clear")) {
    throw new Error("New notification after clear must appear");
  }
  if (titles.includes("A-old-1") || titles.includes("A-old-2")) {
    throw new Error("Old cleared notifications must stay hidden");
  }
  console.log("PASS new notification visible; old stay cleared", titles);

  // Cleanup
  await sql`DELETE FROM public.notification_dispatch_logs WHERE recipient_user_id IN (${riderA}, ${riderB})`;
  await sql`DELETE FROM public.notification_inbox_clears WHERE user_id IN (${riderA}, ${riderB})`;
  console.log("PASS cleanup", { a1, a2, b1, aNew });
  console.log("ALL E2E CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("FAIL", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
