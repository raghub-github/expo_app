/**
 * Display helper for wallet adjustment order links: always `#GMF…` / `#…` style.
 */
export function formatWalletOrderDisplayId(
  formattedOrderId?: string | null,
  orderId?: number | string | null
): string | null {
  const fromFormatted = typeof formattedOrderId === "string" ? formattedOrderId.trim() : "";
  const raw = (fromFormatted || (orderId != null && String(orderId).trim() ? String(orderId).trim() : ""))
    .replace(/^#/, "")
    .trim();
  if (!raw) return null;
  return `#${raw}`;
}
