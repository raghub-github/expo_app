import { useCallback, useState, type ReactNode } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { OrderRecord, OrderStage, DeliveryType, LineItem } from "@/hooks/useOrders";
import { TerminalOrderCard } from "@/components/order/TerminalOrderCard";
import { RecentCompletedOrderCard } from "@/components/order/RecentCompletedOrderCard";
import { MerchantPreparingOrderCard } from "@/components/order/MerchantPreparingOrderCard";
import { MerchantReadyOrderCard } from "@/components/order/MerchantReadyOrderCard";
import { MerchantOutForDeliveryOrderCard } from "@/components/order/MerchantOutForDeliveryOrderCard";
import { NewOrderCard } from "@/components/order/NewOrderCard";
import { OrderItemDetailsSheet } from "@/components/order/OrderItemDetailsSheet";
import { SlideToConfirm } from "@/components/order/SlideToConfirm";
import { sliceOrderLineItems } from "@/lib/orderCardDisplay";
import { isOrderWithinLast24Hours } from "@/lib/orderRecency";
import { formatOrderCardCustomerLabel } from "@/components/order/orderFormatters";
import { MerchantOrderIdRow } from "@/components/order/MerchantOrderCardToolbar";
import { OrderCardItemRow } from "@/components/order/OrderCardItemRow";
import { OrderCardMerchantInstructions } from "@/components/order/OrderCardMerchantInstructions";
import { useNowMs } from "@/hooks/useNowMs";

const STATUS_GREEN = "#22C55E";

const STATUS_BADGE_COLORS: Record<
  OrderStage,
  { bg: string; color: string; border: string }
> = {
  created: { bg: "#22C55E", color: "#FFFFFF", border: "#16A34A" },
  preparing: { bg: "#16A34A", color: "#FFFFFF", border: "#15803D" },
  ready: { bg: "#0D9488", color: "#FFFFFF", border: "#0F766E" },
  picked_up: { bg: "#2563EB", color: "#FFFFFF", border: "#1D4ED8" },
  delivered: { bg: "#16A34A", color: "#FFFFFF", border: "#15803D" },
  rejected: { bg: "#DC2626", color: "#FFFFFF", border: "#B91C1C" },
  rto: { bg: "#EA580C", color: "#FFFFFF", border: "#C2410C" },
};

