import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartStore } from "@/store/cartStore";

/** True when the full-page checkout route is already on screen. */
export function isOnCheckoutRoute(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string" || !pathname) return false;
  return pathname === "/checkout" || pathname.startsWith("/checkout/");
}

type RouterLike = {
  replace: (href: string) => void;
  canGoBack?: () => boolean;
  back?: () => void;
};

/**
 * Return the user to a single checkout surface after payment-failed UI.
 *
 * Never open CheckoutBottomSheetHost on top of the full `/checkout` page — that
 * mounts CheckoutScreen twice (duplicate sheet + floating X).
 */
export function restoreCheckoutSurface(args: {
  router: RouterLike;
  pathname?: string | null;
}): void {
  const cartCount = useCartStore.getState().items.length;
  if (cartCount <= 0) return;

  // Full-page checkout already visible — keep the sheet closed.
  if (isOnCheckoutRoute(args.pathname)) {
    useCheckoutSheetStore.getState().hide();
    return;
  }

  // Sheet already open (merchant → checkout drawer). Nothing to do.
  if (useCheckoutSheetStore.getState().visible) return;

  useCheckoutSheetStore.getState().show();
}

/**
 * Leave payment-confirming / legacy payment-failure without stacking sheet + /checkout.
 *
 * Drawer checkout keeps `checkoutSheetStore.visible === true` under the confirming
 * route — re-show is a no-op. Full-page checkout had the sheet closed; calling show()
 * after navigating to `/checkout` would duplicate CheckoutScreen.
 */
export function leavePaymentOverlayToCheckout(args: { router: RouterLike }): void {
  const cartCount = useCartStore.getState().items.length;
  if (cartCount <= 0) {
    useCheckoutSheetStore.getState().hide();
    args.router.replace("/(tabs)");
    return;
  }

  const sheetAlreadyOpen = useCheckoutSheetStore.getState().visible;

  if (typeof args.router.canGoBack === "function" && args.router.canGoBack() && args.router.back) {
    args.router.back();
    // Full-page checkout under the stack: never open the drawer on top.
    if (!sheetAlreadyOpen) {
      useCheckoutSheetStore.getState().hide();
    }
    return;
  }

  // No history — go to full-page checkout only (never sheet + page together).
  useCheckoutSheetStore.getState().hide();
  args.router.replace("/checkout");
}
