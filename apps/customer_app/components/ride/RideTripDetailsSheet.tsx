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

type RideTripDetailsSheetProps = {
  visible: boolean;
  order: OrderDetail;
  onClose: () => void;
};

export function RideTripDetailsSheet({ visible, order, onClose }: RideTripDetailsSheetProps) {
  const insets = useSafeAreaInsets();
  const pickup = order.merchantAddress?.trim() || "—";
  const drop = order.deliveryAddress?.trim() || "—";
  const vehicleLabel = order.rideType?.trim() || order.rider?.vehicleModel?.trim() || "Ride";
  const fare =
    order.totalAmount != null && Number.isFinite(order.totalAmount)
      ? `₹${Math.round(order.totalAmount)}`
      : "—";
  const payment = (order.paymentMethod ?? "UPI").replace(/_/g, " ").toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.title}>Trip details</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
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
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Fare</Text>
            <Text style={styles.metaValue}>{fare}</Text>
          </View>
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
  closeBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
