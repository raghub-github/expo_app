/** Local tray + in-app banner types we suppress (status idle pill, not actionable orders). */
export function isMerchantIdleStatusNotification(
  data: Record<string, unknown> | undefined | null
): boolean {
  if (!data) return false;
  const t = String(
    data.type ?? data.notificationType ?? data.event ?? data.gmType ?? ""
  ).toLowerCase();
  if (
    t === "live_orders" ||
    t === "store_online" ||
    t === "merchant_go_online" ||
    t === "merchant_waiting_for_order"
  ) {
    return true;
  }
  const title = String(data.title ?? data.gmTitle ?? "").toLowerCase();
  return title.includes("is online") && title.includes("restaurant");
}
