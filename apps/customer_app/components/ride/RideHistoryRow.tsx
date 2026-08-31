import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import type { OrderSummary } from "@/services/order.service";
import { isRideCaptainRatingPending } from "@/lib/person-ride-orders";
import {
  formatRideFare,
  formatRideHistoryDateTime,
  getRideDropTitle,
  getRideHistoryStatusLabel,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";
import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;

type Props = {
  order: OrderSummary;
  onPress: () => void;
  onRateCaptain?: () => void;
};

export function RideHistoryRow({ order, onPress, onRateCaptain }: Props) {
  const destination = getRideDropTitle(order);
  const statusLabel = getRideHistoryStatusLabel(order.status);
  const fareLabel = formatRideFare(order.totalAmount);
  const vehicleImage = resolveRideVehicleImage(order.rideType);
  const canRate = isRideCaptainRatingPending(order);
  const ratedStars =
    order.deliveryRating != null && Number(order.deliveryRating) >= 1
      ? Math.round(Number(order.deliveryRating))
      : null;

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
        {canRate && onRateCaptain ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onRateCaptain();
            }}
            activeOpacity={0.8}
            hitSlop={8}
            style={styles.rateBtn}
          >
            <Ionicons name="star-outline" size={14} color={GREEN} />
            <AppText style={styles.rateBtnText}>Rate captain</AppText>
          </TouchableOpacity>
        ) : ratedStars != null ? (
          <View style={styles.ratedRow}>
            <AppText style={styles.ratedText}>You rated {ratedStars}</AppText>
            <Ionicons name="star" size={12} color="#F59E0B" />
          </View>
        ) : null}
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
  rateBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rateBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
  },
  ratedRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
});
