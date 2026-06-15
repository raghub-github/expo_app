import type { MerchantNotification } from "@/context/NotificationContext";
import type { OrderRecord } from "@/hooks/useOrders";
import { formatMerchantRs } from "@/lib/merchant-line-total";

/** Matches "GMF100022 · ₹1,378 — tap to accept" */
const NEW_ORDER_BODY_RE =
  /^(.+?)\s*·\s*₹[\d,.\s]+\s*—\s*tap to accept\s*$/i;

export function isNewOrderAcceptNotification(n: MerchantNotification): boolean {
  if (n.type !== "order") return false;
  if (n.title.trim().toLowerCase() === "new order!") return true;
  return /tap to accept/i.test(n.body);
}

export function findOrderForNotification(
  n: MerchantNotification,
  orders: OrderRecord[]
): OrderRecord | undefined {
  if (n.type !== "order") return undefined;

  const foodId = n.orderId?.trim();
  if (foodId) {
    const byFood = orders.find((o) => o.id === foodId);
    if (byFood) return byFood;
  }

  const m = n.body.match(NEW_ORDER_BODY_RE);
  const displayId = m?.[1]?.trim();
  if (displayId) {
    const byFmt = orders.find(
      (o) =>
        o.formattedOrderId === displayId ||
        o.orderNumber === displayId ||
        String(o.ordersCoreId) === displayId
    );
    if (byFmt) return byFmt;
  }

  return undefined;
}

/** Show merchant-visible order total (same as incoming modal), not stored customer grand_total. */
export function merchantNotificationDisplayBody(
  n: MerchantNotification,
  orders: OrderRecord[]
): string {
  if (n.type !== "order") return n.body;

  const order = findOrderForNotification(n, orders);
  if (!order) return n.body;

  const displayId =
    order.formattedOrderId?.trim() ||
    order.orderNumber?.trim() ||
    `Order #${order.ordersCoreId}`;
  const amount = formatMerchantRs(order.total);

  if (NEW_ORDER_BODY_RE.test(n.body)) {
    return `${displayId} · ${amount} — tap to accept`;
  }

  if (/₹[\d,.\s]+/.test(n.body)) {
    return n.body.replace(/₹[\d,.\s]+/, amount);
  }

  return `${displayId} · ${amount} — tap to accept`;
}
