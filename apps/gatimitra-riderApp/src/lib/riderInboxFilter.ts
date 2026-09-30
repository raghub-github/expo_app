import type { InboxItem } from "@gatimitra/expo-push-kit";

/**
 * Rider Notifications page filter.
 *
 * Hide: new-order / dispatch offer pushes (OS shade + accept modal only).
 * Show: cancel, penalty, admin/campaign, KYC/account, and other lifecycle pushes.
 */

const BLOCKED_EXACT = new Set([
  "RIDER_NEW_ORDER",
  "RIDER_DISPATCH_OFFER",
  "DISPATCH_OFFER",
]);

function templateCode(item: InboxItem): string {
  return String(item.template_code ?? "").trim().toUpperCase();
}

/** True when this row is a new-order / dispatch offer (must not appear on the page). */
export function looksLikeNewOrderPush(item: InboxItem): boolean {
  const code = templateCode(item);
  if (BLOCKED_EXACT.has(code)) return true;
  if (code.includes("NEW_ORDER") || code.includes("DISPATCH_OFFER")) return true;
  if (code.includes("DISPATCH") && code.includes("OFFER")) return true;

  const meta = item.metadata ?? {};
  const metaType = String(
    (meta as { type?: unknown }).type ??
      (meta as { event?: unknown }).event ??
      (meta as { gmType?: unknown }).gmType ??
      ""
  )
    .trim()
    .toLowerCase();
  if (
    metaType === "dispatch_offer" ||
    metaType === "rider_dispatch_offer" ||
    metaType === "rider_new_order" ||
    metaType === "incoming_order" ||
    metaType === "force_assignment_offer" ||
    metaType === "new_order"
  ) {
    return true;
  }

  const title = String(item.title ?? "").toLowerCase();
  const body = String(item.body ?? "").toLowerCase();
  const hay = `${title} ${body}`;
  if (hay.includes("tap to accept")) return true;
  if (hay.includes("new order received")) return true;
  if (hay.includes("new ride request")) return true;
  if (/\bnew order\b/.test(hay) && hay.includes("accept")) return true;
  return false;
}

/** True when this inbox row should appear on the Rider Notifications page. */
export function isRiderInboxPageItem(item: InboxItem): boolean {
  return !looksLikeNewOrderPush(item);
}

export function filterRiderInboxPageItems(items: InboxItem[]): InboxItem[] {
  return items.filter(isRiderInboxPageItem);
}

/** Unread for badge / list — align with backend `clicked_at IS NULL`. */
export function isRiderInboxUnread(item: InboxItem): boolean {
  return !item.clicked_at;
}
