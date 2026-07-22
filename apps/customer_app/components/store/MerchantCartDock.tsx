import React, { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useCartChromeStore } from "@/store/cartChromeStore";
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
 * Shows immediately from cartChrome flash (pressIn) — does not wait for the
 * Zustand cart write / menu-host work that used to block the first paint.
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
  const flashMerchantId = useCartChromeStore((s) => s.flashMerchantId);
  const flashCount = useCartChromeStore((s) => s.flashCount);
  const flashPending = useCartChromeStore((s) => s.flashPending);
  const clearFlash = useCartChromeStore((s) => s.clearFlash);
  const flashActive =
    flashPending && merchantCartMatchesRoute(flashMerchantId, merchantId);

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

  // Flash is authoritative while pending — including flashCount === 0 (instant hide).
  const displayCount = flashActive ? flashCount : totalInCart;
  const showDock = displayCount > 0;
  const hasCart = cartLineCount > 0;

  useEffect(() => {
    if (!flashActive) return;
    if (totalInCart === flashCount) {
      clearFlash();
    }
  }, [flashActive, flashCount, totalInCart, clearFlash]);

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

  // Price sync after first paint — never on the pressIn frame.
  useEffect(() => {
    if (!merchantMenu || !hasCart) return;
    const t = setTimeout(() => {
      const priceById: Record<string, number> = {};
      for (const m of merchantMenu) {
        if (typeof m.price === "number" && Number.isFinite(m.price)) {
          priceById[m.id] = m.price;
        }
      }
      if (Object.keys(priceById).length > 0) {
        useCartStore.getState().syncPricesFromMap(priceById);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [merchantMenu, hasCart]);

  useEffect(() => {
    if (!showDock) return;
    perfMeasure("tap:last", "dock:rendered");
  }, [showDock, displayCount]);

  if (!showDock) return null;

  return (
    <MerchantMenuCartSheet
      items={cartItemsForDock}
      totalCount={displayCount}
      onContinue={onContinue}
      disabled={isStoreClosedForStatus}
      isStoreClosed={isStoreClosedForStatus}
      offerBannerText={offerBannerText}
      bottomInset={bottomInset}
      reserveOfferStrip={reserveOfferStrip}
    />
  );
}
