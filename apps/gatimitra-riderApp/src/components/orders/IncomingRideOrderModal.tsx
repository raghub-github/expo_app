import React, { memo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { resolveNavScreenBottomInset } from "@/src/hooks/useRiderBottomInset";
import {
  categoryBannerIcon,
  formatDistanceKm,
  formatOrderTypeLabel,
  incomingOrderAcceptLabel,
  incomingOrderBadgeLabel,
  incomingOrderBannerLabel,
} from "@/src/lib/incoming-order-display";
import { resolveRiderDisplayedEarning } from "@/src/lib/rider-earning-display";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { OrderLocationPhotoBox } from "@/src/components/orders/OrderLocationPhotoBox";
import { IncomingOfferAcceptFooter } from "@/src/components/orders/IncomingOfferAcceptFooter";
import { IncomingOfferFuseBadge } from "@/src/components/orders/IncomingOfferFuseBadge";

export type IncomingDispatchOrder = {
  id: string;
  category: RiderOrderSummary["category"];
  formattedOrderId?: string | null;
  rideType?: string;
  merchantName?: string | null;
  itemCount?: number;
  pickup: { address: string; lat: number; lng: number };
  delivery: { address: string; lat: number; lng: number };
  storeImageUrl?: string | null;
  dropAddressImageUrl?: string | null;
  distanceKm?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  estimatedEarning: number;
  baseEarning?: number;
  customerTipAmount?: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
  /** First-mile (pre-pickup) allowance the rider actually receives (v3.1). */
  prePickupEarning?: number;
  /** Portion of the first-mile funded by the company on top of the pool (v3.1). */
  prePickupCompanyFunded?: number;
  totalEarning?: number;
  higherDispatchPriority?: boolean;
  createdAt: string;
  acceptDeadlineAt?: string;
  offerShownAtMs?: number;
};

/** @deprecated use IncomingDispatchOrder */
export type IncomingRideOrder = IncomingDispatchOrder;

type Props = {
  visible: boolean;
  order: IncomingDispatchOrder | null;
  loading?: boolean;
  loadingLabel?: string | null;
  acceptSwipeResetKey?: number;
  onAccept: () => void;
  onReject: () => void;
  onExpired?: () => void;
};

const H_PADDING = 16;
const CARD_RADIUS = 16;
const BADGE_H = 42;
const BADGE_OVERLAP = BADGE_H * 0.2;

function compactAddress(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!out.some((p) => p.toLowerCase() === key)) out.push(part);
  }
  return out.join(", ");
}

function DistanceStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.distanceStat}>
      <Text style={styles.distanceStatLabel}>{label}</Text>
      <Text style={styles.distanceStatValue}>{value}</Text>
    </View>
  );
}

function formatRideTypeLabel(rideType?: string): string {
  return formatOrderTypeLabel(rideType) || "Ride";
}