function formatTimeSince(createdAt: string, nowMs: number): string {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return "";
  const diff = Math.max(0, nowMs - createdMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  const hours = Math.floor(mins / 60);
  if (hours <= 0) return `${mins}m ago`;
  return `${hours}h ${mins % 60}m ago`;
}

function formatTimerSince(createdAt: string, nowMs: number): string {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return "00:00";
  const diff = Math.max(0, nowMs - createdMs);
  const totalSeconds = Math.floor(diff / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DeliveryBadge({ deliveryType }: { deliveryType: DeliveryType }) {
  let label = "Delivery";
  let bg = "#E5E7EB";
  let color: string = GatiMitraMerchant.textSecondary;
  if (deliveryType === "GATIMITRA_RIDER") {
    label = "GatiMitra Rider";
    bg = "#DBEAFE";
    color = "#1D4ED8";
  } else if (deliveryType === "SELF_DELIVERY") {
    label = "Self Delivery";
    bg = "#DCFCE7";
    color = STATUS_GREEN;
  } else if (deliveryType === "SELF_PICKUP") {
    label = "Self Pickup";
    bg = "#FEF3C7";
    color = "#92400E";
  }
  return (
    <View style={[styles.deliveryBadge, { backgroundColor: bg }]}>
      <Text style={[styles.deliveryBadgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: OrderStage }) {
  const { bg, color, border } = STATUS_BADGE_COLORS[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.statusBadgeText, { color }]} numberOfLines={1}>
        {status.replace("_", " ").toUpperCase()}
      </Text>
    </View>
  );
}

function OtpPill({ label, code }: { label: string; code: string }) {
  const digits = code.split("");
  return (
    <View style={styles.otpRow}>
      <Text style={styles.otpLabel}>{label}</Text>
      <View style={styles.otpBoxes}>
        {digits.map((d, i) => (
          <View key={`${label}-${i}`} style={styles.otpBox}>
            <Text style={styles.otpDigit}>{d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type SliderStage = "preparing" | "ready" | "picked_up";

export function canMerchantMarkDelivered(order: OrderRecord): boolean {
  if (order.deliveryType === "GATIMITRA_RIDER") return false;
  return true;
}

function isTerminalStatus(status: OrderStage): boolean {
  return status === "rejected" || status === "rto" || status === "delivered";
}

export type LiveOrderCardProps = {
  order: OrderRecord;
  nowMs?: number;
  acceptanceWindowMinutes?: number;
  storeName?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onAdvance: () => void;
  onNeedMoreTime?: () => void;
  onViewDetail: () => void;
  onReviewPress?: () => void;
  actionLoading?: boolean;
};

export function LiveOrderCard({
  order,
  nowMs,
  acceptanceWindowMinutes,
  storeName,
  onAccept,
  onReject,
  onAdvance,
  onNeedMoreTime,
  onViewDetail,
  onReviewPress,
  actionLoading,
}: LiveOrderCardProps) {
  const localNow = useNowMs(nowMs == null);
  const clock = nowMs ?? localNow;
  const [selectedItem, setSelectedItem] = useState<LineItem | null>(null);
  const onItemPress = useCallback((item: LineItem) => setSelectedItem(item), []);

  let card: ReactNode;

  if (isTerminalStatus(order.status)) {
    card = isOrderWithinLast24Hours(order) ? (
      <RecentCompletedOrderCard
        order={order}
        rejectedReason={order.rejectedReason}
        storeName={storeName}
        onPress={onViewDetail}
        onReviewPress={onReviewPress}
        onItemPress={onItemPress}
      />
    ) : (
      <TerminalOrderCard
        order={order}
        rejectedReason={order.rejectedReason}
        storeName={storeName}
        onPress={onViewDetail}
        onReviewPress={onReviewPress}
      />
    );
  } else if (
    order.pipelineStatus === "ACCEPTED" ||
    order.pipelineStatus === "PREPARING" ||
    order.status === "preparing"
  ) {
    card = (
      <MerchantPreparingOrderCard
        order={order}
        storeName={storeName}
        nowMs={clock}
        onReady={onAdvance}
        onNeedMoreTime={onNeedMoreTime}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
        loading={actionLoading}
      />
    );
  } else if (order.status === "ready" || order.pipelineStatus === "READY_FOR_PICKUP") {
    card = (
      <MerchantReadyOrderCard
        order={order}
        storeName={storeName}
        nowMs={clock}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
      />
    );
  } else if (order.status === "picked_up" || order.pipelineStatus === "OUT_FOR_DELIVERY") {
    card = (
      <MerchantOutForDeliveryOrderCard
        order={order}
        storeName={storeName}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
      />
    );
  } else if (order.status === "created") {
    card = (
      <NewOrderCard
        order={order}
        nowMs={clock}
        acceptanceWindowMinutes={acceptanceWindowMinutes}
        onAccept={onAccept}
        onReject={onReject}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
        actionLoading={actionLoading}
      />
    );
  } else {
    card = (
      <LiveOrderCardDefault
        order={order}
        nowMs={clock}
        onAdvance={onAdvance}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
      />
    );
  }

  return (
    <>
      {card}
      <OrderItemDetailsSheet
        visible={selectedItem != null}
        lineItem={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}

function LiveOrderCardDefault({
  order,
  nowMs,
  onAdvance,
  onViewDetail,
  onItemPress,
}: {
  order: OrderRecord;
  nowMs: number;
  onAdvance: () => void;
  onViewDetail: () => void;
  onItemPress: (item: LineItem) => void;
}) {
  const timeSince = formatTimeSince(order.createdAt, nowMs);
  const timer = formatTimerSince(order.createdAt, nowMs);

  const showPickupOtp =
    (order.status === "ready" || order.status === "picked_up") && !!order.pickupOtp;
  const showRtoOtp = order.status === "rto" && !!order.rtoOtp;
  const { visible: visibleItems, moreCount } = sliceOrderLineItems(order.lineItems);
  const customerLabel = formatOrderCardCustomerLabel(
    order.customerName,
    order.customerStoreOrderOrdinal
  );

  const primaryActionLabel = (() => {
    switch (order.status) {
      case "preparing":
        return `MARK READY ${timer}`;
      case "ready":
        return "CONFIRM PICKUP";
      case "picked_up":
        return canMerchantMarkDelivered(order) ? "COMPLETE DELIVERY" : "RIDER WILL COMPLETE";
      default:
        return "";
    }
  })();

  const sliderDisabled =
    order.status === "delivered" ||
    order.status === "rejected" ||
    order.status === "rto" ||
    (order.status === "picked_up" && !canMerchantMarkDelivered(order));

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.orderIdRow}>
            <MerchantOrderIdRow
              formattedOrderId={order.formattedOrderId}
              fallbackOrderId={order.ordersCoreId}
            />
            <Text style={styles.displayTime}>{order.displayTime}</Text>
          </View>
          <View style={styles.customerNameRow}>
            <Text style={styles.customerName} numberOfLines={2}>
              {customerLabel}
            </Text>
          </View>
          <Text style={styles.timeSince}>{timeSince}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <DeliveryBadge deliveryType={order.deliveryType} />
          <StatusBadge status={order.status} />
          <Pressable
            onPress={onViewDetail}
            style={({ pressed }) => [
              styles.moreBtn,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
            hitSlop={8}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={18}
              color={GatiMitraMerchant.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.itemsSection}>
        {visibleItems.map((item, idx) => (
          <OrderCardItemRow
            key={`${order.id}-${idx}`}
            item={item}
            orderVeg={item.vegNonveg}
            onItemNamePress={() => onItemPress(item)}
            onRowPress={onViewDetail}
            showPrice
          />
        ))}
        {moreCount > 0 && (
          <Pressable
            onPress={onViewDetail}
            style={({ pressed }) => [styles.moreItemsRow, pressed && styles.pressed]}
          >
            <Text style={styles.moreItemsText}>+{moreCount} more</Text>
            <Text style={styles.moreItemsTotal}>
              ₹{order.total.toLocaleString("en-IN")}
            </Text>
          </Pressable>
        )}
      </View>

      <OrderCardMerchantInstructions
        merchantInstructionsList={order.merchantInstructionsList}
        requiresUtensils={order.requiresUtensils}
        style={{ marginBottom: 8 }}
      />

      <Pressable
        onPress={onViewDetail}
        style={({ pressed }) => [styles.totalRow, pressed && styles.pressed]}
      >
        <Text style={styles.totalLabel}>Total bill: </Text>
        <Text style={styles.totalAmount}>₹ {order.total}</Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={GatiMitraMerchant.textTertiary}
          style={styles.totalChevron}
        />
      </Pressable>

      {showPickupOtp && order.pickupOtp && (
        <OtpPill label="Pickup OTP" code={order.pickupOtp} />
      )}
      {showRtoOtp && order.rtoOtp && (
        <OtpPill label="RTO OTP" code={order.rtoOtp} />
      )}

      {primaryActionLabel ? (
        <View style={styles.sliderOnlyRow}>
          <SlideToConfirm
            label={primaryActionLabel}
            onConfirmed={onAdvance}
            disabled={sliderDisabled}
            stage={
              order.status === "preparing"
                ? "preparing"
                : order.status === "ready"
                  ? "ready"
                  : "picked_up"
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardHeaderLeft: { flexShrink: 1, paddingRight: 8, flex: 1, minWidth: 0 },
  cardHeaderRight: { alignItems: "flex-end", gap: 6 },
  orderIdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  displayTime: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    flexShrink: 0,
  },
  customerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  customerName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: STATUS_GREEN,
    minWidth: 0,
  },
  timeSince: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  deliveryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  deliveryBadgeText: { fontSize: 11, fontWeight: "600" },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  moreBtn: { marginTop: 4 },
  itemsSection: { marginBottom: 8 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "500",
  },
  moreItemsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  moreItemsText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  moreItemsTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  totalChevron: { marginLeft: 4 },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginRight: 8,
  },
  otpBoxes: { flexDirection: "row", gap: 4 },
  otpBox: {
    width: 24,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  otpDigit: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  sliderOnlyRow: { marginTop: 10 },
});
