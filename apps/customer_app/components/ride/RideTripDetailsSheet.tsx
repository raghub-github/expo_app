/**
 * Trip details bottom sheet for active person-ride orders.
 */

import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OrderDetail } from "@/services/order.service";
import { formatRideFare } from "@/lib/ride-order-display";
import {
  RIDE_TOLL_NOTICE_DETAIL,
  resolveRideTypeForTollNotice,
  shouldShowRideTollNotice,
} from "@/lib/ride-toll-notice";

type RideTripDetailsSheetProps = {
  visible: boolean;
  order: OrderDetail;
  rideFare?: number | null;
  waitingCharge?: number | null;
  totalFare?: number | null;
  hasPickupWait?: boolean;
  onClose: () => void;
  onCancelRide?: () => void;
  showCancelRide?: boolean;
};

export function RideTripDetailsSheet({
  visible,
  order,
  rideFare,
  waitingCharge,
  totalFare,
  hasPickupWait = false,
  onClose,
  onCancelRide,
  showCancelRide = false,
}: RideTripDetailsSheetProps) {
  const insets = useSafeAreaInsets();
  const pickup = order.merchantAddress?.trim() || "—";
  const drop = order.deliveryAddress?.trim() || "—";
  const vehicleLabel = order.rideType?.trim() || order.rider?.vehicleModel?.trim() || "Ride";
  const payment = (order.paymentMethod ?? "UPI").replace(/_/g, " ").toUpperCase();

  const resolvedRideFare =
    rideFare != null && Number.isFinite(rideFare)
      ? rideFare
      : order.totalAmount != null && Number.isFinite(order.totalAmount)
        ? Number(order.totalAmount)
        : null;
  const resolvedWaiting =
    waitingCharge != null && Number.isFinite(waitingCharge) ? Math.max(0, waitingCharge) : 0;
  const resolvedTotal =
    totalFare != null && Number.isFinite(totalFare)
      ? totalFare
      : resolvedRideFare != null
        ? resolvedRideFare + resolvedWaiting
        : null;

  const showFareBreakdown =
    hasPickupWait || resolvedWaiting > 0 || (resolvedRideFare != null && resolvedTotal != null);
  const showTollNotice = shouldShowRideTollNotice(resolveRideTypeForTollNotice(order));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.title}>Trip details</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {showTollNotice ? (
            <View style={styles.tollNote}>
              <Text style={styles.tollNoteText}>{RIDE_TOLL_NOTICE_DETAIL}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <View style={[styles.dot, styles.dotPickup]} />
            <View style={styles.textCol}>
              <Text style={styles.rowLabel}>Pickup</Text>
              <Text style={styles.rowValue}>{pickup}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={[styles.dot, styles.dotDrop]} />
            <View style={styles.textCol}>
              <Text style={styles.rowLabel}>Drop</Text>
              <Text style={styles.rowValue}>{drop}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Vehicle</Text>
            <Text style={styles.metaValue}>{vehicleLabel}</Text>
          </View>
          {showFareBreakdown ? (
            <>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Ride fare</Text>
                <Text style={styles.metaValue}>{formatRideFare(resolvedRideFare)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Waiting charges</Text>
                <Text style={[styles.metaValue, styles.waitingValue]}>
                  {formatRideFare(resolvedWaiting)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Total fare</Text>
                <Text style={[styles.metaValue, styles.totalFareValue]}>
                  {formatRideFare(resolvedTotal)}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fare</Text>
              <Text style={styles.metaValue}>
                {resolvedTotal != null
                  ? formatRideFare(resolvedTotal)
                  : resolvedRideFare != null
                    ? formatRideFare(resolvedRideFare)
                    : "—"}
              </Text>
            </View>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Payment</Text>
            <Text style={styles.metaValue}>{payment}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Order ID</Text>
            <Text style={styles.metaValue}>{order.formattedOrderId ?? order.orderId}</Text>
          </View>
        </ScrollView>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.9}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
        {showCancelRide && onCancelRide ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancelRide} activeOpacity={0.9}>
            <Text style={styles.cancelBtnText}>Cancel Ride</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "72%",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  tollNote: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  tollNoteText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#92400E",
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  dotPickup: { backgroundColor: "#22C55E" },
  dotDrop: { backgroundColor: "#EF4444" },
  textCol: { flex: 1 },
  rowLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  metaLabel: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  metaValue: { fontSize: 13, color: "#111827", fontWeight: "600", maxWidth: "62%", textAlign: "right" },
  waitingValue: { color: "#854D0E" },
  totalFareValue: { fontWeight: "800", fontSize: 14 },
  closeBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  cancelBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#991B1B",
    backgroundColor: "#FFFFFF",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#991B1B",
  },
});
