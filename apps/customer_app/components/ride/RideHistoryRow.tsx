import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import type { OrderSummary } from "@/services/order.service";
import {
  formatRideFare,
  formatRideHistoryDateTime,
  getRideDropTitle,
  getRideHistoryStatusLabel,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";

type Props = {
  order: OrderSummary;
  onPress: () => void;
};

export function RideHistoryRow({ order, onPress }: Props) {
  const destination = getRideDropTitle(order);
  const statusLabel = getRideHistoryStatusLabel(order.status);
  const fareLabel = formatRideFare(order.totalAmount);
  const vehicleImage = resolveRideVehicleImage(order.rideType);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.iconWrap}>
        {vehicleImage ? (
          <Image source={vehicleImage} style={styles.vehicleImage} resizeMode="contain" />
        ) : null}
      </View>

      <View style={styles.content}>
        <AppText style={styles.destination} numberOfLines={1}>
          {destination}
        </AppText>
        <AppText style={styles.meta} numberOfLines={1}>
          {formatRideHistoryDateTime(order.createdAt)}
        </AppText>
        <AppText style={styles.fareStatus} numberOfLines={1}>
          {fareLabel} • {statusLabel}
        </AppText>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleImage: {
    width: 38,
    height: 38,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  destination: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 2,
  },
  fareStatus: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
});
