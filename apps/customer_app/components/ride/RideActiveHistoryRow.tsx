import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { OrderSummary } from "@/services/order.service";
import { getActiveRideTrackLabel } from "@/lib/person-ride-orders";
import {
  formatRideFare,
  formatRideHistoryDateTime,
  getRideDropTitle,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";

const GREEN = GatiMitraColors.primaryMint;

type Props = {
  order: OrderSummary;
  onPress: () => void;
};

export function RideActiveHistoryRow({ order, onPress }: Props) {
  const track = getActiveRideTrackLabel(order.status);
  const destination = getRideDropTitle(order);
  const vehicleImage = resolveRideVehicleImage(order.rideType);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.topRow}>
        <Image source={vehicleImage} style={styles.vehicleImage} resizeMode="contain" />
        <View style={styles.topText}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {destination}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.date}>{formatRideHistoryDateTime(order.createdAt)}</Text>
        <View style={styles.trackPill}>
          <Text style={styles.trackPillText}>{track.subtitle}</Text>
        </View>
        {order.totalAmount != null ? (
          <Text style={styles.fare}>{formatRideFare(order.totalAmount)}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EBEBEB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  vehicleImage: {
    width: 40,
    height: 40,
  },
  topText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: "#6B7280",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  date: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
  },
  trackPill: {
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trackPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: GREEN,
  },
  fare: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
