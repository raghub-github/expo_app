import { useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { OrderRecord, LineItem } from "@/hooks/useOrders";
import { useOrderSpeech } from "@/hooks/useOrderSpeech";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { MerchantOrderActionsSheet } from "@/components/order/MerchantOrderActionsSheet";
import { OrderCustomerBottomSheet } from "@/components/order/OrderCustomerBottomSheet";
import { OrderTimelineSheet } from "@/components/order/OrderTimelineSheet";
import { SlideToConfirm } from "@/components/order/SlideToConfirm";
import {
  formatOrderDateTime,
} from "@/components/order/orderFormatters";
import {
  acceptDeadlineMs,
  acceptSecondsLeft,
  formatAcceptCountdown,
} from "@/lib/orderAcceptanceWindow";

const URGENT_SECONDS = 60;
const STATUS_RED = "#EF4444";

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

export type NewOrderCardProps = {
  order: OrderRecord;
  nowMs: number;
  acceptanceWindowMinutes?: number;
  onAccept: () => void;
  onReject: () => void;
  onViewDetail: () => void;
  onItemPress: (item: LineItem) => void;
  actionLoading?: boolean;
};

export function NewOrderCard({
  order,
  nowMs,
  acceptanceWindowMinutes,
  onAccept,
  onReject,
  onViewDetail,
  onItemPress,
  actionLoading,
}: NewOrderCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const { speaking, speak } = useOrderSpeech();

  const timeSince = formatTimeSince(order.createdAt, nowMs);
  const acceptSecondsRemaining =
    acceptanceWindowMinutes != null
      ? acceptSecondsLeft(
          order.createdAt,
          acceptanceWindowMinutes,
          nowMs,
          order.merchantResponseDeadlineAt
        )
      : null;
  const countdown =
    acceptSecondsRemaining != null ? formatAcceptCountdown(acceptSecondsRemaining) : null;
  const urgent = (acceptSecondsRemaining ?? 0) > 0 && (acceptSecondsRemaining ?? 0) <= URGENT_SECONDS;
  const expired = (acceptSecondsRemaining ?? 1) <= 0;

  const fuseProgress = useMemo(() => {
    if (acceptanceWindowMinutes == null) return 1;
    const deadline = acceptDeadlineMs(
      order.createdAt,
      acceptanceWindowMinutes,
      order.merchantResponseDeadlineAt
    );
    const windowMs = deadline - new Date(order.createdAt).getTime();
    if (windowMs <= 0) return 0;
    const msLeft = Math.max(0, deadline - nowMs);
    return Math.min(1, msLeft / windowMs);
  }, [order.createdAt, acceptanceWindowMinutes, nowMs]);

  const placedAt = formatOrderDateTime(order.createdAt);

  const acceptLabel =
    countdown != null
      ? expired
        ? "Time expired"
        : `Swipe to accept · ${countdown}`
      : "Swipe to accept";

  return (
    <>
      <MerchantOrderCardLayout
        order={order}
        placedAt={placedAt}
        onViewDetail={onViewDetail}
        onItemPress={onItemPress}
        onCustomerPress={() => setCustomerOpen(true)}
        speakingActive={speaking}
        onSpeak={() => void speak(order)}
        onMenu={() => setMenuOpen(true)}
        showRider={false}
        outerBanner={
          <View style={styles.fuseTrack}>
            <View
              style={[
                styles.fuseFill,
                {
                  width: `${Math.max(0, Math.min(100, fuseProgress * 100))}%`,
                  backgroundColor: urgent ? STATUS_RED : GatiMitraMerchant.primary,
                },
              ]}
            />
          </View>
        }
        headerBelow={
          <View style={styles.newOrderRow}>
            <View style={styles.newChipRow}>
              <View style={[styles.newDot, urgent && styles.newDotUrgent]} />
              <Text style={[styles.newChipText, urgent && styles.newChipTextUrgent]}>
                New order
              </Text>
              <Text style={styles.timeSince}>· {timeSince}</Text>
            </View>
            {order.deliveryType === "SELF_PICKUP" ? (
              <Text style={styles.selfPickupChip}>Self-Pick-Up</Text>
            ) : null}
            {countdown != null ? (
              <Text style={[styles.acceptCountdown, urgent && styles.acceptCountdownUrgent]}>
                Accept in {countdown}
              </Text>
            ) : null}
          </View>
        }
        footer={
          <>
            <SlideToConfirm
              label={acceptLabel}
              onConfirmed={onAccept}
              disabled={expired || actionLoading}
              stage="created"
            />
            <Pressable
              onPress={onReject}
              disabled={actionLoading}
              style={({ pressed }) => [
                styles.rejectBtn,
                (pressed || actionLoading) && styles.pressed,
                actionLoading && styles.rejectBtnDisabled,
              ]}
            >
              <Ionicons name="close-circle-outline" size={16} color={STATUS_RED} />
              <Text style={styles.rejectBtnText}>Reject order</Text>
            </Pressable>
          </>
        }
      />

      <MerchantOrderActionsSheet
        visible={menuOpen}
        order={order}
        onClose={() => setMenuOpen(false)}
        onOpenTimeline={() => setTimelineOpen(true)}
        onOpenCustomer={() => setCustomerOpen(true)}
        onViewDetails={onViewDetail}
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
  fuseTrack: {
    height: 4,
    backgroundColor: "#E2E8F0",
    width: "100%",
  },
  fuseFill: {
    height: "100%",
  },
  newOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
  },
  newChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  newDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.primary,
  },
  newDotUrgent: {
    backgroundColor: STATUS_RED,
  },
  newChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: GatiMitraMerchant.primaryDark,
    letterSpacing: 0.2,
  },
  newChipTextUrgent: {
    color: STATUS_RED,
  },
  timeSince: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "500",
  },
  selfPickupChip: {
    fontSize: 11,
    fontWeight: "800",
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  acceptCountdown: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  acceptCountdownUrgent: {
    color: STATUS_RED,
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  rejectBtnDisabled: {
    opacity: 0.6,
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: STATUS_RED,
  },
  pressed: { opacity: 0.85 },
});
