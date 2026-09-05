import i18n from "@/src/i18n";
import { useRiderToastStore } from "@/src/stores/riderToastStore";

const recentlyNotified = new Set<string>();
const listeners = new Set<(orderId: string) => void>();

export function subscribeDispatchOfferWithdrawn(listener: (orderId: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Close incoming modal listeners without a toast. */
export function notifyIncomingOfferClosed(orderId: string): void {
  const key = String(orderId ?? "").trim();
  if (!key) return;
  for (const listener of listeners) {
    try {
      listener(key);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function acceptedByAnotherRiderMessage(): string {
  return i18n.t(
    "orders.incoming.acceptedByAnotherRider",
    "Accepted by another rider"
  );
}

function isTakenByAnotherRiderReason(reason: string | null | undefined): boolean {
  const r = String(reason ?? "")
    .trim()
    .toLowerCase();
  return (
    r.includes("accepted_by_other") ||
    r.includes("order_assigned_to_other") ||
    r === "order_already_assigned"
  );
}

/** Show once per order id; notifies listeners so the incoming modal can close. */
export function showAcceptedByAnotherRiderToast(orderId: string): boolean {
  const key = String(orderId ?? "").trim();
  if (!key || recentlyNotified.has(key)) return false;
  recentlyNotified.add(key);
  setTimeout(() => recentlyNotified.delete(key), 60_000);

  useRiderToastStore.getState().showToast(acceptedByAnotherRiderMessage());
  notifyIncomingOfferClosed(key);
  return true;
}

/**
 * Close the incoming offer UI. Only toast "Accepted by another rider" when
 * that is the proven reason — customer cancel / expire must close silently.
 */
export function closeIncomingOfferFromRealtime(
  orderId: string,
  reason?: string | null
): void {
  const key = String(orderId ?? "").trim();
  if (!key) return;
  if (isTakenByAnotherRiderReason(reason)) {
    showAcceptedByAnotherRiderToast(key);
    return;
  }
  notifyIncomingOfferClosed(key);
}
