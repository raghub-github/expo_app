/**
 * Completed / rejected / RTO card for orders in the last 24 hours.
 * Shows printer (KOT), speak, and 3-dot menu — reference completed-card layout.
 */

import { useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { useMerchantPrintContext } from "@/hooks/useMerchantPrintContext";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { formatOrderDateTime } from "@/components/order/orderFormatters";
import { formatTerminalOrderFooter } from "@/lib/terminalOrderFooter";
import { printOrderKot } from "@/lib/orderCardActions";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  rejectedReason?: string | null;
  onPress: () => void;
  onItemPress?: (item: LineItem) => void;
};

function statusBadge(order: OrderRecord) {
  if (order.status === "rejected") {
    return { label: "REJECTED", bg: "#DC2626", color: "#FFFFFF", border: "#B91C1C" };
  }
  if (order.status === "rto") {
    return { label: "RTO", bg: "#EA580C", color: "#FFFFFF", border: "#C2410C" };
  }
  return { label: "DELIVERED", bg: "#22C55E", color: "#FFFFFF", border: "#16A34A" };
}

export function RecentCompletedOrderCard({
  order,
  storeName,
  onPress,
  onItemPress,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const { speaking, speak } = useOrderSpeech();
  const printContext = useMerchantPrintContext();

  const isTerminalRejected = order.status === "rejected" || order.status === "rto";
  const dateIso =
    isTerminalRejected && order.cancelledAt ? order.cancelledAt : order.createdAt;
  const placedAt = formatOrderDateTime(dateIso);
  const footerMeta = formatTerminalOrderFooter(order);
  const badge = statusBadge(order);

  const footer = useMemo(() => {
    if (!footerMeta) return null;
    return (
      <View style={styles.footerRow}>
        <Ionicons
          name="stopwatch-outline"
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
    );
  }, [footerMeta]);

  return (
    <>
      <MerchantOrderCardLayout
        order={order}
        storeName={storeName}
        placedAt={placedAt}
        onViewDetail={onPress}
        onItemPress={onItemPress}
        onCustomerPress={() => setCustomerOpen(true)}
        speakingActive={speaking}
        onSpeak={() => void speak(order)}
        onPrint={() => void printOrderKot(order, printContext)}
        onMenu={() => setMenuOpen(true)}
        showRider={false}
        detailsDefaultOpen={false}
        statusBadge={
          <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        }
        footer={footer}
      />

      <MerchantOrderActionsSheet
        visible={menuOpen}
        order={order}
        printContext={printContext}
        variant="compact"
        onClose={() => setMenuOpen(false)}
        onOpenTimeline={() => setTimelineOpen(true)}
        onOpenCustomer={() => setCustomerOpen(true)}
        onViewDetails={onPress}
      />

      <OrderTimelineSheet
        visible={timelineOpen}
        order={order}
        onClose={() => setTimelineOpen(false)}
      />

      <OrderCustomerBottomSheet
        visible={customerOpen}
        order={order}
        onClose={() => setCustomerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  footerText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  footerSuccess: { color: "#166534" },
  footerWarn: { color: "#CA8A04" },
});
