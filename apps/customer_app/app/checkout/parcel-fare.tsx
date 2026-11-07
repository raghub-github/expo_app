import { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import { ParcelFareCheckoutScreen } from "@/components/parcel/ParcelFareCheckoutScreen";
import { GatiMitraColors } from "@/constants/gatimitra";

function isParcelFarePaid(order: {
  cashCollected?: boolean | null;
  paymentStatus?: string | null;
}): boolean {
  if (order.cashCollected === true) return true;
  return ["paid", "completed", "captured"].includes(
    String(order.paymentStatus ?? "")
      .trim()
      .toLowerCase()
  );
}

export default function ParcelFareCheckoutRoute() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId.trim() : "";

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderService.getOrder(id),
    enabled: id.length > 0,
  });

  // Never call router.* during render — that updates NavigationContainer while
  // this route is still rendering (React "Cannot update a component while rendering").
  useEffect(() => {
    if (!id) {
      router.back();
    }
  }, [id, router]);

  useEffect(() => {
    if (!id || isLoading) return;
    if (isError || !order) {
      router.back();
    }
  }, [id, isLoading, isError, order, router]);

  if (!id || isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GatiMitraColors.deepMintStart} />
      </View>
    );
  }

  if (isError || !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GatiMitraColors.deepMintStart} />
      </View>
    );
  }

  // Already-paid orders are handled inside the screen (success sheet or redirect).
  // Keep rendering so a just-completed payment can show the custom success sheet.
  return (
    <ParcelFareCheckoutScreen
      order={order}
      initiallyPaid={isParcelFarePaid(order)}
      onBack={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
});
