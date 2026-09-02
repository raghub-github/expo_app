/**
 * Legacy deep-link route — opens the root payment-failure sheet and returns to checkout.
 */

import { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { presentCheckoutPaymentFailure } from "@/store/checkoutPaymentFailureStore";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartStore } from "@/store/cartStore";
import { GatiMitraColors } from "@/constants/gatimitra";

export default function PaymentFailureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    amount?: string | string[];
    method?: string | string[];
  }>();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    const amountRaw = Array.isArray(params.amount) ? params.amount[0] : params.amount;
    const methodRaw = Array.isArray(params.method) ? params.method[0] : params.method;
    const amount = amountRaw != null ? Number(amountRaw) : NaN;
    presentCheckoutPaymentFailure({
      amountInr: Number.isFinite(amount) ? amount : null,
      methodLabel: methodRaw?.trim() || "UPI",
    });
    if (useCartStore.getState().items.length > 0) {
      useCheckoutSheetStore.getState().show();
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/checkout");
    }
  }, [params.amount, params.method, router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={GatiMitraColors.emerald} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
});
