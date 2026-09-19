import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useCartChromeStore } from "@/store/cartChromeStore";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";
import { cartLineBaseUnitPrice } from "@/lib/cart-line-pricing";
import { computeFlashSaleSplitPricing, parseMenuFlashSale } from "@/lib/itemOfferDisplay";
import { billingService } from "@/services/billing.service";
import { cartItemBaseId } from "@/lib/cart-line-identity";
import { buildCheckoutOffersQueryKey } from "@/lib/checkoutOffersQuery";
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
 *
 * No HOME / edge peek on store inner (classic, grid_first, discovery) — back
 * chrome handles leave; edge peeks belong on Food tab chrome only.
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
  const cartItemsForDock = useCartStore((s) =>
    merchantCartMatchesRoute(s.merchantId, merchantId) ? s.items : EMPTY_CART_ITEMS
  );
  /** Match checkout — repeat base id by qty so shared cache responses stay correct. */
  const cartMenuItemIdsForOffers = useMemo(() => {
    const ids: string[] = [];
    for (const line of cartItemsForDock) {
      const raw = String(line.menuItemId ?? "").trim();
      if (!raw) continue;
      const base = cartItemBaseId(raw) || raw;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      for (let i = 0; i < qty; i++) ids.push(base);
    }
    return ids;
  }, [cartItemsForDock]);
  const cartSubtotalForOffers = useMemo(() => {
    return cartItemsForDock.reduce((sum, i) => {
      const bid = cartItemBaseId(i.menuItemId);
      const menuItem = merchantMenu?.find(
        (m) =>
          m.id === bid ||
          (m.menuItemId != null && String(m.menuItemId) === bid) ||
          String(m.menuItemId ?? "") === String(i.menuItemId)
      );
      const flash = menuItem
        ? parseMenuFlashSale(menuItem as unknown as Record<string, unknown>)
        : null;
      let line: number;
      if (flash) {
        line = computeFlashSaleSplitPricing({
          quantity: i.quantity,
          flashUnit: flash.flashPrice,
          regularUnit: flash.originalCustomerUnit,
          maxFlashQuantity: flash.maxFlashQuantity ?? 1,
        }).lineTotal;
      } else {
        line = cartLineBaseUnitPrice(i) * i.quantity;
      }
      const addonLine = (i.addons ?? []).reduce(
        (a, ad) => a + ad.addonPrice * ad.quantity * i.quantity,
        0
      );
      return sum + line + addonLine;
    }, 0);
  }, [cartItemsForDock, merchantMenu]);

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

  const cartQtyFingerprint = useMemo(
    () =>
      cartItemsForDock
        .map((i) => `${cartItemBaseId(i.menuItemId)}:${i.quantity}`)
        .sort()
        .join("|"),
    [cartItemsForDock]
  );

  const checkoutOffersQuery = useQuery({
    queryKey: buildCheckoutOffersQueryKey({
      merchantId,
      addressId: resolvedDeliveryAddress?.id,
      cartQtyFingerprint,
      pincode,
      state,
    }),
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
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
    <View style={styles.dockStack} pointerEvents="box-none" collapsable={false}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  dockStack: {
    width: "100%",
  },
});