function IncomingOrderModalInner({
  visible,
  order,
  loading = false,
  loadingLabel = null,
  acceptSwipeResetKey = 0,
  onAccept,
  onReject,
  onExpired,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!order) return null;

  const displayId = order.formattedOrderId?.trim() || order.id;
  const rideLabel = formatRideTypeLabel(order.rideType);
  const badgeLabel = incomingOrderBadgeLabel(order.category);
  const bannerLabel = incomingOrderBannerLabel(
    order.category,
    order.category === "ride" ? rideLabel : undefined
  );
  const acceptLabel = incomingOrderAcceptLabel(order.category);
  const bannerIcon = categoryBannerIcon(order.category);
  const isDeliveryOrder = order.category === "food" || order.category === "parcel";
  const slabBase = Math.round(order.baseEarning ?? order.estimatedEarning ?? 0);
  const waitingAmount =
    order.waitingEarning != null && order.waitingEarning > 0
      ? Math.round(order.waitingEarning)
      : 0;
  const surgeLines = order.appliedSurges ?? [];
  const tipAmount =
    order.customerTipAmount != null && order.customerTipAmount > 0
      ? Math.round(order.customerTipAmount)
      : 0;
  // v3.1: only the COMPANY-funded first-mile sits on top of the base pool; a
  // customer-funded first-mile is already carved inside baseEarning (the % pool).
  const firstMileOnTop =
    order.prePickupCompanyFunded != null && order.prePickupCompanyFunded > 0
      ? Math.round(order.prePickupCompanyFunded)
      : 0;
  const totalEarning = Math.round(resolveRiderDisplayedEarning(order));
  // Full-screen overlay covers the tab bar — only pad for the system nav / home indicator.
  const footerBottomInset = resolveNavScreenBottomInset(insets.bottom) + 2;
  const pickupKm = order.pickupDistanceKm;
  const tripKm = order.tripDistanceKm ?? order.distanceKm;
  const totalKm =
    pickupKm != null && tripKm != null
      ? pickupKm + tripKm
      : order.totalDistanceKm ?? tripKm ?? pickupKm;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.dismissArea} pointerEvents="none" />

        <View style={styles.sheetStack}>
          <View style={styles.sheetOverlapHeader} pointerEvents="box-none">
            <IncomingOfferFuseBadge order={order} visible={visible} label={badgeLabel} />
            <View style={styles.rejectAnchor} pointerEvents="box-none">
              <Pressable
                onPress={onReject}
                disabled={loading}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("orders.reject", "Reject")}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.rejectPill,
                      loading && styles.btnDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.rejectPillText} numberOfLines={1}>
                      {t("orders.reject", "Reject")}
                    </Text>
                    <Ionicons name="close" size={14} color="#EF4444" />
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.sheet}>
            <View style={styles.sheetTopCap} pointerEvents="none" />
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={styles.categoryBanner}>
                <Ionicons name={bannerIcon} size={14} color={colors.primary[700]} />
                <Text style={styles.categoryBannerText}>{bannerLabel}</Text>
              </View>

              <View style={styles.orderMetaRow}>
                <Text style={styles.orderId}>{displayId}</Text>
                <Text style={styles.orderTime}>
                  {t("orders.incoming.justNow", "Just now")}
                </Text>
              </View>

              {order.merchantName && order.category !== "ride" ? (
                <View style={styles.merchantRow}>
                  <Text style={styles.merchantName} numberOfLines={2}>
                    {order.merchantName}
                  </Text>
                  {order.itemCount != null && order.itemCount > 0 ? (
                    <View style={styles.itemCountPill}>
                      <Ionicons name="bag-handle-outline" size={12} color={colors.primary[800]} />
                      <Text style={styles.itemCountPillText}>
                        {order.itemCount}{" "}
                        {order.itemCount === 1
                          ? t("orders.incoming.itemOne", "item")
                          : t("orders.incoming.itemsShort", "items")}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.earningsCard}>
                <View style={styles.earningsBreakdown}>
                  <View style={styles.earningsLine}>
                    <Text style={styles.earningsSubLabel}>
                      {isDeliveryOrder
                        ? t("orders.incoming.deliveryFee", "Delivery fee")
                        : t("orders.incoming.baseEarning", "Base earnings")}
                    </Text>
                    <Text style={styles.earningsSubValue}>
                      ₹{slabBase.toLocaleString("en-IN")}
                    </Text>
                  </View>
                  {waitingAmount > 0 ? (
                    <View style={styles.earningsLine}>
                      <Text style={styles.earningsSubLabel}>
                        {t("orders.incoming.waitingCharge", "Waiting charge")}
                      </Text>
                      <Text style={styles.earningsSubValue}>
                        + ₹{waitingAmount.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : null}
                  {surgeLines.map((surge) => (
                    <View key={`${surge.name}-${surge.amount}`} style={styles.earningsLine}>
                      <View style={styles.tipLineLabel}>
                        <Ionicons name="flash-outline" size={13} color="#B45309" />
                        <Text style={styles.surgeLineText} numberOfLines={1}>
                          {surge.name}
                        </Text>
                      </View>
                      <Text style={styles.surgeLineValue}>
                        + ₹{Math.round(surge.amount).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ))}
                  {firstMileOnTop > 0 ? (
                    <View style={styles.earningsLine}>
                      <View style={styles.tipLineLabel}>
                        <Ionicons name="navigate-outline" size={13} color="#4F46E5" />
                        <Text style={styles.earningsSubLabel}>
                          {t("orders.incoming.firstMile", "First-mile allowance")}
                        </Text>
                      </View>
                      <Text style={styles.earningsSubValue}>
                        + ₹{firstMileOnTop.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : null}
                  {tipAmount > 0 ? (
                    <View style={styles.earningsLine}>
                      <View style={styles.tipLineLabel}>
                        <Ionicons name="gift-outline" size={13} color="#15803D" />
                        <Text style={styles.tipLineText}>
                          {t("orders.incoming.customerTip", "Customer tip")}
                        </Text>
                      </View>
                      <Text style={styles.tipLineValue}>
                        + ₹{tipAmount.toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.earningsDividerHorizontal} />
                  <View style={styles.earningsTotalRow}>
                    <Text style={styles.earningsLabel}>
                      {t("orders.incoming.totalEarning", "Total earnings")}
                    </Text>
                    <Text style={styles.earningsValue}>
                      ₹{totalEarning.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.distanceGrid}>
                <DistanceStat
                  label={t("orders.incoming.toPickup", "To pickup")}
                  value={formatDistanceKm(pickupKm)}
                />
                <View style={styles.distanceGridDivider} />
                <DistanceStat
                  label={t("orders.incoming.tripDistance", "Trip")}
                  value={formatDistanceKm(tripKm)}
                />
                <View style={styles.distanceGridDivider} />
                <DistanceStat
                  label={t("orders.incoming.totalDistance", "Overall")}
                  value={formatDistanceKm(totalKm)}
                />
              </View>

              <View style={styles.routeCard}>
                <View style={styles.routeRow}>
                  <View style={styles.routeDotCol}>
                    <View style={[styles.routeDot, styles.pickupDot]} />
                    <View style={styles.routeConnector} />
                  </View>
                  <View style={styles.routeTextWrap}>
                    <View style={styles.routeLabelRow}>
                      <Text style={styles.routeLabel}>
                        {t("orders.incoming.pickup", "Pickup")}
                      </Text>
                      {pickupKm != null && pickupKm > 0 ? (
                        <Text style={styles.routeKmChip}>{formatDistanceKm(pickupKm)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.routeAddress}>
                      {compactAddress(order.pickup.address)}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeRow}>
                  <View style={styles.routeDotCol}>
                    <View style={[styles.routeDot, styles.dropDot]} />
                  </View>
                  <View style={styles.routeTextWrap}>
                    <View style={styles.routeLabelRow}>
                      <Text style={styles.routeLabel}>
                        {t("orders.incoming.drop", "Drop")}
                      </Text>
                      {tripKm != null && tripKm > 0 ? (
                        <Text style={styles.routeKmChip}>{formatDistanceKm(tripKm)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.routeAddress}>
                      {compactAddress(order.delivery.address)}
                    </Text>
                  </View>
                  <OrderLocationPhotoBox
                    inline
                    uri={order.dropAddressImageUrl}
                    label={t("orders.activeFood.addressPhoto", "Address photo")}
                  />
                </View>
              </View>
            </ScrollView>

            <IncomingOfferAcceptFooter
              order={order}
              visible={visible}
              loading={loading}
              loadingLabel={loadingLabel}
              acceptLabel={acceptLabel}
              resetKey={acceptSwipeResetKey}
              paddingBottom={footerBottomInset}
              onAccept={onAccept}
              onExpired={onExpired}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const IncomingOrderModal = memo(IncomingOrderModalInner, (prev, next) => {
  if (
    prev.visible !== next.visible ||
    prev.loading !== next.loading ||
    prev.loadingLabel !== next.loadingLabel ||
    prev.acceptSwipeResetKey !== next.acceptSwipeResetKey ||
    prev.onAccept !== next.onAccept ||
    prev.onReject !== next.onReject ||
    prev.onExpired !== next.onExpired
  ) {
    return false;
  }
  const a = prev.order;
  const b = next.order;
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.acceptDeadlineAt === b.acceptDeadlineAt &&
    a.estimatedEarning === b.estimatedEarning &&
    a.totalEarning === b.totalEarning &&
    a.baseEarning === b.baseEarning &&
    a.customerTipAmount === b.customerTipAmount &&
    a.itemCount === b.itemCount &&
    a.merchantName === b.merchantName &&
    a.rideType === b.rideType &&
    a.pickup.address === b.pickup.address &&
    a.delivery.address === b.delivery.address &&
    a.storeImageUrl === b.storeImageUrl &&
    a.dropAddressImageUrl === b.dropAddressImageUrl &&
    a.offerShownAtMs === b.offerShownAtMs
  );
});

/** @deprecated use IncomingOrderModal */
export const IncomingRideOrderModal = IncomingOrderModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "flex-end",
    margin: 0,
    padding: 0,
  },
  dismissArea: { flex: 1 },
  sheetStack: {
    position: "relative",
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
    paddingBottom: 0,
    overflow: "visible",
  },
  /** Porter-style: pill + reject float above sheet top edge */
  sheetOverlapHeader: {
    position: "relative",
    alignSelf: "stretch",
    width: "100%",
    height: BADGE_H,
    marginBottom: -BADGE_OVERLAP,
    zIndex: 30,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 0,
    overflow: "visible",
    ...Platform.select({
      android: { elevation: 16 },
      default: {},
    }),
  },
  rejectAnchor: {
    position: "absolute",
    top: -10,
    right: H_PADDING,
    zIndex: 40,
    alignSelf: "flex-end",
    ...Platform.select({
      android: { elevation: 20 },
      default: {},
    }),
  },
  rejectPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  rejectPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
    flexShrink: 0,
    includeFontPadding: false,
  },
  sheet: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    maxHeight: "98%",
    paddingTop: BADGE_OVERLAP + 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  sheetTopCap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: BADGE_OVERLAP + 10,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CARD_RADIUS + 6,
    borderTopRightRadius: CARD_RADIUS + 6,
    zIndex: 1,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 2,
    paddingBottom: 10,
  },
  categoryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.primary[50],
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  categoryBannerText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary[800],
  },
  merchantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
    marginTop: -4,
  },
  merchantName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.gray[800],
    lineHeight: 19,
  },
  itemCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 1,
  },
  itemCountPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary[800],
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  orderId: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "Lora_700Bold",
    color: colors.gray[900],
    letterSpacing: -0.3,
  },
  orderTime: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray[500],
  },
  earningsCard: {
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  earningsBreakdown: {
    gap: 6,
  },
  earningsLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsSubLabel: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Poppins_600SemiBold",
    color: colors.gray[500],
  },
  earningsSubValue: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Poppins_700Bold",
    color: colors.gray[800],
  },
  tipLineLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tipLineText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#15803D",
  },
  tipLineValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803D",
  },
  surgeLineText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B45309",
    flexShrink: 1,
    maxWidth: 180,
  },
  surgeLineValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#B45309",
  },
  earningsDividerHorizontal: {
    height: 1,
    backgroundColor: colors.gray[200],
    marginVertical: 2,
  },
  earningsTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  earningsLabel: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Poppins_600SemiBold",
    color: colors.gray[600],
  },
  earningsValue: {
    fontSize: 22,
    fontWeight: "800",
    fontFamily: "Poppins_700Bold",
    color: colors.gray[900],
  },
  distanceGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  distanceStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  distanceStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  distanceStatValue: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.gray[900],
    marginTop: 4,
    textAlign: "center",
  },
  distanceGridDivider: {
    width: 1,
    backgroundColor: colors.gray[200],
    marginVertical: 2,
  },
  routeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 10,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  routeDotCol: {
    alignItems: "center",
    width: 12,
    paddingTop: 4,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pickupDot: { backgroundColor: colors.success[500] },
  dropDot: { backgroundColor: colors.error[500] },
  routeConnector: {
    width: 2,
    flex: 1,
    minHeight: 28,
    backgroundColor: colors.gray[200],
    marginVertical: 4,
  },
  routeTextWrap: { flex: 1, paddingBottom: 8 },
  routeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  routeKmChip: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary[700],
    backgroundColor: colors.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  routeAddress: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[800],
    marginTop: 3,
    lineHeight: 18,
  },
  btnDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
