/**
 * Terminal order card — Zomato partner history layout (white card variant).
 */

import { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { OrderRecord, OrderStage } from "@/hooks/useOrders";
import {
  formatOrderDateTime,
  formatOrderIdDisplay,
  splitRejectionMessage,
} from "@/components/order/orderFormatters";
import { CustomerStoreOrdinalPill } from "@/components/order/CustomerStoreOrdinalPill";
import { ItemVegMark } from "@/components/order/ItemVegMark";

const CARD_RADIUS = 12;
const CARD_PADDING = 14;

const REJECTED_BADGE_BG = "#DC2626";
const REJECTED_BADGE_TEXT = "#FFFFFF";
const REJECTED_BADGE_BORDER = "#B91C1C";
const REJECTED_PREFIX = "#E23744";
const DELIVERED_BADGE_BG = "#16A34A";
const DELIVERED_BADGE_TEXT = "#FFFFFF";
const DELIVERED_BADGE_BORDER = "#15803D";
const DELIVERED_PREFIX = "#15803D";
const RTO_BADGE_BG = "#EA580C";
const RTO_BADGE_TEXT = "#FFFFFF";
const RTO_BADGE_BORDER = "#C2410C";
const RTO_PREFIX = "#C2410C";

const DASH_COLOR = "#D1D5DB";
const TEXT_PRIMARY = "#1C1C1C";
const TEXT_SECONDARY = "#6B7280";
const TEXT_MUTED = "#9CA3AF";

type Props = {
  order: OrderRecord;
  formattedOrderId?: string | null;
  rejectedReason?: string | null;
  vegOnly?: boolean;
  onPress: () => void;
};

function DashedRule() {
  const dashes = 28;
  return (
    <View style={styles.dashedWrap} accessibilityRole="none">
      {Array.from({ length: dashes }).map((_, i) => (
        <View key={i} style={styles.dashSegment} />
      ))}
    </View>
  );
}

function StatusBadge({
  label,
  backgroundColor,
  color,
  borderColor,
}: {
  label: string;
  backgroundColor: string;
  color: string;
  borderColor: string;
}) {
  return (
    <View style={[styles.statusBadge, { backgroundColor, borderColor }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function VegOnlyBadge() {
  return (
    <View style={styles.vegBadge}>
      <View style={styles.vegDot} />
      <Text style={styles.vegBadgeText}>VEG ONLY</Text>
    </View>
  );
}

function statusMeta(status: OrderStage) {
  if (status === "rejected") {
    return {
      label: "REJECTED",
      badgeBg: REJECTED_BADGE_BG,
      badgeText: REJECTED_BADGE_TEXT,
      badgeBorder: REJECTED_BADGE_BORDER,
      prefixColor: REJECTED_PREFIX,
      kind: "rejected" as const,
    };
  }
  if (status === "rto") {
    return {
      label: "RTO",
      badgeBg: RTO_BADGE_BG,
      badgeText: RTO_BADGE_TEXT,
      badgeBorder: RTO_BADGE_BORDER,
      prefixColor: RTO_PREFIX,
      kind: "rto" as const,
    };
  }
  return {
    label: "DELIVERED",
    badgeBg: DELIVERED_BADGE_BG,
    badgeText: DELIVERED_BADGE_TEXT,
    badgeBorder: DELIVERED_BADGE_BORDER,
    prefixColor: DELIVERED_PREFIX,
    kind: "delivered" as const,
  };
}

function lineItemAmount(_qty: number, price: number): number {
  return price;
}

export function TerminalOrderCard({
  order,
  formattedOrderId,
  rejectedReason,
  vegOnly = false,
  onPress,
}: Props) {
  const meta = statusMeta(order.status);
  const numericFoodId = /^\d+$/.test(order.id) ? Number(order.id) : 0;
  const displayId = formatOrderIdDisplay(
    formattedOrderId ?? order.formattedOrderId,
    order.ordersCoreId,
    numericFoodId || undefined
  );
  const visibleItems = order.lineItems.slice(0, 2);
  const moreItemCount = order.lineItems.length - visibleItems.length;
  const customerLabel = (order.customerName ?? "").trim() || "Guest";
  const isTerminalRejected = order.status === "rejected" || order.status === "rto";
  const dateIso =
    isTerminalRejected && order.cancelledAt ? order.cancelledAt : order.createdAt;
  const placedLabel = formatOrderDateTime(dateIso);

  const onCopyId = useCallback(() => {
    if (Platform.OS === "android") Vibration.vibrate(12);
    void (async () => {
      try {
        const { setStringAsync } = await import("expo-clipboard");
        await setStringAsync(displayId);
      } catch {
        /* clipboard optional */
      }
    })();
  }, [displayId]);

  const rejection =
    meta.kind === "delivered"
      ? null
      : splitRejectionMessage(rejectedReason, meta.kind, order.cancelledByLabel);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <StatusBadge
            label={meta.label}
            backgroundColor={meta.badgeBg}
            color={meta.badgeText}
            borderColor={meta.badgeBorder}
          />
          {vegOnly ? <VegOnlyBadge /> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
      </View>

      <View style={styles.idRow}>
        <View style={styles.idLeft}>
          <Text style={styles.idText}>ID: {displayId}</Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onCopyId();
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.5 }]}
            accessibilityLabel="Copy order ID"
          >
            <Ionicons name="copy-outline" size={16} color={TEXT_MUTED} />
          </Pressable>
        </View>
        <Text style={styles.dateText}>{placedLabel}</Text>
      </View>

      <DashedRule />

      <View style={styles.orderedByRow}>
        <Text style={styles.orderedByLeft} numberOfLines={1}>
          Ordered by <Text style={styles.orderedByName}>{customerLabel}</Text>
        </Text>
        <CustomerStoreOrdinalPill
          ordinal={order.customerStoreOrderOrdinal}
          variant="inline"
        />
      </View>

      <DashedRule />

      {visibleItems.map((item, idx) => (
        <View key={`${order.id}-item-${idx}`} style={styles.itemRow}>
          <ItemVegMark vegNonveg={item.vegNonveg} name={item.name} size={14} />
          <Text style={styles.itemName} numberOfLines={2}>
            {item.qty} x {item.name}
          </Text>
          <Text style={styles.itemPrice}>
            ₹{lineItemAmount(item.qty, item.price).toLocaleString("en-IN")}
          </Text>
        </View>
      ))}
      {moreItemCount > 0 ? (
        <View style={styles.moreItemsRow}>
          <Text style={styles.moreItems}>
            +{moreItemCount} More
          </Text>
          <Text style={styles.moreItemsTotal}>
            ₹{order.total.toLocaleString("en-IN")}
          </Text>
        </View>
      ) : null}

      {meta.kind === "delivered" ? (
        <>
          <DashedRule />
          <Text style={[styles.reasonPrefix, { color: meta.prefixColor }]}>
            Order completed successfully
          </Text>
        </>
      ) : rejection ? (
        <>
          <DashedRule />
          <Text style={styles.reasonLine} numberOfLines={4}>
            <Text style={[styles.reasonPrefix, { color: meta.prefixColor }]}>
              {rejection.prefix}
              {rejection.detail ? " " : ""}
            </Text>
            {rejection.detail ? (
              <Text style={styles.reasonDetail}>{rejection.detail}</Text>
            ) : null}
          </Text>
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  pressed: {
    opacity: 0.94,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    flexWrap: "wrap",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  vegBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#2E7D32",
  },
  vegDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  vegBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#FFFFFF",
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 12,
  },
  idLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  idText: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    flexShrink: 1,
  },
  copyBtn: {
    padding: 2,
  },
  dateText: {
    fontSize: 13,
    fontWeight: "400",
    color: TEXT_SECONDARY,
    flexShrink: 0,
  },
  dashedWrap: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 12,
    gap: 5,
  },
  dashSegment: {
    width: 6,
    height: 1,
    backgroundColor: DASH_COLOR,
    borderRadius: 1,
  },
  orderedByRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  orderedByLeft: {
    flex: 1,
    fontSize: 13,
    fontWeight: "400",
    color: TEXT_SECONDARY,
    minWidth: 0,
  },
  orderedByName: {
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    lineHeight: 20,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    flexShrink: 0,
  },
  moreItemsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -6,
    marginBottom: 14,
    gap: 8,
  },
  moreItems: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_SECONDARY,
  },
  moreItemsTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  reasonLine: {
    fontSize: 13,
    lineHeight: 19,
  },
  reasonPrefix: {
    fontSize: 13,
    fontWeight: "600",
  },
  reasonDetail: {
    fontSize: 13,
    fontWeight: "400",
    color: TEXT_SECONDARY,
  },
});
