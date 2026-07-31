import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import { RideFareCheckoutScreen } from "@/components/ride/RideFareCheckoutScreen";
import { RideCashPayScreen } from "@/components/ride/RideCashPayScreen";
import { GatiMitraColors } from "@/constants/gatimitra";

function isCashRideOrder(paymentMethod: string | null | undefined): boolean {
  const m = String(paymentMethod ?? "").trim().toLowerCase();
  return m === "cash" || m === "cod";
}

export default function RideFareCheckoutRoute() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId.trim() : "";

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderService.getOrder(id),
    enabled: id.length > 0,
  });

  if (!id) {
    router.back();
    return null;
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GatiMitraColors.deepMintStart} />
      </View>
    );
  }

  if (isError || !order) {
    router.back();
    return null;
  }

  if (isCashRideOrder(order.paymentMethod)) {
    return <RideCashPayScreen order={order} onBack={() => router.back()} />;
  }

  return <RideFareCheckoutScreen order={order} onBack={() => router.back()} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
});
