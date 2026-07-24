/**
 * Terminal / past-order card — light history layout (white bg).
 * Matches Partner Site order-history card: badges, ID+copy, store, customer, item+total.
 * No speaker / 3-dot toolbar. Navigation via onPress only (logic unchanged).
 */

import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { OrderRecord, OrderStage } from "@/hooks/useOrders";
import {
  formatOrderDateTime,
  formatOrderIdDisplay,
  splitRejectionMessage,
} from "@/components/order/orderFormatters";
import { formatMerchantRs } from "@/lib/merchant-line-total";
import { formatTerminalOrderFooter } from "@/lib/terminalOrderFooter";

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  rejectedReason?: string | null;
  vegOnly?: boolean;
  onPress: () => void;
};

function statusMeta(status: OrderStage) {
  if (status === "rejected") {
    return {
      label: "REJECTED",
      badgeBg: "#FEE2E2",
      badgeText: "#B91C1C",
      badgeBorder: "#FECACA",
      prefixColor: "#DC2626",
      kind: "rejected" as const,
    };
  }
  if (status === "rto") {
    return {
      label: "RTO",
      badgeBg: "#FFEDD5",
      badgeText: "#C2410C",
      badgeBorder: "#FED7AA",
      prefixColor: "#EA580C",
      kind: "rto" as const,
    };
  }
  return {
    label: "DELIVERED",
    badgeBg: "#22C55E",
    badgeText: "#052E16",
    badgeBorder: "#16A34A",
    prefixColor: GatiMitraMerchant.statusCompleted,
    kind: "delivered" as const,
  };
}

export function TerminalOrderCard({
  order,
  storeName,
  rejectedReason,
  vegOnly = false,
  onPress,
}: Props) {
  const [copied, setCopied] = useState(false);
  const meta = statusMeta(order.status);
  const isTerminalRejected = order.status === "rejected" || order.status === "rto";
  const dateIso =
    isTerminalRejected && order.cancelledAt ? order.cancelledAt : order.createdAt;
  const placedAt = formatOrderDateTime(dateIso);
  const footerMeta = formatTerminalOrderFooter(order);

  const idDisplay = useMemo(
    () => formatOrderIdDisplay(order.formattedOrderId, order.ordersCoreId).replace(/^#?/i, ""),
    [order.formattedOrderId, order.ordersCoreId]
  );

  const firstItem = order.lineItems[0] ?? null;
  const moreCount = Math.max(0, order.lineItems.length - 1);

  const rejection =
    meta.kind === "delivered"
      ? null
      : splitRejectionMessage(
          rejectedReason,
          meta.kind,
          order.cancelledByLabel,
          order.cancelledByType
        );

  const onCopyId = async () => {
    if (!idDisplay) return;
    await Clipboard.setStringAsync(idDisplay);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const storeLine = [storeName?.trim()].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Open order details"
    >
      {/* Status badges + chevron */}
      <View style={styles.topRow}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              { backgroundColor: meta.badgeBg, borderColor: meta.badgeBorder },
            ]}
          >
            <Text style={[styles.badgeText, { color: meta.badgeText }]}>{meta.label}</Text>
          </View>
          {vegOnly ? (
            <View style={styles.vegBadge}>
              <Ionicons name="leaf" size={11} color="#166534" />
              <Text style={styles.vegText}>VEG ONLY</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>

      {/* ID + copy | datetime */}
      <View style={styles.idRow}>
        <View style={styles.idLeft}>
          <Text style={styles.idText} numberOfLines={1}>
            ID: {idDisplay || "—"}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              void onCopyId();
            }}
            hitSlop={10}
            style={styles.copyBtn}
            accessibilityRole="button"
            accessibilityLabel="Copy order ID"
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={15}
              color={copied ? "#16A34A" : "#6B7280"}
            />
          </Pressable>
        </View>
        <Text style={styles.placedAt} numberOfLines={1}>
          {placedAt}
        </Text>
      </View>

      {storeLine ? (
        <Text style={styles.storeName} numberOfLines={1}>
          {storeLine}
        </Text>
      ) : null}

      <View style={styles.dashLine} />

      <Text style={styles.orderedBy} numberOfLines={1}>
        Ordered by {order.customerName || "Guest"}
      </Text>

      <View style={styles.solidLine} />

      {/* First item + total */}
      <View style={styles.itemRow}>
        <View style={styles.itemLeft}>
          {firstItem ? (
            <>
              <Text style={styles.itemName} numberOfLines={2}>
                {firstItem.qty} x {firstItem.name}
              </Text>
              {moreCount > 0 ? (
                <Text style={styles.moreItems}>
                  +{moreCount} more {moreCount === 1 ? "item" : "items"}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.itemName}>—</Text>
          )}
        </View>
        <Text style={styles.total}>{formatMerchantRs(order.total)}</Text>
      </View>

      {/* Optional footer (delay / rejection) */}
      {footerMeta ? (
        <View style={styles.footerRow}>
          <Ionicons
            name="time-outline"
            size={14}
            color={footerMeta.tone === "success" ? "#166534" : "#CA8A04"}
          />
          <Text
            style={[
              styles.footerText,
              footerMeta.tone === "success" ? styles.footerSuccess : styles.footerWarn,
            ]}
            numberOfLines={2}
          >
            {footerMeta.text}
          </Text>
        </View>
      ) : rejection ? (
        <Text style={styles.rejectionText} numberOfLines={3}>
          <Text style={{ color: meta.prefixColor, fontWeight: "700" }}>
            {rejection.detail && !rejection.prefix.endsWith(":")
              ? `${rejection.prefix} - ${rejection.detail}`
              : rejection.prefix}
            {rejection.detail && rejection.prefix.endsWith(":") ? " " : ""}
          </Text>
          {rejection.detail && rejection.prefix.endsWith(":") ? rejection.detail : null}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  pressed: { opacity: 0.92 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, flex: 1 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  vegBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  vegText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#166534",
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  idLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  idText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flexShrink: 1,
  },
  copyBtn: { padding: 2 },
  placedAt: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    flexShrink: 0,
  },
  storeName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 10,
  },
  dashLine: {
    borderStyle: "dashed",
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "#D1D5DB",
    marginBottom: 10,
  },
  orderedBy: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 10,
  },
  solidLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  itemLeft: { flex: 1, minWidth: 0 },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  moreItems: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  total: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  footerText: { flex: 1, fontSize: 12, fontWeight: "600" },
  footerSuccess: { color: "#166534" },
  footerWarn: { color: "#CA8A04" },
  rejectionText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 17,
  },
});
