/**
 * Backend-only lifecycle reminders (subscription, wallet, KYC, inactive users).
 * Never depends on mobile timers or app open.
 */
import { withLock } from "@gatimitra/redis";
import { getSql } from "../../db/client.js";
import { readSetting } from "./db.js";
import { send } from "./notificationService.js";

const LOCK_KEY = "tick:notification-reminders";
const LOCK_TTL_MS = 55_000;
let timer: NodeJS.Timeout | null = null;

async function remindMerchantSubscriptions(): Promise<number> {
  const sql = getSql();
  let sent = 0;
  try {
    const rows = (await sql`
      SELECT ms.id, ms.merchant_user_id::text AS user_id, ms.current_period_end::date::text AS expires_on
      FROM public.merchant_subscriptions ms
      WHERE ms.status IN ('active', 'past_due')
        AND ms.current_period_end IS NOT NULL
        AND ms.current_period_end::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 3
      LIMIT 100
    `) as unknown as Array<{ id: number; user_id: string; expires_on: string }>;
    for (const r of rows) {
      if (!r.user_id) continue;
      const result = await send({
        templateCode: "MERCHANT_SUBSCRIPTION_REMINDER",
        variables: { expiresOn: `expires on ${r.expires_on}` },
        target: { user_id: r.user_id },
        idempotencyKey: `MERCHANT_SUBSCRIPTION_REMINDER:${r.id}:${r.expires_on}`,
      });
      sent += result.queued;
    }
  } catch (e) {
    // Table may not exist in all envs.
    console.warn("[notifications] subscription reminder skipped:", (e as Error).message);
  }
  return sent;
}

async function remindInactiveCustomers(days: number): Promise<number> {
  const sql = getSql();
  let sent = 0;
  try {
    const rows = (await sql`
      SELECT DISTINCT ON (ept.user_id) ept.user_id::text AS user_id
      FROM public.expo_push_tokens ept
      WHERE ept.role = 'customer'
        AND ept.last_seen_at IS NOT NULL
        AND ept.last_seen_at < now() - (${days}::text || ' days')::interval
        AND ept.last_seen_at > now() - interval '90 days'
      ORDER BY ept.user_id, ept.last_seen_at DESC
      LIMIT 50
    `) as unknown as Array<{ user_id: string }>;
    for (const r of rows) {
      const dayKey = new Date().toISOString().slice(0, 10);
      const result = await send({
        templateCode: "CUSTOMER_INACTIVE_REMINDER",
        variables: {},
        target: { user_id: r.user_id },
        idempotencyKey: `CUSTOMER_INACTIVE_REMINDER:${r.user_id}:${dayKey}`,
      });
      sent += result.queued;
    }
  } catch (e) {
    console.warn("[notifications] inactive reminder skipped:", (e as Error).message);
  }
  return sent;
}

async function remindLowWallet(): Promise<number> {
  const sql = getSql();
  let sent = 0;
  try {
    const rows = (await sql`
      SELECT c.auth_user_id::text AS user_id, COALESCE(w.balance, 0)::float AS balance
      FROM public.customer_wallets w
      JOIN public.customers c ON c.id = w.customer_id
      WHERE w.balance >= 0 AND w.balance < 50
        AND c.auth_user_id IS NOT NULL
      LIMIT 40
    `) as unknown as Array<{ user_id: string; balance: number }>;
    const weekKey = new Date().toISOString().slice(0, 10);
    for (const r of rows) {
      const result = await send({
        templateCode: "CUSTOMER_WALLET_REMINDER",
        variables: { balance: Number(r.balance).toFixed(0) },
        target: { user_id: r.user_id },
        idempotencyKey: `CUSTOMER_WALLET_REMINDER:${r.user_id}:${weekKey}`,
      });
      sent += result.queued;
    }
  } catch (e) {
    console.warn("[notifications] wallet reminder skipped:", (e as Error).message);
  }
  return sent;
}

async function pollOnce(): Promise<void> {
  const enabled = await readSetting<boolean>("reminders_enabled");
  if (enabled === false) return;

  await withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
    const inactiveDays = (await readSetting<number>("inactive_user_reminder_days")) ?? 14;
    const a = await remindMerchantSubscriptions();
    const b = await remindInactiveCustomers(inactiveDays);
    const c = await remindLowWallet();
    if (a + b + c > 0) {
      console.info(`[notifications] reminders queued sub=${a} inactive=${b} wallet=${c}`);
    }
  });
}

export async function startReminderPoller(): Promise<void> {
  if (timer) return;
  // Run hourly — reminders are low urgency.
  const ms = 60 * 60 * 1000;
  console.info("[notifications] reminder poller started (hourly)");
  void pollOnce().catch((e) => console.error("[notifications] reminder poll error", (e as Error).message));
  timer = setInterval(() => {
    void pollOnce().catch((e) => console.error("[notifications] reminder poll error", (e as Error).message));
  }, ms);
  timer.unref?.();
}

export function stopReminderPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
