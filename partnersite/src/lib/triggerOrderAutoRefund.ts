import {
  clearBackendCircuitBreaker,
  fetchBackend,
} from '@/lib/fetch-backend';
import { resolveBackendApiBaseUrlList } from '@/lib/backend-api-url';
import { partnerOrderAutoRefundInProcess } from '@/lib/partner-order-auto-refund-inprocess';

/**
 * Auto-refund the customer for a cancelled order.
 *
 * The Partner Site records merchant cancellations by writing orders_food /
 * orders_core directly, so it never reaches the backend service that normally
 * auto-refunds a merchant/system cancel. Without this hop the portal only stamped
 * refund INTENT (order_cancellation refund_status = pending) and the customer's
 * money never actually moved.
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
  if (role === 'customer' || role === 'cx') return;

  const secret =
    process.env.INTERNAL_API_TOKEN?.trim() ||
    process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim() ||
    '';

  const body = JSON.stringify({
    reason: args.reason,
    actorRole: role,
    actorEmail: args.actorEmail ?? null,
    amount:
      args.amount != null && Number.isFinite(Number(args.amount)) && Number(args.amount) > 0
        ? Number(args.amount)
        : null,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(secret ? { 'X-Internal-Secret': secret } : {}),
  };

  let httpOk = false;

  if (secret) {
    clearBackendCircuitBreaker();
    try {
      const res = await fetchBackend(`/v1/internal/orders/${orderCorePk}/auto-refund`, {
        method: 'POST',
        headers,
        body,
        timeoutMs: 30_000,
        force: true,
      });
      if (res?.ok) {
        httpOk = true;
      } else if (res) {
        const text = await res.text().catch(() => '');
        console.warn(
          `[triggerOrderAutoRefund] backend ${res.status} for core=${orderCorePk}: ${text.slice(0, 200)}`
        );
      }
    } catch (err) {
      console.warn('[triggerOrderAutoRefund] fetchBackend failed:', err);
    }

    if (!httpOk) {
      for (const base of resolveBackendApiBaseUrlList()) {
        try {
          const res = await fetch(`${base}/v1/internal/orders/${orderCorePk}/auto-refund`, {
            method: 'POST',
            headers,
            body,
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
          });
          if (res.ok) {
            httpOk = true;
            break;
          }
          const text = await res.text().catch(() => '');
          console.warn(
            `[triggerOrderAutoRefund] ${base} → ${res.status} for core=${orderCorePk}: ${text.slice(0, 160)}`
          );
        } catch (err) {
          console.warn(`[triggerOrderAutoRefund] ${base} unreachable:`, err);
        }
      }
    }
  } else {
    console.warn(
      '[triggerOrderAutoRefund] INTERNAL_API_TOKEN / BACKEND_SCHEDULE_TICK_SECRET missing — trying in-process refund'
    );
  }

  if (httpOk) return;

  const local = await partnerOrderAutoRefundInProcess({
    orderCorePk,
    reason: args.reason,
    actorRole: role,
    actorEmail: args.actorEmail ?? null,
    amount: args.amount ?? null,
  });
  if (!local.ok) {
    console.warn(
      `[triggerOrderAutoRefund] in-process refund failed for core=${orderCorePk}:`,
      local.error
    );
  } else {
    console.info(
      `[triggerOrderAutoRefund] in-process refund for core=${orderCorePk}:`,
      JSON.stringify(local.outcome)
    );
  }
}
