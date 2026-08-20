/**
 * Payment / order confirmation failed.
 * Forwards to checkout and opens the Retry / Leave bottom sheet.
 */

import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCheckoutPaymentFailureStore } from "@/store/checkoutPaymentFailureStore";
import { GatiMitraColors } from "@/constants/gatimitra";

export default function PaymentFailureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    amount?: string | string[];
    method?: string | string[];
  }>();

  useEffect(() => {
    const amountRaw = Array.isArray(params.amount) ? params.amount[0] : params.amount;
    const methodRaw = Array.isArray(params.method) ? params.method[0] : params.method;
    const amount = amountRaw != null ? Number(amountRaw) : NaN;
    useCheckoutPaymentFailureStore.getState().show({
      amountInr: Number.isFinite(amount) ? amount : null,
      methodLabel: methodRaw?.trim() || "UPI",
    });
    router.replace("/checkout");
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
