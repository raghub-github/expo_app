import type { InboxItem } from "@gatimitra/expo-push-kit";

function previewBody(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable fingerprint so campaign resends / twin rows collapse to one inbox entry.
 * Prefer order id when present; otherwise template + title + body prefix.
 */
export function notificationFingerprint(item: InboxItem): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const orderId = String(meta.orderId ?? meta.order_id ?? "").trim();
  if (orderId) return `order:${orderId}`;

  const campaignId = String(
    meta.campaignId ?? meta.campaign_id ?? meta.broadcastId ?? meta.broadcast_id ?? ""
  ).trim();
  if (campaignId) return `campaign:${campaignId}`;

  const code = String(item.template_code ?? "").toUpperCase();
  const title = (item.title ?? "").trim().toLowerCase();
  const body = previewBody(item.body).slice(0, 80).toLowerCase();
  return `ann:${code}|${title}|${body}`;
}

/** Keep newest row per fingerprint (items are assumed newest-first). */
export function dedupeInboxItems(items: InboxItem[]): InboxItem[] {
  const seen = new Set<string>();
  const out: InboxItem[] = [];
  for (const item of items) {
    const key = notificationFingerprint(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** All ids that share a fingerprint with `item` (including itself). */
export function siblingNotificationIds(items: InboxItem[], item: InboxItem): string[] {
  const key = notificationFingerprint(item);
  return items.filter((n) => notificationFingerprint(n) === key).map((n) => n.notification_id);
}

function metaOrderId(item: InboxItem): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  return String(meta.orderId ?? meta.order_id ?? meta.formattedOrderId ?? "").trim();
}

/** True when this inbox row is order / ride / parcel lifecycle traffic. */
export function isOrderLifecycleNotification(item: InboxItem): boolean {
  if (metaOrderId(item)) return true;
  const code = String(item.template_code ?? "").toUpperCase();
  const gmType = String((item.metadata as { gmType?: string } | null)?.gmType ?? "").toUpperCase();
  const key = `${code} ${gmType}`;
  if (
    key.includes("ORDER") ||
    key.includes("RIDE") ||
    key.includes("TRIP") ||
    key.includes("PARCEL") ||
    key.includes("FOOD")
  ) {
    return true;
  }
  const deep = String(item.deep_link ?? "");
  return /\/orders\//i.test(deep) || /\/ride/i.test(deep);
}

/**
 * Customer active-order screen path for an inbox row, or null if not order-linked.
 * Prefer deep_link `/orders/:id`, then metadata.orderId.
 */
export function resolveActiveOrderPath(item: InboxItem): string | null {
  const deep = String(item.deep_link ?? "").trim();
  if (deep.startsWith("/orders/")) {
    const path = deep.split(/[?#]/)[0];
    if (path.length > "/orders/".length) return path;
  }
  const fromDeep = deep.match(/\/orders\/([^/?#]+)/i);
  if (fromDeep?.[1]) return `/orders/${decodeURIComponent(fromDeep[1])}`;

  const orderId = metaOrderId(item);
  if (orderId) return `/orders/${orderId}`;

  return null;
}
