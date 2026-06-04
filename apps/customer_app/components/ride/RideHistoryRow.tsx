import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
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
        <Image source={vehicleImage} style={styles.vehicleImage} resizeMode="contain" />
      </View>

      <View style={styles.content}>
        <Text style={styles.destination} numberOfLines={1}>
          {destination}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatRideHistoryDateTime(order.createdAt)}
        </Text>
        <Text style={styles.fareStatus} numberOfLines={1}>
          {fareLabel} • {statusLabel}
        </Text>
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
