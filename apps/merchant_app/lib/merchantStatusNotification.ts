/** Local kitchen sticky only — do not suppress server store_online / go-online pushes. */
export function isMerchantIdleStatusNotification(
  data: Record<string, unknown> | undefined | null
): boolean {
  if (!data) return false;
  const t = String(
    data.type ?? data.notificationType ?? data.event ?? data.gmType ?? ""
  ).toLowerCase();
  return t === "live_orders";
}
