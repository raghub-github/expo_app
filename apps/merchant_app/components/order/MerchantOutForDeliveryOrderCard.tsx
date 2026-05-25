import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import {
  MerchantOrderCardToolbar,
  MerchantOrderIdRow,
} from "@/components/order/MerchantOrderCardToolbar";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import {
  formatCustomerPossessiveOrderLabel,
  formatOrderDateTime,
} from "@/components/order/orderFormatters";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { sliceOrderLineItems } from "@/lib/orderCardDisplay";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import { callRider } from "@/lib/orderCardActions";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchFoodOrderRidersLog,
  type FoodOrderRiderLogEntry,
} from "@/services/ordersApi";

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  onViewDetail?: () => void;
  onItemPress?: (item: LineItem) => void;
};

function pickActiveRider(riders: FoodOrderRiderLogEntry[]): FoodOrderRiderLogEntry | null {
  if (!riders.length) return null;
  const picked = riders.find((r) => r.picked_up_at && !r.delivered_at && !r.cancelled_at);
  if (picked) return picked;
  const accepted = riders.find(
    (r) =>
      r.assignment_status === "ACTIVE" ||
      r.assignment_status === "ACCEPTED" ||
      r.assignment_status === "PICKED_UP"
  );
  return accepted ?? riders[0];
}

function riderFirstName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "Delivery partner";
  return n.split(/\s+/)[0] ?? n;
}

export function MerchantOutForDeliveryOrderCard({
  order,
  storeName,
  onViewDetail,
  onItemPress,
}: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const [detailsOpen, setDetailsOpen] = useState(true);
  const [billOpen, setBillOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [rider, setRider] = useState<FoodOrderRiderLogEntry | null>(null);
  const { speaking, speak } = useOrderSpeech();

  const itemCount = useMemo(
    () => order.lineItems.reduce((sum, it) => sum + it.qty, 0),
    [order.lineItems]
  );
  const { visible: visibleItems, moreCount } = useMemo(
    () => sliceOrderLineItems(order.lineItems),
    [order.lineItems]
  );

  const customerLabel = formatCustomerPossessiveOrderLabel(
    order.customerName,
    order.customerStoreOrderOrdinal
  );
  const placedAt = formatOrderDateTime(order.createdAt);

  const riderLine = useMemo(() => {
    const first = riderFirstName(rider?.rider_name);
    return `${first} is out for delivery`;
  }, [rider?.rider_name]);

  useEffect(() => {
    if (!token || !storeId || order.id.startsWith("core-")) return;
    const foodId = parseInt(order.id, 10);
    if (!Number.isFinite(foodId)) return;
    let cancelled = false;
    void fetchFoodOrderRidersLog(storeId, foodId, token).then((rows) => {
      if (!cancelled) setRider(pickActiveRider(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [token, storeId, order.id]);

  const openDetail = useCallback(() => {
    onViewDetail?.();
  }, [onViewDetail]);

  return (
    <>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <MerchantOrderIdRow
              formattedOrderId={order.formattedOrderId}
              fallbackOrderId={order.ordersCoreId}
            />
            {storeName ? (
              <Text style={styles.storeName} numberOfLines={1}>
                {storeName}
              </Text>
            ) : null}
          </View>
          <MerchantOrderCardToolbar
            onSpeak={() => void speak(order)}
            onMenu={() => setMenuOpen(true)}
            speakingActive={speaking}
          />
        </View>

        <Pressable
          onPress={() => setCustomerOpen(true)}
          style={({ pressed }) => [styles.customerRow, pressed && styles.pressed]}
        >
          <Text style={styles.customerLabel} numberOfLines={1}>
            {customerLabel}
          </Text>
          <Text style={styles.placedAt}>{placedAt}</Text>
        </Pressable>

        <View style={styles.section}>
          <Pressable onPress={() => setDetailsOpen((v) => !v)} style={styles.sectionHead}>
            <Ionicons name="bag-handle-outline" size={18} color="#444444" />
            <Text style={styles.sectionTitle}>Details</Text>
            <Text style={styles.sectionMeta}>
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </Text>
            <Ionicons
              name={detailsOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color="#666666"
            />
          </Pressable>
          {detailsOpen ? (
            <View style={styles.itemsBox}>
              {visibleItems.map((item, idx) => (
                <OrderCardItemRow
                  key={`${order.id}-${idx}`}
                  item={item}
                  orderVeg={order.vegNonVeg}
                  onItemNamePress={() => onItemPress?.(item)}
                  onRowPress={openDetail}
                />
              ))}
              {moreCount > 0 ? (
                <Pressable onPress={openDetail}>
                  <Text style={styles.moreItems}>+{moreCount} more</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Pressable onPress={() => setBillOpen((v) => !v)} style={styles.sectionHead}>
            <Ionicons name="receipt-outline" size={18} color="#444444" />
            <Text style={styles.sectionTitle}>Total bill</Text>
            <Text style={styles.billAmount}>₹{Math.round(order.total)}</Text>
            <Ionicons
              name={billOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color="#666666"
            />
          </Pressable>
          {billOpen ? (
            <View style={styles.billBreakdown}>
              {order.lineItems.map((item, idx) => (
                <Pressable
                  key={`bill-${idx}`}
                  onPress={() => onItemPress?.(item)}
                  style={({ pressed }) => [styles.billRow, pressed && styles.pressed]}
                >
                  <Text style={styles.billItemLabel}>
                    {item.qty} x {item.name}
                  </Text>
                  <Text style={styles.billItemValue}>₹{item.price}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.riderRow}>
          {rider?.selfie_url ? (
            <Image source={{ uri: rider.selfie_url }} style={styles.riderAvatarImg} />
          ) : (
            <View style={styles.riderAvatar}>
              <Ionicons name="person" size={18} color="#888888" />
            </View>
          )}
          <Text style={styles.riderText} numberOfLines={2}>
            {riderLine}
          </Text>
          <Pressable
            onPress={() => void callRider(rider?.rider_mobile)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            hitSlop={8}
          >
            <Ionicons name="call" size={18} color="#1A1A1A" />
          </Pressable>
        </View>
      </View>

      <MerchantOrderActionsSheet
        visible={menuOpen}
        order={order}
        storeName={storeName}
        onClose={() => setMenuOpen(false)}
        onOpenTimeline={() => setTimelineOpen(true)}
        onOpenCustomer={() => setCustomerOpen(true)}
      />

      <OrderCustomerBottomSheet
        visible={customerOpen}
        order={order}
        onClose={() => setCustomerOpen(false)}
      />

      <OrderTimelineSheet
        visible={timelineOpen}
        order={order}
        onClose={() => setTimelineOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerLeft: { flex: 1, minWidth: 0, gap: 4 },
  storeName: { fontSize: 12, fontWeight: "500", color: "#666666" },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
  },
  customerLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    minWidth: 0,
  },
  placedAt: { fontSize: 12, fontWeight: "500", color: "#666666" },
  section: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  sectionMeta: { fontSize: 12, fontWeight: "500", color: "#666666" },
  itemsBox: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#999999",
    borderStyle: "dashed",
    paddingBottom: 2,
  },
  moreItems: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  billAmount: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  billBreakdown: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  billRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  billItemLabel: { flex: 1, fontSize: 12, color: "#666666" },
  billItemValue: { fontSize: 12, fontWeight: "600", color: "#1A1A1A" },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  riderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  riderAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8E8E8",
  },
  riderText: { flex: 1, fontSize: 14, fontWeight: "500", color: "#1A1A1A" },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
});
