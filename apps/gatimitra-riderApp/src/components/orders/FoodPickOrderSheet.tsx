import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TouchableOpacity,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useEffectivePickupTimerStart } from "@/src/hooks/useEffectivePickupTimerStart";
import { useLiveSecondTicker } from "@/src/hooks/useLiveSecondTicker";
import {
  foodPrepCountdownFromOrder,
  formatDurationHhMmSs,
  formatPrepDelayedLabel,
  isFoodPrepDelayed,
  prepOverdueSeconds,
} from "@/src/lib/food-prep-delay";
import {
  formatPickupCountdownMmSs,
  PICKUP_TIMER_BUDGET_SECONDS,
  resolvePickupCountdownSeconds,
  resolvePickupSheetTimerMode,
  resolvePickupWaitSeconds,
} from "@/src/lib/food-pickup-wait";
import { colors } from "@/src/theme";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

const PICK_CTA_GREEN = colors.success[500];

type SheetTone = "ready" | "preparing" | "delayed";

type Props = {
  visible: boolean;
  merchantReady: boolean;
  order: Pick<
    RiderOrderSummary,
    | "createdAt"
    | "prepReadyByAt"
    | "acceptedAt"
    | "preparingAt"
    | "preparationTimeMinutes"
    | "prepDelayMinutes"
    | "pickupWaitStartedAt"
    | "pickupWaitSeconds"
    | "pickupWaitFinalized"
    | "pickupTimerStartedAt"
    | "pickupTimerBudgetSeconds"
    | "preparedAt"
  >;
  orderIdLabel: string;
  customerName?: string | null;
  onDismiss: () => void;
  onConfirmPickup: () => void;
};

function toneForState(merchantReady: boolean, prepDelayed: boolean): SheetTone {
  if (prepDelayed) return "delayed";
  if (merchantReady) return "ready";
  return "preparing";
}

