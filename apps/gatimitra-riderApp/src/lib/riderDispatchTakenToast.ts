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

export function acceptedByAnotherRiderMessage(): string {
  return i18n.t(
    "orders.incoming.acceptedByAnotherRider",
    "Accepted by another rider"
  );
}

/** Show once per order id; notifies listeners so the incoming modal can close. */
export function showAcceptedByAnotherRiderToast(orderId: string): boolean {
  const key = String(orderId ?? "").trim();
  if (!key || recentlyNotified.has(key)) return false;
  recentlyNotified.add(key);
  setTimeout(() => recentlyNotified.delete(key), 60_000);

  useRiderToastStore.getState().showToast(acceptedByAnotherRiderMessage());
  for (const listener of listeners) {
    try {
      listener(key);
    } catch {
      /* ignore listener errors */
    }
  }
  return true;
}
