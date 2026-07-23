/** True when the order's terminal timestamp is within the last 24 hours. */
export function isOrderWithinLast24Hours(order: {
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
}): boolean {
  const iso = order.deliveredAt || order.cancelledAt || order.createdAt;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= 24 * 60 * 60 * 1000;
}
