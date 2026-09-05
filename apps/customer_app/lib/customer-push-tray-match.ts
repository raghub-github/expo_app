/**
 * Tray matching for customer order pushes.
 * Pure helpers so startup/resume never treats historical FCM rows as new events.
 */

export function normalizePushId(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function orderIdsFromNotificationPayload(args: {
  identifier?: string | null;
  data?: Record<string, unknown> | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown) => {
    const id = String(raw ?? "").trim();
    if (!id) return;
    const key = id.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };

  const identifier = String(args.identifier ?? "");
  if (identifier.startsWith("customer-live-order-")) {
    add(identifier.slice("customer-live-order-".length));
  }

  const data = args.data ?? {};
  add(data.orderId);
  add(data.order_id);
  add(data.orderIdText);
  add(data.formattedOrderId);
  add(data.formatted_order_id);
  add(data.orderShortId);
  add(data.order_short_id);

  const deep =
    (typeof data.deepLink === "string" && data.deepLink) ||
    (typeof data.deep_link === "string" && data.deep_link) ||
    (typeof data.screen === "string" && data.screen) ||
    "";
  const match = String(deep).match(/\/orders\/([^/?#]+)/i);
  if (match?.[1]) add(decodeURIComponent(match[1]));

  return out;
}

export function presentedNotificationMatchesActiveOrder(
  item: { identifier?: string | null; data?: Record<string, unknown> | null },
  activeIdsUpper: Iterable<string>
): boolean {
  const active = new Set(
    [...activeIdsUpper].map((id) => normalizePushId(id)).filter(Boolean)
  );
  if (active.size === 0) return false;
  for (const id of orderIdsFromNotificationPayload(item)) {
    if (active.has(normalizePushId(id))) return true;
  }
  return false;
}

/** Opening/resuming the app must never turn inbox/history into new pushes. */
export function shouldReplayHistoricalPushOnStartup(): boolean {
  return false;
}

export function isCustomerOrderLifecyclePushData(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data) return false;
  if (data.gmLiveProgress === true || data.gmLiveProgress === "true") return true;
  if (data.type === "live_order_progress") return true;
  const code = String(
    data.template_code ?? data.templateCode ?? data.gmType ?? data.event_type ?? ""
  )
    .trim()
    .toUpperCase();
  if (!code) return false;
  return (
    code.startsWith("ORDER_") ||
    code.startsWith("RIDE_") ||
    code.startsWith("PARCEL_") ||
    code === "CUSTOMER_DELIVERY_OTP_NEARBY" ||
    code === "CUSTOMER_PICKUP_OTP_ARRIVED"
  );
}
