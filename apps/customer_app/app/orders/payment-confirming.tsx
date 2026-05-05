import React, { useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { orderService } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAD = 20;

export default function PaymentConfirmingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pendingId: pendingIdParam, merchantName: merchantNameParam, message: messageParam } = useLocalSearchParams<{
    pendingId?: string | string[];
    merchantName?: string | string[];
    message?: string | string[];
  }>();
  const pendingId = Array.isArray(pendingIdParam) ? pendingIdParam[0] : pendingIdParam;
  const merchantName = Array.isArray(merchantNameParam) ? merchantNameParam[0] : merchantNameParam;
  const initialMessage = Array.isArray(messageParam) ? messageParam[0] : messageParam;

  const statusQuery = useQuery({
    queryKey: ["pending-order-status", pendingId],
    queryFn: () => orderService.getPendingOrderStatus(pendingId!),
    enabled: Boolean(pendingId),
    refetchInterval: 4000,
    retry: true,
  });

  useEffect(() => {
    const data = statusQuery.data;
    if (!data) return;
    if (data.finalized && data.orderId) {
      router.replace({
        pathname: "/orders/payment-success",
        params: {
          orderId: data.orderId,
          ...(merchantName ? { merchantName } : {}),
        },
      });
      return;
    }
    if (data.paymentState === "refunded" || data.paymentState === "failed" || data.paymentState === "refund_pending") {
      router.replace({
        pathname: "/orders/payment-failure",
        params: {
          title: data.paymentState === "refund_pending" ? "Refund in progress" : "Payment not confirmed",
          message:
            data.message ??
            (data.paymentState === "refund_pending"
              ? "Payment could not be confirmed in time. Refund has been started."
              : "Payment could not be confirmed. Please check your bank statement or contact support."),
        },
      });
    }
  }, [merchantName, router, statusQuery.data]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="time-outline" size={56} color={GatiMitraColors.emerald} />
      </View>
      <Text style={styles.title}>Confirming payment</Text>
      <Text style={styles.body}>
        {statusQuery.data?.message ??
          initialMessage ??
          "We received your payment attempt and are checking the final confirmation from Razorpay."}
      </Text>
      <View style={styles.card}>
        <ActivityIndicator color={GatiMitraColors.emerald} />
        <Text style={styles.cardTitle}>Please keep this screen open</Text>
        <Text style={styles.cardBody}>
          Your order will be created automatically as soon as payment is confirmed. If the payment is not confirmed within
          5 minutes, it will be cancelled and refunded automatically.
        </Text>
        {pendingId ? <Text style={styles.pendingId}>Ref: {pendingId}</Text> : null}
      </View>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => router.replace("/(tabs)/orders")}
        activeOpacity={0.88}
      >
        <Text style={styles.secondaryText}>Go to My Orders</Text>
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
