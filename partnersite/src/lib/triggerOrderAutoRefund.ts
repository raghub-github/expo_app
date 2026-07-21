import { fetchBackend } from '@/lib/fetch-backend';

/**
 * Auto-refund the customer for a cancelled order.
 *
 * The Partner Site records merchant cancellations by writing orders_food /
 * orders_core directly, so it never reaches the backend service that normally
 * auto-refunds a merchant/system cancel. Without this hop the portal only stamped
 * refund INTENT (order_cancellation refund_status = pending) and the customer's
 * money never actually moved.
 *
 * The backend endpoint creates the `order_refunds` row AND executes it
 * (Razorpay / customer wallet / COD-noop). It is idempotent — it no-ops when a
 * non-failed refund already exists for the order, so retries can't double-pay.
 *
 * Policy enforced by the backend:
 *   • system / merchant (store) / rider cancel → full refund of what was paid
 *   • customer cancel → never auto-refunded (refused here and in the backend)
 *   • agent/admin → dashboard engine-driven flow, not this path
 *
 * Best-effort: a refund failure must never abort the cancellation itself. The
 * order_refunds row is left behind for ops retry.
 */
export async function triggerOrderAutoRefund(args: {
  /** orders_core primary key. */
  orderCorePk: number;
  reason: string;
  /** system | store | rider | customer */
  actorRole: string;
  actorEmail?: string | null;
  /** Optional override. Omit for a full refund of what the customer paid. */
  amount?: number | null;
}): Promise<void> {
  const orderCorePk = Number(args.orderCorePk);
  if (!Number.isInteger(orderCorePk) || orderCorePk < 1) return;

  const role = String(args.actorRole || '').trim().toLowerCase();
  // Customer cancellations never auto-refund — don't even make the call.
  if (role === 'customer' || role === 'cx') return;

  const secret =
    process.env.INTERNAL_API_TOKEN || process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) {
    console.warn('[triggerOrderAutoRefund] no internal secret configured; skipping');
    return;
  }

  try {
    await fetchBackend(`/v1/internal/orders/${orderCorePk}/auto-refund`, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: args.reason,
        actorRole: role,
        actorEmail: args.actorEmail ?? null,
        amount:
          args.amount != null && Number.isFinite(Number(args.amount)) && Number(args.amount) > 0
            ? Number(args.amount)
            : null,
      }),
      timeoutMs: 15_000,
    });
  } catch (err) {
    console.warn('[triggerOrderAutoRefund] request failed:', err);
  }
}
