/** Client-safe order ID formatter (no DB / drizzle imports). */

export function formatRiderOrderDisplayId(order: {
  id: number;
  formattedOrderId?: string | null;
  orderId?: string | null;
  externalRef?: string | null;
  displayOrderId?: string | null;
}): string {
  const preset = order.displayOrderId?.trim();
  if (preset) return preset;

  const formatted = order.formattedOrderId?.trim();
  if (formatted) return formatted;

  const businessId = order.orderId?.trim();
  if (businessId && !/^\d+$/.test(businessId)) return businessId;

  const external = order.externalRef?.trim();
  if (external && !/^\d+$/.test(external)) return external;

  if (businessId) return businessId;
  if (external) return external;

  return String(order.id);
}
