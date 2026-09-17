/**
 * Emit payment.settled for customer push after gateway success/failure.
 * Checkout failures live on pending_orders (no orders_core yet) — resolve
 * customers.customer_id (auth UUID) so expo_push_tokens lookup works.
 */
import { getSql } from "../db/client.js";
import { emitEvent } from "../modules/notifications/eventBus.js";

export type PaymentSettledNotifyStatus = "SUCCESS" | "FAILED";

type SettledRow = {
  order_id: string;
  customer_user_id: string;
  grand_total: number | string | null;
};

async function lookupSettledRow(razorpayOrderId: string): Promise<SettledRow | null> {
  const sql = getSql();
  // Prefer orders_core when present (payment success after finalize).
  const coreRows = (await sql`
    SELECT
      oc.order_id AS order_id,
      c.customer_id AS customer_user_id,
      oc.grand_total
    FROM public.orders_core oc
    INNER JOIN public.customers c ON c.id = oc.customer_id
    WHERE oc.razorpay_order_id = ${razorpayOrderId}
    LIMIT 1
  `) as unknown as SettledRow[];
  if (coreRows[0]?.customer_user_id && coreRows[0]?.order_id) {
    return coreRows[0];
  }

  // Checkout incomplete: row still only on pending_orders.
  const pendingRows = (await sql`
    SELECT
      po.pending_id AS order_id,
      c.customer_id AS customer_user_id,
      po.grand_total
    FROM public.pending_orders po
    INNER JOIN public.customers c ON c.id = po.customer_id
    WHERE po.razorpay_order_id = ${razorpayOrderId}
    LIMIT 1
  `) as unknown as SettledRow[];
  if (pendingRows[0]?.customer_user_id && pendingRows[0]?.order_id) {
    return pendingRows[0];
  }
  return null;
}

function shortOrderRef(orderId: string): string {
  const trimmed = orderId.trim();
  if (trimmed.length <= 16) return trimmed;
  return trimmed.slice(-12);
}

/** Fire-and-forget customer push for payment success / incomplete payment. */
export function notifyCustomerPaymentSettled(args: {
  razorpayOrderId: string;
  status: PaymentSettledNotifyStatus;
  reason?: string | null;
}): void {
  const { razorpayOrderId, status, reason } = args;
  if (!razorpayOrderId) return;
  void (async () => {
    try {
      const row = await lookupSettledRow(razorpayOrderId);
      if (!row) return;
      const orderId = String(row.order_id);
      emitEvent("payment.settled", {
        orderId,
        orderShortId: shortOrderRef(orderId),
        customerId: String(row.customer_user_id),
        amount: Number(row.grand_total ?? 0),
        status,
        ...(status === "FAILED" && reason
          ? { reason: String(reason) }
          : status === "FAILED"
            ? {
                reason:
                  "Any amount if debited from UPI will get refunded within 4-7 days.",
              }
            : {}),
      });
    } catch {
      /* tolerated — push must not break payment webhook / checkout */
    }
  })();
}
