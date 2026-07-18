import React, { useCallback, useEffect, useMemo } from "react";
import { BackHandler } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "@/store/cartStore";
import { useCartCheckoutGateStore } from "@/store/cartCheckoutGateStore";
import {
  CartOutsideDeliveryRangeScreen,
  type CartOutsideRangeMerchant,
} from "@/components/cart/CartOutsideDeliveryRangeScreen";
import { CheckoutAddressSelectSheet } from "@/components/checkout/CheckoutAddressSelectSheet";
import { applySelectedDeliveryAddress } from "@/lib/applySelectedDeliveryAddress";
import { evaluateCartCheckoutEligibility } from "@/lib/cartCheckoutGate";
import { useMealsUnderPriceCartUiStore } from "@/store/mealsUnderPriceCartUiStore";
import { merchantService } from "@/services/merchant.service";
import type { Address } from "@/services/address.service";

/** Root-level cart checkout gate — blocks checkout when delivery context is invalid. */
export function CartCheckoutGateHost() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const outsideRangeVisible = useCartCheckoutGateStore((s) => s.outsideRangeVisible);
  const addressSheetVisible = useCartCheckoutGateStore((s) => s.addressSheetVisible);
  const merchantId = useCartStore((s) => s.merchantId);
  const merchantName = useCartStore((s) => s.merchantName);
  const merchantBannerUrl = useCartStore((s) => s.merchantBannerUrl);
  const clearCart = useCartStore((s) => s.clearCart);
  const hasCartItems = useCartStore((s) => s.items.length > 0);

  const gateOpen = outsideRangeVisible;

  // Prefetch merchant while cart is active so the gate header is ready instantly.
  const { data: merchantDetail } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId!),
    enabled: !!merchantId && (gateOpen || hasCartItems),
    staleTime: 5 * 60 * 1000,
  });

  const merchant = useMemo((): CartOutsideRangeMerchant => {
    const name = merchantDetail?.name ?? merchantName;
    const bannerUrl =
      merchantDetail?.banner_url ??
      merchantDetail?.displayImage ??
      merchantBannerUrl ??
      null;
    const areaLabel =
      merchantDetail?.city?.trim() ||
      merchantDetail?.address?.trim() ||
      null;
    return {
      name,
      bannerUrl,
      avgRating: merchantDetail?.avgRating ?? null,
      totalReviews: merchantDetail?.totalReviews ?? null,
      areaLabel,
      addressLine: merchantDetail?.address ?? null,
    };
  }, [merchantBannerUrl, merchantDetail, merchantName]);

  const hideGate = useCallback(() => {
    useCartCheckoutGateStore.getState().hide();
    // Allow floating cart again on home after dismissing Outside Delivery Range.
    useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(false);
  }, []);

  const handleChangeAddress = useCallback(() => {
    useCartCheckoutGateStore.getState().openAddressSheet();
  }, []);

  const handleClearCart = useCallback(() => {
    clearCart();
    hideGate();
  }, [clearCart, hideGate]);

  // Android system back: address sheet first, then dismiss gate (keep cart).
  useEffect(() => {
    if (!outsideRangeVisible && !addressSheetVisible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (addressSheetVisible) {
        useCartCheckoutGateStore.getState().closeAddressSheet();
        return true;
      }
      if (outsideRangeVisible) {
        hideGate();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [addressSheetVisible, hideGate, outsideRangeVisible]);

  const handleAddressSelected = useCallback(
    async (addr: Address) => {
      await applySelectedDeliveryAddress(addr, queryClient);
      const eligibility = await evaluateCartCheckoutEligibility(queryClient);
      useCartCheckoutGateStore.getState().closeAddressSheet();
      if (eligibility.allowed) {
        hideGate();
        router.push("/checkout" as never);
        return;
      }
      useCartCheckoutGateStore.getState().show();
    },
    [hideGate, queryClient, router]
  );

  return (
    <>
      <CartOutsideDeliveryRangeScreen
        visible={outsideRangeVisible && !addressSheetVisible}
        merchant={merchant}
        onChangeAddress={handleChangeAddress}
        onClearCart={handleClearCart}
        onClose={hideGate}
      />
      <CheckoutAddressSelectSheet
        visible={addressSheetVisible}
        merchantId={merchantId}
        onClose={() => useCartCheckoutGateStore.getState().closeAddressSheet()}
        onSelectAddress={handleAddressSelected}
      />
    </>
  );
}
