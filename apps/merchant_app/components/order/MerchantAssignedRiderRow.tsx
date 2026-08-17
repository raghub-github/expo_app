import { useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord } from "@/hooks/useOrders";
import { callRider } from "@/lib/orderCardActions";
import {
  canTrackAssignedRider,
  orderHasAssignedRider,
} from "@/lib/orderAssignedRider";
import {
  formatMaskedRiderContact,
  resolveRiderCardVariant,
  riderDisplayName,
  riderStatusHeadline,
  riderStatusSubline,
} from "@/lib/riderMerchantArrivalDisplay";
import {
  FOOD_RIDER_FREE_WAIT_SECONDS,
  formatMmSs,
  freeWaitProgress,
  freeWaitRemainingSeconds,
  resolveRiderFreeWaitPhase,
} from "@/lib/riderFreeWait";
import { useLiveElapsedSeconds } from "@/hooks/useLiveElapsedSeconds";
import { useMerchantRiderLiveEnrichment } from "@/hooks/useMerchantRiderLiveEnrichment";
import { pinRiderTrackingOrder } from "@/lib/riderTrackingVisibility";
import { MerchantRiderTrackingSheet } from "@/components/order/MerchantRiderTrackingSheet";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  order: OrderRecord;
  showCall?: boolean;
  showTrack?: boolean;
  /** Inside a bordered detail card — skip top hairline divider. */
  embedded?: boolean;
  /** Order detail screen — tracking stays on even when not on the orders FlatList. */
  alwaysVisibleTracking?: boolean;
};

