/** Signals when merchant menu add/edit modal is open — pauses noisy store-wide polling. */

export const MERCHANT_MENU_ITEM_FORM_OPEN_EVENT = "merchant-menu-item-form-open";

export function setMenuItemFormModalOpen(open: boolean) {
  if (typeof window === "undefined") return;
  if (open) {
    document.body.dataset.menuItemFormOpen = "1";
  } else {
    delete document.body.dataset.menuItemFormOpen;
  }
  window.dispatchEvent(
    new CustomEvent(MERCHANT_MENU_ITEM_FORM_OPEN_EVENT, { detail: { open } })
  );
}

export function subscribeMenuItemFormModalOpen(
  listener: (open: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
    listener(open);
  };
  window.addEventListener(MERCHANT_MENU_ITEM_FORM_OPEN_EVENT, handler);
  return () => window.removeEventListener(MERCHANT_MENU_ITEM_FORM_OPEN_EVENT, handler);
}
