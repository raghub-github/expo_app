/**
 * Rapido-style completed / cancelled ride details.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { OrderDetail } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import {
  formatRideFare,
  formatRideHistoryDateTime,
  formatRideTripStats,
  getRideFareBreakdown,
  getRideHistoryStatusLabel,
  getRideServiceLabel,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";

const GREEN = GatiMitraColors.primaryMint;
const PAGE_BG = "#F3F4F6";

type Props = {
  order: OrderDetail;
  onBack: () => void;
  onOpenSupport: () => void;
};

function RouteStop({
  variant,
  address,
  isLast,
}: {
  variant: "pickup" | "drop";
  address: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.routeStopRow}>
      <View style={styles.routeRailCol}>
        <View style={[styles.routeDot, variant === "pickup" ? styles.routeDotPickup : styles.routeDotDrop]} />
        {!isLast ? <View style={styles.routeRail} /> : null}
      </View>
      <Text style={styles.routeAddress}>{address}</Text>
    </View>
  );
}

export function RideOrderDetailsScreen({ order, onBack, onOpenSupport }: Props) {
  const insets = useSafeAreaInsets();
  const [addressExpanded, setAddressExpanded] = useState(true);
  const [fareExpanded, setFareExpanded] = useState(true);

  const statusNorm = normalizeCustomerOrderStatus(order.status);
  const isCancelled = statusNorm === "CANCELLED";
  const isCompleted = statusNorm === "DELIVERED";
  const statusLabel = getRideHistoryStatusLabel(order.status);
  const rideLabel = getRideServiceLabel(order.rideType);
  const vehicleImage = resolveRideVehicleImage(order.rideType);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const pickupAddress = order.merchantAddress?.trim() || "Pickup location";
  const dropAddress = order.deliveryAddress?.trim() || "Drop location";
  const { total, tip, rideCharge } = getRideFareBreakdown(order);
  const tripStats = formatRideTripStats(order.distanceKm, order.rideDurationMinutes);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerSide} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryLeft}>
              <Text style={styles.rideTypeTitle}>{rideLabel}</Text>
              <Text style={styles.rideDate}>{formatRideHistoryDateTime(order.createdAt)}</Text>
              <Text style={styles.rideFare}>
                {formatRideFare(total)}
                <Text style={styles.estTag}> (.est)</Text>
              </Text>
            </View>
            <View style={styles.summaryRight}>
              <Image source={vehicleImage} style={styles.summaryVehicle} resizeMode="contain" />
              <View
                style={[
                  styles.statusBadge,
                  isCompleted && styles.statusBadgeCompleted,
                  isCancelled && styles.statusBadgeCancelled,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                ) : null}
                <Text
                  style={[
                    styles.statusBadgeText,
                    isCompleted && styles.statusBadgeTextCompleted,
                    isCancelled && styles.statusBadgeTextCancelled,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setAddressExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.sectionTitle}>Address details</Text>
            <Ionicons name={addressExpanded ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
          </TouchableOpacity>

          {addressExpanded ? (
            <View style={styles.sectionBody}>
              <Text style={styles.rideIdText}>Ride ID #{displayOrderId}</Text>
              <RouteStop variant="pickup" address={pickupAddress} />
              <RouteStop variant="drop" address={dropAddress} isLast />
              {tripStats ? <Text style={styles.tripStats}>{tripStats}</Text> : null}
            </View>
          ) : null}
        </View>

        <TouchableOpacity style={styles.helpBanner} onPress={onOpenSupport} activeOpacity={0.9}>
          <View style={styles.helpIconWrap}>
            <Ionicons name="headset" size={20} color="#2563EB" />
          </View>
          <View style={styles.helpTextWrap}>
            <Text style={styles.helpTitle}>Need help?</Text>
            <Text style={styles.helpSub}>We&apos;re a tap away</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#2563EB" />
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.summaryHeaderRow}>
            <Ionicons name="receipt-outline" size={18} color="#111827" />
            <Text style={styles.summaryHeaderText}>RIDE SUMMARY</Text>
          </View>

          <TouchableOpacity
            style={styles.fareHeaderRow}
            onPress={() => setFareExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.fareHeaderLabel}>Suggested Fare</Text>
            <View style={styles.fareHeaderRight}>
              <Text style={styles.fareHeaderAmount}>{formatRideFare(total)}</Text>
              <Ionicons name={fareExpanded ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
            </View>
          </TouchableOpacity>

          {fareExpanded ? (
            <View style={styles.fareBreakdown}>
              <View style={styles.fareLine}>
                <Text style={styles.fareLineLabel}>Ride Charge</Text>
                <Text style={styles.fareLineValue}>{formatRideFare(rideCharge)}</Text>
              </View>
              {tip > 0 ? (
                <View style={styles.fareLine}>
                  <Text style={styles.fareLineLabel}>Tip</Text>
                  <Text style={styles.fareLineValue}>{formatRideFare(tip)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.disclaimerRow}>
          <Ionicons name="information-circle-outline" size={16} color="#9CA3AF" />
          <Text style={styles.disclaimerText}>
            Fare shown is an estimate. Final amount may vary based on route and waiting time. Tax
            invoices are not provided for this trip.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: PAGE_BG,
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLeft: {
    flex: 1,
  },
  rideTypeTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  rideDate: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  rideFare: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  estTag: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  summaryRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  summaryVehicle: {
    width: 72,
    height: 48,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  statusBadgeCompleted: {
    backgroundColor: "#ECFDF5",
  },
  statusBadgeCancelled: {
    backgroundColor: "#FEF2F2",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  statusBadgeTextCompleted: {
    color: GREEN,
  },
  statusBadgeTextCancelled: {
    color: "#DC2626",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  sectionBody: {
    marginTop: 14,
  },
  rideIdText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 12,
  },
  routeStopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 4,
  },
  routeRailCol: {
    width: 16,
    alignItems: "center",
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  routeDotPickup: {
    backgroundColor: GREEN,
  },
  routeDotDrop: {
    backgroundColor: "#EF4444",
  },
  routeRail: {
    width: 2,
    flex: 1,
    minHeight: 24,
    borderStyle: "dashed",
    borderLeftWidth: 2,
    borderColor: "#D1D5DB",
    marginTop: 2,
  },
  routeAddress: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    paddingBottom: 10,
  },
  tripStats: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
  },
  helpBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  helpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  helpTextWrap: {
    flex: 1,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2563EB",
  },
  helpSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  summaryHeaderText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.4,
  },
  fareHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  fareHeaderLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  fareHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fareHeaderAmount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  fareBreakdown: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    gap: 8,
  },
  fareLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 8,
  },
  fareLineLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  fareLineValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#9CA3AF",
  },
});