export function FoodPickOrderSheet({
  visible,
  merchantReady,
  order,
  orderIdLabel,
  customerName,
  onDismiss,
  onConfirmPickup,
}: Props) {
  const { t } = useTranslation();
  const { height, isShortHeight, layoutFontScale, insets, rs, rf, ri } =
    useResponsiveLayout();
  /** Display zoom / short viewport — shrink hero + gaps so CTA + order info stay on screen. */
  const compactMain =
    isShortHeight || layoutFontScale > 1.12 || height < 720;
  const denseMain = compactMain && (layoutFontScale > 1.2 || height < 640);
  const timerMode = useMemo(() => {
    const mode = resolvePickupSheetTimerMode(order, merchantReady);
    if (mode === "none" && merchantReady && order.pickupWaitStartedAt) {
      return "pickup";
    }
    return mode;
  }, [order, merchantReady]);

  const effectivePickupTimerStart = useEffectivePickupTimerStart(
    orderIdLabel,
    order,
    merchantReady,
    timerMode
  );

  const timerActive = timerMode !== "none" || visible;
  const nowMs = useLiveSecondTicker(timerActive);
  const ctaPulse = useRef(new Animated.Value(1)).current;

  const prepOrder = useMemo(() => foodPrepCountdownFromOrder(order), [order]);
  const prepDelayed = isFoodPrepDelayed(prepOrder, nowMs, merchantReady);
  const overdueSec = prepDelayed ? prepOverdueSeconds(prepOrder, nowMs) : 0;

  const pickupWaitSec = resolvePickupWaitSeconds(
    order.pickupWaitStartedAt,
    timerMode === "waiting" ? null : order.pickupWaitSeconds,
    nowMs
  );
  const pickupCountdownSec = resolvePickupCountdownSeconds(
    effectivePickupTimerStart,
    order.pickupTimerBudgetSeconds ?? PICKUP_TIMER_BUDGET_SECONDS,
    nowMs
  );
  const pickupCountdownDisplay = formatPickupCountdownMmSs(pickupCountdownSec);
  const pickupTimerOverdue =
    effectivePickupTimerStart != null && pickupCountdownSec <= 0;

  const tone = toneForState(merchantReady, prepDelayed);

  const displayCustomer =
    customerName?.trim() ||
    t("orders.activeFood.customerFallback", "Customer");

  // Edge-to-edge Android often reports a tiny inset — use rider fallback so CTA
  // never sits under the gesture / 3-button nav on any device.
  const systemBottom = resolveRiderBottomInset(insets.bottom);
  const bottomPad = systemBottom + rs(compactMain ? 10 : 12);
  const bodyMaxH = Math.round(
    height * (denseMain ? 0.78 : compactMain ? 0.74 : isShortHeight ? 0.72 : 0.68)
  );
  const heroSize = denseMain ? 64 : compactMain ? 76 : 104;
  const bagSize = denseMain ? 28 : compactMain ? 32 : 44;
  const heroBadge = denseMain ? 22 : compactMain ? 24 : 28;

  useEffect(() => {
    if (!visible || !merchantReady) {
      ctaPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1.02,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, merchantReady, ctaPulse]);

  const statusChip = (() => {
    if (tone === "delayed") {
      return {
        label: formatPrepDelayedLabel(overdueSec),
        icon: "hourglass-outline" as const,
        style: styles.chipDelayed,
        textStyle: styles.chipTextLight,
      };
    }
    if (tone === "ready") {
      return {
        label: t("orders.activeFood.pickOrderReadyChip", "Ready to pick"),
        icon: "checkmark-circle" as const,
        style: styles.chipReady,
        textStyle: styles.chipTextReady,
      };
    }
    return {
      label: t("orders.activeFood.pickOrderPreparingChip", "Under preparation"),
      icon: "restaurant-outline" as const,
      style: styles.chipPreparing,
      textStyle: styles.chipTextPreparing,
    };
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => undefined}
    >
      <View style={styles.root}>
        <View
          style={styles.backdrop}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

        <View
          style={[
            styles.sheet,
            {
              maxHeight: Math.round(height * 0.92),
            },
          ]}
        >
          <View
            style={[
              styles.accentBar,
              tone === "ready" && styles.accentBarReady,
              tone === "preparing" && styles.accentBarPreparing,
              tone === "delayed" && styles.accentBarDelayed,
            ]}
          />

          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <ResponsiveSheetBody
            maxHeight={bodyMaxH}
            contentContainerStyle={[
              styles.body,
              compactMain && styles.bodyCompact,
            ]}
            footerBottomInset={bottomPad}
            footerStyle={styles.footerSlot}
            footer={
              <Animated.View style={{ transform: [{ scale: merchantReady ? ctaPulse : 1 }] }}>
                <TouchableOpacity
                  activeOpacity={merchantReady ? 0.88 : 1}
                  onPress={onConfirmPickup}
                  disabled={!merchantReady}
                  style={[
                    styles.primaryBtn,
                    compactMain && styles.primaryBtnCompact,
                    merchantReady ? styles.primaryBtnEnabled : styles.primaryBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !merchantReady }}
                >
                  <Ionicons
                    name={merchantReady ? "bag-check" : "hourglass-outline"}
                    size={ri(compactMain ? 18 : 20)}
                    color={merchantReady ? "#ffffff" : "#80868B"}
                    style={rowLayout.noShrink}
                  />
                  <Text
                    style={[
                      styles.primaryBtnText,
                      { fontSize: rf(compactMain ? 15 : 17, { min: 13, max: 17 }) },
                      flexShrinkText,
                      !merchantReady && styles.primaryBtnTextDisabled,
                    ]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {merchantReady
                      ? t("orders.activeFood.okayPicking", "Okay, I'm picking!")
                      : t("orders.activeFood.waitingForReady", "Waiting for order ready…")}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            }
          >
            <View
              style={[
                rowLayout.rowStart,
                styles.headerRow,
                compactMain && styles.headerRowCompact,
              ]}
            >
              <View
                style={[
                  styles.headerTextCol,
                  compactMain && styles.headerTextColCompact,
                  rowLayout.grow,
                ]}
              >
                <Text
                  style={[
                    styles.title,
                    { fontSize: rf(compactMain ? 18 : 22, { min: 16, max: 22 }) },
                    flexShrinkText,
                  ]}
                  numberOfLines={2}
                >
                  {t("orders.activeFood.pickOrderTitle", "Pick order now!")}
                </Text>
                <View style={[styles.statusChip, statusChip.style, rowLayout.row]}>
                  <Ionicons name={statusChip.icon} size={13} color={statusChip.textStyle.color} />
                  <Text
                    style={[styles.statusChipText, statusChip.textStyle, flexShrinkText]}
                    numberOfLines={1}
                  >
                    {statusChip.label}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={onDismiss}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.closeBtn,
                  rowLayout.noShrink,
                  pressed && styles.closeBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("common.close", "Close")}
              >
                <Ionicons name="close" size={22} color="#5F6368" />
              </Pressable>
            </View>

            <View
              style={[
                styles.heroWrap,
                compactMain && styles.heroWrapCompact,
                denseMain && styles.heroWrapDense,
              ]}
            >
              <View
                style={[
                  styles.heroRing,
                  compactMain && styles.heroRingCompact,
                  tone === "ready" && styles.heroRingReady,
                  tone === "preparing" && styles.heroRingPreparing,
                  tone === "delayed" && styles.heroRingDelayed,
                ]}
              >
                <View
                  style={[
                    styles.heroCircle,
                    {
                      width: heroSize,
                      height: heroSize,
                      borderRadius: heroSize / 2,
                    },
                    tone === "ready" && styles.heroCircleReady,
                    tone === "preparing" && styles.heroCirclePreparing,
                    tone === "delayed" && styles.heroCircleDelayed,
                  ]}
                >
                  <Text style={[styles.bagEmoji, { fontSize: bagSize }]}>🛍️</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        width: heroBadge,
                        height: heroBadge,
                        borderRadius: heroBadge / 2,
                      },
                      merchantReady ? styles.statusBadgeReady : styles.statusBadgePreparing,
                    ]}
                  >
                    <Ionicons
                      name={merchantReady ? "checkmark" : "time-outline"}
                      size={denseMain ? 11 : compactMain ? 12 : 14}
                      color="#ffffff"
                    />
                  </View>
                </View>
              </View>

              {timerMode === "waiting" ? (
                <View style={[styles.timerCard, compactMain && styles.timerCardCompact]}>
                  <Text style={[styles.timerLabel, flexShrinkText]} numberOfLines={1}>
                    {t("orders.activeFood.pickupWaitLabel", "Wait time at store")}
                  </Text>
                  <View
                    style={[
                      styles.timerPill,
                      compactMain && styles.timerPillCompact,
                      prepDelayed ? styles.timerPillDelayed : styles.timerPillActive,
                    ]}
                  >
                    <Ionicons name="time-outline" size={14} color="#ffffff" />
                    <Text style={styles.timerText}>
                      {formatDurationHhMmSs(pickupWaitSec)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {timerMode === "pickup" ? (
                <View style={[styles.timerCard, compactMain && styles.timerCardCompact]}>
                  <Text style={[styles.timerLabel, flexShrinkText]} numberOfLines={1}>
                    {pickupTimerOverdue
                      ? t("orders.activeFood.pickupTimerOverdue", "Pickup time exceeded")
                      : t("orders.activeFood.pickupTimerLabel", "Pick up within")}
                  </Text>
                  <View
                    style={[
                      styles.timerPill,
                      compactMain && styles.timerPillCompact,
                      pickupTimerOverdue ? styles.timerPillDelayed : styles.timerPillPickup,
                    ]}
                  >
                    <Ionicons name="timer-outline" size={14} color="#ffffff" />
                    <Text
                      style={[
                        styles.timerTextPickup,
                        compactMain && styles.timerTextPickupCompact,
                      ]}
                    >
                      {pickupCountdownDisplay}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.messageCard,
                compactMain && styles.messageCardCompact,
                tone === "ready" && styles.messageCardReady,
                tone === "preparing" && styles.messageCardPreparing,
                tone === "delayed" && styles.messageCardDelayed,
              ]}
            >
              {merchantReady ? (
                <>
                  <Text
                    style={[
                      styles.statusHeadline,
                      compactMain && styles.statusHeadlineCompact,
                      flexShrinkText,
                    ]}
                    numberOfLines={2}
                  >
                    {t(
                      "orders.activeFood.merchantMarkedReady",
                      "Restaurant has marked food ready"
                    )}
                  </Text>
                  <Text
                    style={[
                      styles.statusSub,
                      compactMain && styles.statusSubCompact,
                      flexShrinkText,
                    ]}
                    numberOfLines={2}
                  >
                    {t("orders.activeFood.collectNow", "Please collect now!")}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.statusHeadline,
                      compactMain && styles.statusHeadlineCompact,
                      flexShrinkText,
                    ]}
                    numberOfLines={2}
                  >
                    {t(
                      "orders.activeFood.underPreparation",
                      "Order is under preparation"
                    )}
                  </Text>
                  <Text
                    style={[
                      styles.statusSub,
                      compactMain && styles.statusSubCompact,
                      flexShrinkText,
                    ]}
                    numberOfLines={denseMain ? 2 : 3}
                  >
                    {t(
                      "orders.activeFood.waitUntilReady",
                      "Please wait until the restaurant marks the order ready."
                    )}
                  </Text>
                </>
              )}
            </View>

            <View
              style={[
                rowLayout.row,
                styles.infoCard,
                compactMain && styles.infoCardCompact,
              ]}
            >
              <View style={[styles.infoBlock, rowLayout.grow]}>
                <Text style={styles.infoLabel}>
                  {t("orders.activeFood.orderIdCaps", "ORDER ID")}
                </Text>
                <View style={[rowLayout.row, styles.infoValueRow]}>
                  <Ionicons
                    name="receipt-outline"
                    size={compactMain ? 14 : 16}
                    color={colors.primary[600]}
                    style={rowLayout.noShrink}
                  />
                  <Text style={[styles.infoValueStrong, flexShrinkText]} numberOfLines={1}>
                    {orderIdLabel}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoDivider, compactMain && styles.infoDividerCompact]} />
              <View style={[styles.infoBlock, rowLayout.grow]}>
                <Text style={styles.infoLabel}>
                  {t("orders.activeFood.customerLabel", "Customer")}
                </Text>
                <View style={[rowLayout.row, styles.infoValueRow]}>
                  <Ionicons
                    name="person-outline"
                    size={compactMain ? 14 : 16}
                    color="#5F6368"
                    style={rowLayout.noShrink}
                  />
                  <Text style={[styles.infoValue, flexShrinkText]} numberOfLines={1}>
                    {displayCustomer}
                  </Text>
                </View>
              </View>
            </View>
          </ResponsiveSheetBody>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
    ...(Platform.OS === "android"
      ? { elevation: 24 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.14,
          shadowRadius: 16,
        }),
  },
  accentBar: {
    height: 4,
    width: "100%",
  },
  accentBarReady: {
    backgroundColor: colors.success[500],
  },
  accentBarPreparing: {
    backgroundColor: colors.warning[500],
  },
  accentBarDelayed: {
    backgroundColor: "#8B0000",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DADCE0",
  },
  body: {
    paddingTop: 4,
  },
  bodyCompact: {
    paddingTop: 0,
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "#ffffff",
  },
  headerRow: {
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
    maxWidth: "100%",
  },
  headerRowCompact: {
    marginBottom: 10,
    gap: 8,
  },
  headerTextCol: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  headerTextColCompact: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#202124",
    letterSpacing: -0.3,
  },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipReady: {
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
  },
  chipPreparing: {
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  chipDelayed: {
    backgroundColor: "#8B0000",
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  chipTextReady: {
    color: colors.success[700],
  },
  chipTextPreparing: {
    color: colors.warning[800],
  },
  chipTextLight: {
    color: "#ffffff",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  closeBtnPressed: {
    backgroundColor: "#F1F3F4",
  },
  heroWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  heroWrapCompact: {
    marginBottom: 8,
  },
  heroWrapDense: {
    marginBottom: 4,
  },
  heroRing: {
    padding: 6,
    borderRadius: 999,
    marginBottom: 4,
  },
  heroRingCompact: {
    padding: 3,
    marginBottom: 0,
  },
  heroRingReady: {
    backgroundColor: colors.success[100],
  },
  heroRingPreparing: {
    backgroundColor: colors.warning[100],
  },
  heroRingDelayed: {
    backgroundColor: "#FEE2E2",
  },
  heroCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  bagEmoji: {
    fontSize: 44,
  },
  statusBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  statusBadgeReady: {
    backgroundColor: PICK_CTA_GREEN,
  },
  statusBadgePreparing: {
    backgroundColor: colors.warning[500],
  },
  heroCircleReady: {
    backgroundColor: "#E8F4FD",
  },
  heroCirclePreparing: {
    backgroundColor: "#E8F4FD",
  },
  heroCircleDelayed: {
    backgroundColor: "#E8F4FD",
  },
  timerCard: {
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  timerCardCompact: {
    marginTop: 6,
    gap: 4,
  },
  timerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#80868B",
    letterSpacing: 0.2,
  },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    minWidth: 120,
    justifyContent: "center",
  },
  timerPillCompact: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 100,
  },
  timerPillActive: {
    backgroundColor: colors.secondary[600],
  },
  timerPillDelayed: {
    backgroundColor: "#8B0000",
  },
  timerPillPickup: {
    backgroundColor: colors.secondary[600],
  },
  timerText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  timerTextPickup: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.3,
  },
  timerTextPickupCompact: {
    fontSize: 18,
  },
  messageCard: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  messageCardCompact: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  messageCardReady: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  messageCardPreparing: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  messageCardDelayed: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  statusHeadline: {
    fontSize: 16,
    fontWeight: "700",
    color: "#202124",
    textAlign: "center",
    marginBottom: 4,
  },
  statusHeadlineCompact: {
    fontSize: 14,
    marginBottom: 2,
  },
  statusSub: {
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
    textAlign: "center",
    lineHeight: 19,
  },
  statusSubCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  infoCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EAED",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    maxWidth: "100%",
  },
  infoCardCompact: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  infoBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  infoDivider: {
    width: 1,
    backgroundColor: "#E8EAED",
    marginHorizontal: 12,
    flexShrink: 0,
  },
  infoDividerCompact: {
    marginHorizontal: 8,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9AA0A6",
    letterSpacing: 0.6,
  },
  infoValueRow: {
    gap: 6,
    maxWidth: "100%",
  },
  infoValueStrong: {
    fontSize: 15,
    fontWeight: "800",
    color: "#202124",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    minWidth: 0,
  },
  infoValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: "#3C4043",
  },
  primaryBtn: {
    width: "100%",
    minHeight: 54,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  primaryBtnCompact: {
    minHeight: 48,
    paddingVertical: 10,
    gap: 6,
  },
  primaryBtnEnabled: {
    backgroundColor: PICK_CTA_GREEN,
    ...(Platform.OS === "android"
      ? { elevation: 4 }
      : {
          shadowColor: colors.success[700],
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.28,
          shadowRadius: 8,
        }),
  },
  primaryBtnDisabled: {
    backgroundColor: "#F1F3F4",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  primaryBtnTextDisabled: {
    color: "#80868B",
  },
});
