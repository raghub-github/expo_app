import React, { useCallback } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import CheckoutScreen from "@/app/checkout/index";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { CheckoutPresentationProvider } from "@/lib/checkoutPresentation";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useMealsUnderPriceCartUiStore } from "@/store/mealsUnderPriceCartUiStore";
import { useCartStore } from "@/store/cartStore";

/** Root-level checkout drawer — avoids nested modal issues on inner screens. */
export function CheckoutBottomSheetHost() {
  const { height: windowHeight } = useWindowDimensions();
  const visible = useCheckoutSheetStore((s) => s.visible);

  const handleClose = useCallback(() => {
    const fromMealsUnderPrice = useMealsUnderPriceCartUiStore.getState().suppressFloatingCart;
    useCheckoutSheetStore.getState().hide();
    if (fromMealsUnderPrice) {
      useCartStore.getState().clearCart();
    }
    useMealsUnderPriceCartUiStore.getState().setSuppressFloatingCart(false);
  }, []);

  const sheetBodyHeight = Math.max(360, Math.round(windowHeight * 0.9) - 56);

  return (
    <CheckoutPresentationProvider variant="sheet" onSheetClose={handleClose}>
      <StoreBottomSheetShell
        visible={visible}
        onClose={handleClose}
        maxHeightRatio={0.94}
        flushBottom
        keyboardAvoiding
        sheetStyle={styles.sheet}
      >
        {visible ? (
          <View style={[styles.content, { height: sheetBodyHeight }]}>
            <CheckoutScreen />
          </View>
        ) : null}
      </StoreBottomSheetShell>
    </CheckoutPresentationProvider>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flexGrow: 1,
  },
  content: {
    width: "100%",
    overflow: "hidden",
  },
});
