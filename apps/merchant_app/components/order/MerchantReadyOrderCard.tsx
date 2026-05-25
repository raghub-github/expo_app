import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { ReadyHandoverTimeline } from "@/components/order/ReadyHandoverTimeline";
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
import { sliceOrderLineItems } from "@/lib/orderCardDisplay";
import { resolvePreparedAtForHandover } from "@/lib/orderHandoverTimeline";
import { resolveMerchantInstructionsForDisplay } from "@/lib/merchant-order-instructions";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  nowMs: number;
  onViewDetail?: () => void;
  onItemPress?: (item: LineItem) => void;
};

export function MerchantReadyOrderCard({
  order,
  storeName,
  nowMs,
  onViewDetail,
  onItemPress,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [billOpen, setBillOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
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

  const preparedAtForTimeline = useMemo(
    () =>
      resolvePreparedAtForHandover(order.preparedAt, {
        isReady: order.status === "ready" || order.pipelineStatus === "READY_FOR_PICKUP",
        preparingAt: order.preparingAt,
        acceptedAt: order.acceptedAt,
        createdAt: order.createdAt,
      }),
    [order]
  );

  const merchantInstructions = useMemo(
    () =>
      resolveMerchantInstructionsForDisplay({
        merchant_instructions_list: order.merchantInstructionsList,
        requires_utensils: order.requiresUtensils,
      }),
    [order.merchantInstructionsList, order.requiresUtensils]
  );

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
                  onRowPress={() => onViewDetail?.()}
                />
              ))}
              {moreCount > 0 ? (
                <Pressable onPress={() => onViewDetail?.()}>
                  <Text style={styles.moreItems}>+{moreCount} more</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {merchantInstructions.length > 0 ? (
          <View style={styles.instructionsRow}>
            <Ionicons name="clipboard-outline" size={14} color="#B45309" />
            <Text style={styles.instructionsText} numberOfLines={2}>
              {merchantInstructions.join(" · ")}
            </Text>
          </View>
        ) : null}

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

        <View style={styles.timelineWrap}>
          <ReadyHandoverTimeline
            preparedAt={preparedAtForTimeline}
            handedOverAt={order.handedOverToRiderAt}
            pickedUpAt={order.riderPickedUpAt}
            pickupOtp={order.pickupOtp}
            nowMs={nowMs}
          />
        </View>

        <View style={styles.riderRow}>
          <View style={styles.riderAvatar}>
            <Ionicons name="bicycle" size={16} color="#888888" />
          </View>
          <Text style={styles.riderText}>Rider is arriving soon</Text>
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
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  headerLeft: { flex: 1, minWidth: 0, gap: 4 },
  storeName: { fontSize: 12, fontWeight: "500", color: "#666666" },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
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
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  sectionMeta: { fontSize: 12, fontWeight: "500", color: "#666666" },
  itemsBox: { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  itemText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    borderStyle: "dashed",
    paddingBottom: 2,
  },
  custPill: {
    flexShrink: 0,
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  custPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0F766E",
    letterSpacing: 0.2,
  },
  moreItems: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  instructionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  instructionsText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: "#92400E",
    lineHeight: 15,
  },
  billAmount: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  billBreakdown: { paddingHorizontal: 14, paddingBottom: 10, gap: 6 },
  billRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  billItemLabel: { flex: 1, fontSize: 12, color: "#666666" },
  billItemValue: { fontSize: 12, fontWeight: "600", color: "#1A1A1A" },
  timelineWrap: { paddingHorizontal: 14, paddingVertical: 8 },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  riderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  riderText: { flex: 1, fontSize: 13, fontWeight: "500", color: "#1A1A1A" },
  pressed: { opacity: 0.9 },
});
