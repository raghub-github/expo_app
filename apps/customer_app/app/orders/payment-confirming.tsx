import React, { useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";

import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { orderService } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { presentCheckoutPaymentFailure } from "@/store/checkoutPaymentFailureStore";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartStore } from "@/store/cartStore";

const PAD = 20;

export default function PaymentConfirmingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pendingId: pendingIdParam, merchantName: merchantNameParam, message: messageParam, deliveryEtaLabel: deliveryEtaLabelParam, amount: amountParam, method: methodParam } = useLocalSearchParams<{
    pendingId?: string | string[];
    merchantName?: string | string[];
    message?: string | string[];
    deliveryEtaLabel?: string | string[];
    amount?: string | string[];
    method?: string | string[];
  }>();
  const pendingId = Array.isArray(pendingIdParam) ? pendingIdParam[0] : pendingIdParam;
  const merchantName = Array.isArray(merchantNameParam) ? merchantNameParam[0] : merchantNameParam;
  const initialMessage = Array.isArray(messageParam) ? messageParam[0] : messageParam;
  const deliveryEtaLabel = Array.isArray(deliveryEtaLabelParam) ? deliveryEtaLabelParam[0] : deliveryEtaLabelParam;
  const amountRaw = Array.isArray(amountParam) ? amountParam[0] : amountParam;
  const methodRaw = Array.isArray(methodParam) ? methodParam[0] : methodParam;

  const statusQuery = useQuery({
    queryKey: ["pending-order-status", pendingId],
    queryFn: () => orderService.getPendingOrderStatus(pendingId!),
    enabled: Boolean(pendingId),
    refetchInterval: 4000,
    retry: true,
  });
  const handledTerminalRef = useRef(false);

  useEffect(() => {
    const data = statusQuery.data;
    if (!data || handledTerminalRef.current) return;
    if (data.finalized && data.orderId) {
      handledTerminalRef.current = true;
      router.replace({
        pathname: "/orders/payment-success",
        params: {
          orderId: data.orderId,
          ...(merchantName ? { merchantName } : {}),
          ...(deliveryEtaLabel ? { deliveryEtaLabel } : {}),
        },
      });
      return;
    }
    if (data.paymentState === "refunded" || data.paymentState === "failed" || data.paymentState === "refund_pending") {
      handledTerminalRef.current = true;
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
    }
  }, [amountRaw, deliveryEtaLabel, merchantName, methodRaw, router, statusQuery.data]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="time-outline" size={56} color={GatiMitraColors.emerald} />
      </View>
      <AppText style={styles.title}>Confirming payment</AppText>
      <AppText style={styles.body}>
        {statusQuery.data?.message ??
          initialMessage ??
          "We received your payment attempt and are checking the final confirmation from Razorpay."}
      </AppText>
      <View style={styles.card}>
        <ActivityIndicator color={GatiMitraColors.emerald} />
        <AppText style={styles.cardTitle}>Please keep this screen open</AppText>
        <AppText style={styles.cardBody}>
          Your order will be created automatically as soon as payment is confirmed. If the payment is not confirmed within
          5 minutes, it will be cancelled and refunded automatically.
        </AppText>
        {pendingId ? <AppText style={styles.pendingId}>Ref: {pendingId}</AppText> : null}
      </View>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => router.replace("/(tabs)/orders")}
        activeOpacity={0.88}
      >
        <AppText style={styles.secondaryText}>Go to My Orders</AppText>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  content: { paddingHorizontal: PAD },
  iconWrap: { alignItems: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", color: GatiMitraColors.textPrimary, textAlign: "center", marginBottom: 10 },
  body: { fontSize: 16, color: GatiMitraColors.textSecondary, textAlign: "center", lineHeight: 24, marginBottom: 18 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#d1fae5",
    alignItems: "center",
    marginBottom: 22,
  },
  cardTitle: { marginTop: 12, fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  cardBody: { marginTop: 8, fontSize: 14, lineHeight: 22, color: GatiMitraColors.textSecondary, textAlign: "center" },
  pendingId: { marginTop: 10, fontSize: 12, color: GatiMitraColors.textSecondary },
  secondary: {
    borderWidth: 1.5,
    borderColor: GatiMitraColors.emerald,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryText: { color: GatiMitraColors.emerald, fontSize: 15, fontWeight: "700" },
});