function parseOrdersFoodId(orderId: string): number | null {
  const n = parseInt(orderId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function MerchantAssignedRiderRow({
  order,
  showCall = true,
  showTrack = true,
  embedded = false,
  alwaysVisibleTracking = false,
}: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);

  const hasRider = orderHasAssignedRider(order);
  const enrichment = useMerchantRiderLiveEnrichment(order, storeId, token, hasRider, {
    alwaysVisible: alwaysVisibleTracking,
  });
  const variant = hasRider ? resolveRiderCardVariant(order) : "on_the_way";
  const freeWaitSeconds =
    order.riderFreeWaitSeconds != null && Number.isFinite(order.riderFreeWaitSeconds)
      ? Math.max(0, Math.floor(order.riderFreeWaitSeconds))
      : FOOD_RIDER_FREE_WAIT_SECONDS;
  const waitSeconds = useLiveElapsedSeconds(
    order.riderStoreWaitAnchorAt ?? order.reachedMerchantAt ?? order.riderReachedAt,
    hasRider && variant === "arrived" && order.riderStoreWaitLive === true
  );
  const elapsedForWait =
    variant === "arrived"
      ? order.riderStoreWaitLive
        ? waitSeconds
        : order.pickupWaitSeconds ?? waitSeconds
      : null;
  const waitPhase = resolveRiderFreeWaitPhase({
    arrived: variant === "arrived",
    live: order.riderStoreWaitLive === true,
    elapsedSeconds: elapsedForWait,
    freeWaitSeconds,
  });

  const remaining = freeWaitRemainingSeconds(elapsedForWait, freeWaitSeconds);
  const progress = freeWaitProgress(elapsedForWait, freeWaitSeconds);
  const pickupOtp = (order.pickupOtp ?? "").trim() || null;

  useEffect(() => {
    if (!trackingOpen) return;
    const foodId = parseOrdersFoodId(order.id);
    if (foodId == null) return;
    return pinRiderTrackingOrder(foodId);
  }, [trackingOpen, order.id]);

  if (!hasRider) return null;

  const riderName = enrichment.riderName;
  const deliveredRiderName = riderDisplayName(riderName);
  const headline = riderStatusHeadline(variant, riderName);
  const isTerminal =
    variant === "delivered" || variant === "cancelled" || variant === "rto";
  const showDeliveredRecord = variant === "delivered" && Boolean(deliveredRiderName);
  const subline = showDeliveredRecord
    ? null
    : variant === "arrived"
      ? waitPhase === "countdown"
        ? "Free wait time — hand over before it ends"
        : waitPhase === "waiting"
          ? "Rider waiting beyond free time"
          : "Waiting at your store for pickup"
      : riderStatusSubline(variant, riderName, enrichment.arrivalSubtitle, null);
  const mobile = (enrichment.riderMobile ?? order.riderMobile ?? "").trim() || null;
  const maskedContact = formatMaskedRiderContact(mobile);
  const isOutForDelivery = variant === "picked_up";
  const trackEnabled = showTrack && canTrackAssignedRider(order);
  // After delivery / cancel / RTO: show details only — no Call button.
  const showCallBtn = showCall && !!mobile && !isTerminal;
  const showArrivedMeta = variant === "arrived" && !isOutForDelivery;
  const showActions = !isOutForDelivery && !showArrivedMeta && !isTerminal && (trackEnabled || showCallBtn);

  const timerLabel = useMemo(() => {
    if (waitPhase === "countdown") return formatMmSs(remaining);
    if (waitPhase === "waiting" && elapsedForWait != null) {
      return formatMmSs(Math.max(0, elapsedForWait - freeWaitSeconds));
    }
    return null;
  }, [waitPhase, remaining, elapsedForWait, freeWaitSeconds]);

  return (
    <>
      <View
        style={[
          styles.wrap,
          isOutForDelivery && styles.wrapCompact,
          embedded && styles.wrapEmbedded,
        ]}
      >
        <View style={[styles.headerRow, isOutForDelivery && styles.headerRowCompact]}>
          <RiderSelfieAvatar
            selfieUrl={enrichment.riderSelfieUrl}
            riderName={riderName}
            size={isOutForDelivery ? 44 : 48}
            onPress={() => setSelfieModalOpen(true)}
          />

          <View style={[styles.body, isOutForDelivery && styles.bodyCompact]}>
            {!isOutForDelivery && !embedded ? (
              <Text style={styles.sectionLabel}>Delivery partner</Text>
            ) : null}
            {showDeliveredRecord ? (
              <>
                <View style={styles.deliveredMetaRow}>
                  <Text style={styles.deliveredName} numberOfLines={1}>
                    {deliveredRiderName}
                  </Text>
                  <Text style={styles.deliveredSep}> | </Text>
                  <Text style={styles.deliveredStatus} numberOfLines={1}>
                    Order delivered
                  </Text>
                </View>
                {maskedContact ? (
                  <Text style={styles.phoneLine} numberOfLines={1}>
                    {maskedContact}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text
                  style={[styles.headline, isOutForDelivery && styles.headlineCompact]}
                  numberOfLines={isOutForDelivery ? 1 : 2}
                >
                  {headline}
                </Text>
                {!isOutForDelivery && subline ? (
                  <Text
                    style={[
                      styles.subline,
                      waitPhase === "waiting" && styles.sublineUrgent,
                      isTerminal && styles.sublineTerminal,
                    ]}
                    numberOfLines={2}
                  >
                    {subline}
                  </Text>
                ) : null}
                {(isTerminal || isOutForDelivery) && maskedContact ? (
                  <Text style={styles.phoneLine} numberOfLines={1}>
                    {maskedContact}
                  </Text>
                ) : null}
              </>
            )}

            {showArrivedMeta ? (
              <View style={styles.metaRow}>
                {timerLabel ? (
                  <View
                    style={[
                      styles.timerPill,
                      waitPhase === "waiting" && styles.timerPillUrgent,
                    ]}
                  >
                    <Ionicons
                      name="stopwatch-outline"
                      size={13}
                      color={waitPhase === "waiting" ? "#C2410C" : "#9A3412"}
                    />
                    <Text
                      style={[
                        styles.timerText,
                        waitPhase === "waiting" && styles.timerTextUrgent,
                      ]}
                    >
                      {timerLabel}
                    </Text>
                    {waitPhase === "countdown" ? (
                      <View style={styles.timerTrack}>
                        <View
                          style={[
                            styles.timerFill,
                            { width: `${Math.round(progress * 100)}%` },
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {pickupOtp ? (
                  <View style={styles.otpPill}>
                    <Text style={styles.otpLabel}>OTP</Text>
                    <Text style={styles.otpCode}>{pickupOtp}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {showArrivedMeta && showCallBtn ? (
            <Pressable
              onPress={() => {
                if (mobile) void callRider(mobile);
              }}
              style={({ pressed }) => [styles.callIconBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Call ${riderName}`}
            >
              <Ionicons name="call" size={18} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          ) : null}

          {isOutForDelivery && showCallBtn ? (
            <Pressable
              onPress={() => {
                if (mobile) void callRider(mobile);
              }}
              style={({ pressed }) => [styles.callIconBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Call ${riderName}`}
            >
              <Ionicons name="call" size={18} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          ) : null}
        </View>

        {showActions ? (
          <View style={styles.actionsRow}>
            {trackEnabled ? (
              <Pressable
                onPress={() => setTrackingOpen(true)}
                style={({ pressed }) => [styles.trackBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Track ${riderName}`}
              >
                <Ionicons name="location-outline" size={15} color={GatiMitraMerchant.navy} />
                <Text style={styles.trackText}>Track live</Text>
              </Pressable>
            ) : null}
            {showCallBtn ? (
              <Pressable
                onPress={() => {
                  if (mobile) void callRider(mobile);
                }}
                disabled={!mobile}
                style={({ pressed }) => [
                  styles.callBtn,
                  trackEnabled ? undefined : styles.callBtnFull,
                  !mobile && styles.callBtnDisabled,
                  pressed && mobile && styles.pressed,
                ]}
                accessibilityLabel={`Call ${riderName}`}
              >
                <Ionicons name="call-outline" size={15} color={GatiMitraMerchant.textPrimary} />
                <Text style={styles.callText}>Call</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {showArrivedMeta && trackEnabled ? (
          <Pressable
            onPress={() => setTrackingOpen(true)}
            style={({ pressed }) => [styles.trackBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Track ${riderName}`}
          >
            <Ionicons name="location-outline" size={15} color={GatiMitraMerchant.navy} />
            <Text style={styles.trackText}>Track live</Text>
          </Pressable>
        ) : null}
      </View>

      {trackEnabled && token && storeId && !order.id.startsWith("core-") ? (
        <MerchantRiderTrackingSheet
          visible={trackingOpen}
          onClose={() => setTrackingOpen(false)}
          order={order}
          storeId={storeId}
          token={token}
          enrichment={enrichment}
        />
      ) : null}

      <RiderSelfieViewerModal
        visible={selfieModalOpen}
        imageUrl={enrichment.riderSelfieUrl}
        riderName={riderName}
        onClose={() => setSelfieModalOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  wrapEmbedded: {
    borderTopWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  wrapCompact: {
    paddingVertical: 10,
    gap: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerRowCompact: {
    alignItems: "center",
    gap: 10,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bodyCompact: {
    justifyContent: "center",
    gap: 0,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  headlineCompact: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  deliveredMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    minWidth: 0,
  },
  deliveredName: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  deliveredSep: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    lineHeight: 20,
  },
  deliveredStatus: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 20,
  },
  subline: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.primaryDark,
    lineHeight: 17,
  },
  sublineUrgent: {
    color: "#C2410C",
  },
  sublineTerminal: {
    color: GatiMitraMerchant.textSecondary,
    fontWeight: "600",
  },
  phoneLine: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  timerPill: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  timerPillUrgent: {
    backgroundColor: "#FFEDD5",
    borderColor: "#FB923C",
  },
  timerText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#9A3412",
    fontVariant: ["tabular-nums"],
  },
  timerTextUrgent: {
    color: "#C2410C",
  },
  timerTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(251,146,60,0.25)",
  },
  timerFill: {
    height: "100%",
    backgroundColor: "#F97316",
  },
  otpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  otpLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: GatiMitraMerchant.textTertiary,
    letterSpacing: 0.4,
  },
  otpCode: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  trackBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  trackText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
  },
  callBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  callBtnFull: {
    flex: 1,
  },
  callBtnDisabled: {
    opacity: 0.45,
  },
  callText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  callIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressed: { opacity: 0.88 },
});
