/** Coordinates global incoming-order modal with store orders list (avoid reload/rescan races). */

export const MERCHANT_INCOMING_ORDER_MODAL_OPEN_EVENT = "merchant-incoming-order-modal-open";
export const MERCHANT_STORE_ORDER_UPDATED_EVENT = "merchant-store-order-updated";

export function setIncomingOrderModalOpen(open: boolean) {
  if (typeof window === "undefined") return;
  if (open) {
    document.body.dataset.incomingOrderModalOpen = "1";
  } else {
    delete document.body.dataset.incomingOrderModalOpen;
  }
  window.dispatchEvent(
    new CustomEvent(MERCHANT_INCOMING_ORDER_MODAL_OPEN_EVENT, { detail: { open } })
  );
}

export function isIncomingOrderModalOpen(): boolean {
  if (typeof window === "undefined") return false;
  return document.body.dataset.incomingOrderModalOpen === "1";
}

export function subscribeIncomingOrderModalOpen(
  listener: (open: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    listener(Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open));
  };
  window.addEventListener(MERCHANT_INCOMING_ORDER_MODAL_OPEN_EVENT, handler);
  return () => window.removeEventListener(MERCHANT_INCOMING_ORDER_MODAL_OPEN_EVENT, handler);
}

export function dispatchMerchantStoreOrderUpdated(order: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(MERCHANT_STORE_ORDER_UPDATED_EVENT, { detail: { order } })
  );
}
