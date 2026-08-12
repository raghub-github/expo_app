/** First N item names from order line items (partner order picker). */
export function formatOrderItemPreview(
  items: Array<{ name?: string | null; item_name?: string | null }> | null | undefined,
  maxItems = 2
): string {
  if (!items?.length) return "";
  const names = items
    .slice(0, maxItems)
    .map((it) => String(it.name ?? it.item_name ?? "").trim())
    .filter(Boolean);
  if (!names.length) return "";
  const extra = items.length > maxItems ? ` +${items.length - maxItems} more` : "";
  return names.join(", ") + extra;
}

function formatOrderPickWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatMerchantOrderPickSubtitle(order: {
  customer_name?: string | null;
  order_status?: string | null;
  created_at?: string | null;
  items?: Array<{ name?: string | null; item_name?: string | null }> | null;
}): string {
  const customer = order.customer_name?.trim();
  const items = formatOrderItemPreview(order.items);
  const status = order.order_status?.trim();
  const when = formatOrderPickWhen(order.created_at);
  return [customer, items, status, when].filter(Boolean).join(" · ");
}
