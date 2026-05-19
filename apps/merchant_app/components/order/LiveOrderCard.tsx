import { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  PanResponder,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import type { OrderRecord, OrderStage, DeliveryType } from "@/hooks/useOrders";
import { TerminalOrderCard } from "@/components/order/TerminalOrderCard";
import { CustomerStoreOrdinalPill } from "@/components/order/CustomerStoreOrdinalPill";
import { ItemVegMark } from "@/components/order/ItemVegMark";

const STATUS_GREEN = "#22C55E";
const STATUS_RED = "#EF4444";

const SLIDER_STAGE_COLORS: Record<
  "created" | "preparing" | "ready" | "picked_up",
  { track: string; knob: string }
> = {
  created: { track: "#22C55E", knob: "#16A34A" },
  preparing: { track: "#CA8A04", knob: "#A16207" },
  ready: { track: "#0D9488", knob: "#0F766E" },
  picked_up: { track: "#7C3AED", knob: "#5B21B6" },
};
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_LABEL_TEXT = "#FFFFFF";

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
  let color = GatiMitraMerchant.textSecondary;
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

type SliderStage = "created" | "preparing" | "ready" | "picked_up";

function SlideToConfirm({
  label,
  onConfirmed,
  disabled,
  stage = "created",
}: {
  label: string;
  onConfirmed: () => void;
  disabled?: boolean;
  stage?: SliderStage;
}) {
  const trackWidth = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const colors = SLIDER_STAGE_COLORS[stage];

  useEffect(() => {
    if (disabled) {
      pulseOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.88,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, pulseOpacity]);

  const reset = useCallback(() => {
    confirmedRef.current = false;
    Animated.timing(translateX, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const handleConfirm = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    Vibration.vibrate(15);
    onConfirmed();
    setTimeout(reset, 260);
  }, [onConfirmed, reset]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled && Math.abs(gesture.dx) > 6,
      onPanResponderMove: (_, gesture) => {
        if (disabled) return;
        const max = Math.max(0, trackWidth.current - 46);
        const next = Math.min(max, Math.max(0, gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        if (disabled) {
          reset();
          return;
        }
        const max = Math.max(0, trackWidth.current - 46);
        const threshold = max * 0.7;
        if (gesture.dx >= threshold) {
          Animated.timing(translateX, {
            toValue: max,
            duration: 140,
            useNativeDriver: true,
          }).start(handleConfirm);
        } else {
          reset();
        }
      },
      onPanResponderTerminate: () => {
        reset();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.sliderTrack,
        !disabled && { backgroundColor: colors.track },
        disabled && styles.sliderTrackDisabled,
        !disabled && { opacity: pulseOpacity },
      ]}
      onLayout={(e) => {
        trackWidth.current = e.nativeEvent.layout.width;
      }}
    >
      <Text
        style={[styles.sliderLabel, disabled && styles.sliderLabelDisabled]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Animated.View
        style={[
          styles.sliderKnob,
          !disabled && { backgroundColor: colors.knob },
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

export function canMerchantMarkDelivered(order: OrderRecord): boolean {
  if (order.deliveryType === "GATIMITRA_RIDER") return false;
  return true;
}

function isTerminalStatus(status: OrderStage): boolean {
  return status === "rejected" || status === "rto" || status === "delivered";
}

export type LiveOrderCardProps = {
  order: OrderRecord;
  nowMs: number;
  onAccept: () => void;
  onReject: () => void;
  onAdvance: () => void;
  onViewDetail: () => void;
};

export function LiveOrderCard({
  order,
  nowMs,
  onAccept,
  onReject,
  onAdvance,
  onViewDetail,
}: LiveOrderCardProps) {
  if (isTerminalStatus(order.status)) {
    return (
      <TerminalOrderCard
        order={order}
        formattedOrderId={order.formattedOrderId}
        rejectedReason={order.rejectedReason}
        onPress={onViewDetail}
      />
    );
  }

  const timeSince = formatTimeSince(order.createdAt, nowMs);
  const timer = formatTimerSince(order.createdAt, nowMs);

  const showPickupOtp =
    (order.status === "ready" || order.status === "picked_up") && !!order.pickupOtp;
  const showRtoOtp = order.status === "rto" && !!order.rtoOtp;

  const primaryActionLabel = (() => {
    switch (order.status) {
      case "created":
        return `ACCEPT ORDER ${timer}`;
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
          <Text style={styles.orderIdText}>
            {order.formattedOrderId ?? order.orderNumber}{" "}
            <Text style={styles.dotSeparator}>•</Text> {order.displayTime}
          </Text>
          <View style={styles.customerNameRow}>
            <Text style={styles.customerName} numberOfLines={1}>
              {order.customerName}
            </Text>
            <CustomerStoreOrdinalPill
              ordinal={order.customerStoreOrderOrdinal}
              variant="inline"
            />
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
        {order.lineItems.slice(0, 2).map((item, idx) => (
          <View key={`${order.id}-${idx}`} style={styles.itemRow}>
            <ItemVegMark vegNonveg={item.vegNonveg} name={item.name} size={14} />
            <Text style={styles.itemText} numberOfLines={1}>
              {item.qty} x {item.name}
            </Text>
            <Text style={styles.itemPrice}>₹ {item.price}</Text>
          </View>
        ))}
        {order.lineItems.length > 2 && (
          <View style={styles.moreItemsRow}>
            <Text style={styles.moreItemsText}>
              +{order.lineItems.length - 2} More
            </Text>
            <Text style={styles.moreItemsTotal}>
              ₹{order.total.toLocaleString("en-IN")}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total bill: </Text>
        <Text style={styles.totalAmount}>₹ {order.total}</Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={GatiMitraMerchant.textTertiary}
          style={styles.totalChevron}
        />
      </View>

      {showPickupOtp && order.pickupOtp && (
        <OtpPill label="Pickup OTP" code={order.pickupOtp} />
      )}
      {showRtoOtp && order.rtoOtp && (
        <OtpPill label="RTO OTP" code={order.rtoOtp} />
      )}

      {order.status === "created" ? (
        <View style={styles.createdActionsRow}>
          <View style={styles.createdAcceptWrap}>
            <SlideToConfirm
              label={primaryActionLabel}
              onConfirmed={onAccept}
              disabled={false}
              stage="created"
            />
          </View>
          <Pressable
            onPress={onReject}
            style={({ pressed }) => [
              styles.rejectBtn,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </Pressable>
        </View>
      ) : primaryActionLabel ? (
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
  cardHeaderLeft: { flexShrink: 1, paddingRight: 8 },
  cardHeaderRight: { alignItems: "flex-end", gap: 6 },
  orderIdText: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  dotSeparator: {
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "400",
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
  createdActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  createdAcceptWrap: { flex: 0.7 },
  rejectBtn: {
    flex: 0.3,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STATUS_RED,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: STATUS_RED,
  },
  sliderOnlyRow: { marginTop: 10 },
  sliderTrack: {
    height: 44,
    borderRadius: 999,
    justifyContent: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  sliderTrackDisabled: { backgroundColor: SLIDER_DISABLED_BG },
  sliderLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: SLIDER_LABEL_TEXT,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  sliderLabelDisabled: { opacity: 0.8 },
  sliderKnob: {
    width: 40,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
