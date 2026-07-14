import React, { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";
import { cartLineBaseUnitPrice } from "@/lib/cart-line-pricing";
import { billingService } from "@/services/billing.service";
import {
  formatStoreCartOfferBannerText,
  resolveBestEligibleCheckoutOffer,
} from "@/hooks/useCouponAvailablePrompt";
import { MerchantMenuCartSheet } from "@/components/store/MerchantMenuCartSheet";
import type { Address } from "@/services/address.service";
import type { MenuItem } from "@/services/merchant.service";
import { perfMeasure } from "@/lib/perfTrace";
import { useRenderCount } from "@/hooks/useRenderCount";

const EMPTY_CART_ITEMS: CartItem[] = [];

export type MerchantCartDockProps = {
  merchantId: string;
  merchantMenu: MenuItem[] | undefined;
  resolvedDeliveryAddress: Address | null;
  pincode?: string;
  state?: string;
  city?: string;
  isStoreClosedForStatus: boolean;
  onContinue: () => void;
  bottomInset: number;
  reserveOfferStrip: boolean;
};

/**
 * Isolated cart-total subscriber for the merchant menu's Continue dock.
 * The merchant screen it lives on renders its entire menu unvirtualized (no FlashList
 * recycling — see MerchantDetailFlashList's "full-mount" comment), so any hook the parent
 * subscribes to that changes on every +/- tap forces that whole screen to re-render.
 * This component owns those per-tap-changing selectors instead, so quantity/price/offer
 * updates only re-render this small dock, not the full menu screen.
 */
export function MerchantCartDock({
  merchantId,
  merchantMenu,
  resolvedDeliveryAddress,
  pincode,
  state,
  city,
  isStoreClosedForStatus,
  onContinue,
  bottomInset,
  reserveOfferStrip,
}: MerchantCartDockProps) {
  useRenderCount("MerchantCartDock");

  const cartLineCount = useCartStore((s) =>
    merchantCartMatchesRoute(s.merchantId, merchantId) ? s.items.length : 0
  );
  const totalInCart = useCartStore((s) => {
    if (!merchantCartMatchesRoute(s.merchantId, merchantId)) return 0;
    return s.items.reduce((n, i) => n + i.quantity, 0);
  });
  const cartSubtotalForOffers = useCartStore((s) => {
    if (!merchantCartMatchesRoute(s.merchantId, merchantId)) return 0;
    return s.items.reduce((sum, i) => {
      const base = cartLineBaseUnitPrice(i);
      const line = base * i.quantity;
      const addonLine = (i.addons ?? []).reduce(
        (a, ad) => a + ad.addonPrice * ad.quantity * i.quantity,
        0
      );
      return sum + line + addonLine;
    }, 0);
  });
  /** Primitive join — avoid returning a new array from getSnapshot (infinite loop). */
  const cartMenuItemIdsKey = useCartStore((s) => {
    if (!merchantCartMatchesRoute(s.merchantId, merchantId)) return "";
    const ids = new Set<string>();
    for (const line of s.items) {
      const raw = String(line.menuItemId ?? "").trim();
      if (!raw) continue;
      ids.add(raw);
      const base = raw.includes("::")
        ? raw.split("::")[0]!
        : raw.includes("_")
          ? raw.split("_")[0]!
          : raw;
      if (base) ids.add(base);
    }
    return [...ids].sort().join(",");
  });
  const cartMenuItemIdsForOffers = useMemo(
    () => (cartMenuItemIdsKey ? cartMenuItemIdsKey.split(",") : []),
    [cartMenuItemIdsKey]
  );
  const cartItemsForDock = useCartStore((s) =>
    merchantCartMatchesRoute(s.merchantId, merchantId) ? s.items : EMPTY_CART_ITEMS
  );
  const syncCartPrices = useCartStore((s) => s.syncPricesFromMap);

  const hasCart = cartLineCount > 0;

  const checkoutOffersQuery = useQuery({
    queryKey: [
      "billing-checkout-offers",
      merchantId,
      resolvedDeliveryAddress?.id,
      cartSubtotalForOffers,
      cartMenuItemIdsKey,
      pincode,
      state,
    ],
    queryFn: () =>
      billingService.getCheckoutOffers({
        merchantId,
        addressId: String(resolvedDeliveryAddress!.id),
        cartSubtotal: cartSubtotalForOffers,
        serviceType: "FOOD",
        pincode,
        state,
        city,
        menuItemIds: cartMenuItemIdsForOffers,
      }),
    enabled: !!merchantId && !!resolvedDeliveryAddress && hasCart,
    staleTime: 60 * 1000,
  });

  const offerBannerText = useMemo(() => {
    if (!hasCart) return null;
    const best = resolveBestEligibleCheckoutOffer(checkoutOffersQuery.data, cartSubtotalForOffers);
    if (!best) return null;
    return formatStoreCartOfferBannerText(best);
  }, [hasCart, checkoutOffersQuery.data, cartSubtotalForOffers]);

  // Keep the floating-cart total in sync with the live menu — if commission
  // changed since the user added an item, the cart price for those items
  // updates as soon as the menu fetch returns fresh values.
  useEffect(() => {
    if (!merchantMenu || !hasCart) return;
    const priceById: Record<string, number> = {};
    for (const m of merchantMenu) {
      if (typeof m.price === "number" && Number.isFinite(m.price)) {
        priceById[m.id] = m.price;
      }
    }
    if (Object.keys(priceById).length > 0) syncCartPrices(priceById);
  }, [merchantMenu, syncCartPrices, hasCart]);

  /** Dev-only: "Continue button updated" — measured from the most recent tap on any row. */
  useEffect(() => {
    perfMeasure("tap:last", "dock:rendered");
  }, [totalInCart]);

  if (!hasCart) return null;

  return (
    <MerchantMenuCartSheet
      items={cartItemsForDock}
      totalCount={totalInCart}
      onContinue={onContinue}
      disabled={isStoreClosedForStatus}
      isStoreClosed={isStoreClosedForStatus}
      offerBannerText={offerBannerText}
      bottomInset={bottomInset}
      reserveOfferStrip={reserveOfferStrip}
    />
  );
}
