import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { FoodSlideToReachStore } from "@/src/components/orders/FoodSlideToReachStore";
import { NavBottomSheetChevron } from "@/src/components/orders/NavBottomSheetChevron";
import { formatActiveOrderEarning } from "@/src/lib/active-order-display";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import type { NavigatePickupRouteMeta } from "@/src/components/orders/NavigatePickupBottomSheet";
import type { MilestoneGeoState } from "@/src/hooks/useMilestoneGeoFence";
import { resolveMilestoneGeoUi } from "@/src/lib/milestone-geo-hint";

export const FOOD_NAV_SHEET_HEIGHT = 468;
/** Collapsed: chevron + primary action only (map gets more space). */
export const FOOD_NAV_SHEET_COLLAPSED_HEIGHT = 132;

type Props = {
  order: RiderOrderSummary;
  orderIdLabel: string;
  phase: "pickup" | "drop";
  title: string;
  restaurantName: string;
  pickupAddress: string;
  pickupLandmark?: string;
  routeMeta: NavigatePickupRouteMeta;
  pickupConfirmed: boolean;
  rideStarted: boolean;
  atCustomer?: boolean;
  orderDelivered?: boolean;
  reachedLoading: boolean;
  deliveryPhotoLoading?: boolean;
  bottomInset: number;
  onReachStore: () => void;
  onMarkPickup: () => void;
  onReachCustomer: () => void;
  onDelivered: () => void;
  reachSliderDone?: boolean;
  onReportIssue: () => void;
  onCallRestaurant: () => void;
  callDisabled?: boolean;
  sheetExpanded?: boolean;
  onToggleSheetExpanded?: () => void;
  milestoneGeo?: Partial<Record<string, MilestoneGeoState>>;
};

function MetricBox({
  icon,
  value,
  label,
  loading,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: string;
  label: string;
  loading?: boolean;
}) {
  return (
    <View style={styles.metricBox}>
      <Ionicons name={icon} size={16} color={colors.gray[600]} />
      {loading ? (
        <ActivityIndicator size="small" color={colors.gray[500]} style={styles.metricLoader} />
      ) : (
        <Text style={styles.metricValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function FoodNavigateBottomSheet({
  order,
  orderIdLabel,
  phase,
  title,
  restaurantName,
  pickupAddress,
  pickupLandmark,
  routeMeta,
  pickupConfirmed,
  rideStarted,
  atCustomer = false,
  orderDelivered = false,
  reachedLoading,
  deliveryPhotoLoading = false,
  bottomInset,
  onReachStore,
  onMarkPickup,
  onReachCustomer,
  onDelivered,
  reachSliderDone = false,
  onReportIssue,
  onCallRestaurant,
  callDisabled,
  sheetExpanded = false,
  onToggleSheetExpanded,
  milestoneGeo,
}: Props) {
  const { t } = useTranslation();
  const earning = formatActiveOrderEarning(order);
  const [deliveryInfoOpen, setDeliveryInfoOpen] = useState(false);
  const orderValueLabel = earning || "—";

  useEffect(() => {
    if (phase !== "drop") setDeliveryInfoOpen(false);
  }, [phase]);

  const phaseBadge =
    phase === "drop"
      ? t("orders.activeFood.dropBadge", "DROP")
      : t("orders.activeFood.pickupBadge", "PICKUP");

  const merchantReady = order.merchantOrderReady === true;

  const showReachStore =
    phase === "pickup" && !pickupConfirmed && !rideStarted && !reachSliderDone;
  const showMarkPickup =
    phase === "pickup" &&
    !rideStarted &&
    merchantReady &&
    (pickupConfirmed || reachSliderDone);
  const showReachCustomer = phase === "drop" && rideStarted && !atCustomer && !orderDelivered;
  const showDelivered = phase === "drop" && atCustomer && !orderDelivered;

  const reachStoreGeo = resolveMilestoneGeoUi(milestoneGeo?.reach_store, "reach_store");
  const markPickupGeo = resolveMilestoneGeoUi(milestoneGeo?.mark_picked_up, "mark_picked_up");
  const reachCustomerGeo = resolveMilestoneGeoUi(
    milestoneGeo?.reach_customer,
    "reach_customer"
  );
  const markDeliveredGeo = resolveMilestoneGeoUi(
    milestoneGeo?.mark_delivered,
    "mark_delivered"
  );

  const fullAddress = [pickupAddress, pickupLandmark].filter(Boolean).join(", ");

  const atStore = pickupConfirmed || reachSliderDone;
  const showPrepBanner =
    phase === "pickup" && !rideStarted && (atStore || merchantReady);

  const actionButtons = (
    <>
      {showReachStore ? (
        <FoodSlideToReachStore
          label={t("orders.activeFood.slideReachStore", "Reach Store")}
          onComplete={onReachStore}
          disabled={reachSliderDone || pickupConfirmed}
          loading={reachedLoading && !pickupConfirmed}
          completed={pickupConfirmed}
          completedLabel={t("orders.activeFood.reachedStore", "Reached store ✓")}
          geoLocked={reachStoreGeo.locked}
          geoHint={reachStoreGeo.hintText}
        />
      ) : null}

      {showMarkPickup ? (
        <>
          {!merchantReady ? (
            <Text style={styles.waitReadyHint}>
              {t(
                "orders.activeFood.waitMerchantReady",
                "Wait for the restaurant to mark the order ready before pickup."
              )}
            </Text>
          ) : null}
          <FoodSlideToReachStore
            label={t("orders.activeFood.slideMarkPickup", "Mark Pickup")}
            onComplete={onMarkPickup}
            disabled={!merchantReady}
            completed={false}
            completedLabel={t("orders.activeFood.pickedUp", "Order picked up ✓")}
            geoLocked={markPickupGeo.locked}
            geoHint={markPickupGeo.hintText}
          />
        </>
      ) : null}

      {showReachCustomer ? (
        <FoodSlideToReachStore
          label={t("orders.activeFood.slideReachCustomer", "Reach Customer")}
          onComplete={onReachCustomer}
          loading={reachedLoading}
          completed={atCustomer}
          completedLabel={t("orders.activeFood.reachedCustomer", "Reached customer ✓")}
          geoLocked={reachCustomerGeo.locked}
          geoHint={reachCustomerGeo.hintText}
        />
      ) : null}

      {showDelivered ? (
        <FoodSlideToReachStore
          label={t("orders.activeFood.slideDelivered", "Delivered")}
          onComplete={onDelivered}
          loading={deliveryPhotoLoading}
          completed={orderDelivered}
          completedLabel={t("orders.activeFood.deliveredDone", "Delivered ✓")}
          geoLocked={markDeliveredGeo.locked}
          geoHint={markDeliveredGeo.hintText}
        />
      ) : null}

      {orderDelivered ? (
        <View style={styles.deliveredBanner}>
          <Ionicons name="checkmark-circle" size={22} color={colors.success[700]} />
          <Text style={styles.deliveredBannerText}>
            {t("orders.activeFood.orderDelivered", "Order delivered successfully")}
          </Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View
      style={[
        styles.sheet,
        { paddingBottom: bottomInset },
      ]}
    >
      <View style={styles.chevronDock}>
        {onToggleSheetExpanded ? (
          <NavBottomSheetChevron expanded={sheetExpanded} onPress={onToggleSheetExpanded} />
        ) : (
          <View style={styles.handle} />
        )}
      </View>

      {sheetExpanded ? (
        <>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.pickupBadge}>
            <Ionicons name="bag-handle" size={12} color={colors.success[700]} />
            <Text style={styles.pickupBadgeText}>{phaseBadge}</Text>
          </View>
          <Text style={styles.orderIdText} numberOfLines={1}>
            {t("orders.activeFood.orderId", "Order ID")} #{orderIdLabel}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {phase === "drop" ? (
            <Pressable
              onPress={() => setDeliveryInfoOpen((open) => !open)}
              style={({ pressed }) => [
                styles.infoBtn,
                deliveryInfoOpen && styles.infoBtnActive,
                pressed && styles.infoBtnPressed,
              ]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t(
                "orders.activeFood.deliveryPenaltyInfo",
                "Delivery penalty information"
              )}
            >
              <Ionicons
                name="information-circle"
                size={22}
                color={deliveryInfoOpen ? colors.primary[700] : colors.gray[600]}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onReportIssue}
            style={({ pressed }) => [styles.reportBtn, pressed && styles.reportBtnPressed]}
            hitSlop={6}
          >
            <View style={styles.reportBtnInner}>
              <Ionicons name="warning" size={14} color={colors.error[600]} />
              <Text style={styles.reportText} numberOfLines={1}>
                {t("orders.activeFood.reportIssue", "Report Issue")}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      {phase === "drop" && deliveryInfoOpen ? (
        <View style={styles.deliveryInfoCard}>
          <Ionicons name="alert-circle" size={20} color={colors.warning[700]} />
          <Text style={styles.deliveryInfoText}>
            {t(
              "orders.activeFood.deliveryPenaltyBody",
              "If you miss or cancel this delivery without valid approval, you may be fined up to the full order value ({{amount}}). Deliver only to the customer address shown on the map.",
              { amount: orderValueLabel }
            )}
          </Text>
        </View>
      ) : null}

      <Text style={styles.title}>{title}</Text>

      {showPrepBanner ? (
        <View
          style={[
            styles.prepBanner,
            merchantReady ? styles.prepBannerReady : styles.prepBannerPreparing,
          ]}
        >
          <Ionicons
            name={merchantReady ? "checkmark-circle" : "restaurant-outline"}
            size={18}
            color={merchantReady ? colors.success[700] : colors.warning[700]}
          />
          <Text
            style={[
              styles.prepBannerText,
              merchantReady ? styles.prepBannerTextReady : styles.prepBannerTextPreparing,
            ]}
          >
            {merchantReady
              ? t("orders.activeFood.orderIsReady", "Order is ready")
              : t(
                  "orders.activeFood.underPreparation",
                  "Order is under preparation"
                )}
          </Text>
        </View>
      ) : null}

      {routeMeta.error ? (
        <Pressable onPress={routeMeta.onRetryRoute} style={styles.routeError}>
          <Ionicons name="refresh-outline" size={14} color={colors.error[600]} />
          <Text style={styles.routeErrorText}>
            {t("orders.activeRide.routeFailed", "Route unavailable — retry")}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.metricsRow}>
          <MetricBox
            icon="time-outline"
            value={
              routeMeta.etaMinutes != null
                ? `${routeMeta.etaMinutes} min`
                : "—"
            }
            label={t("orders.activeRide.statEta", "ETA")}
            loading={routeMeta.loading}
          />
          <MetricBox
            icon="navigate-outline"
            value={
              routeMeta.distanceKm != null
                ? `${routeMeta.distanceKm >= 1 ? routeMeta.distanceKm.toFixed(1) : (routeMeta.distanceKm * 1000).toFixed(0)} ${routeMeta.distanceKm >= 1 ? "km" : "m"}`
                : "—"
            }
            label={t("orders.activeRide.statDistance", "Distance")}
            loading={routeMeta.loading}
          />
          <MetricBox
            icon="storefront-outline"
            value={restaurantName.length > 12 ? `${restaurantName.slice(0, 11)}…` : restaurantName}
            label={t("orders.activeFood.restaurant", "Restaurant")}
          />
          <MetricBox
            icon="wallet-outline"
            value={earning || "—"}
            label={t("orders.activeRide.statEarnings", "Est. earnings")}
          />
        </View>
      )}

      <View style={styles.pickupSection}>
        <View style={styles.pickupLeft}>
          <View style={styles.pickupIconWrap}>
            <Ionicons name="location" size={18} color={colors.success[600]} />
          </View>
          <View style={styles.pickupTextCol}>
            <Text style={styles.pickupLabel}>
              {phase === "drop"
                ? t("orders.activeFood.dropLocation", "DROP LOCATION")
                : t("orders.activeFood.pickupLocationLabel", "PICKUP LOCATION")}
            </Text>
            <Text style={styles.pickupName} numberOfLines={1}>
              {restaurantName}
            </Text>
            <Text style={styles.pickupAddress} numberOfLines={3}>
              {fullAddress}
            </Text>
          </View>
        </View>
        <View style={styles.pickupActions}>
          <Pressable
            onPress={onCallRestaurant}
            disabled={callDisabled}
            style={({ pressed }) => [
              styles.callBtn,
              callDisabled && styles.callBtnDisabled,
              pressed && !callDisabled && styles.callBtnPressed,
            ]}
          >
            <Ionicons name="call" size={20} color="#ffffff" />
          </Pressable>
          <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
        </View>
      </View>
        </>
      ) : (
        <View style={styles.collapsedHeader}>
          <View style={styles.pickupBadge}>
            <Ionicons name="bag-handle" size={12} color={colors.success[700]} />
            <Text style={styles.pickupBadgeText}>{phaseBadge}</Text>
          </View>
          <Text style={styles.collapsedTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}

      <View style={styles.actionsDock}>{actionButtons}</View>
    </View>
  );
}

const sheetShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  android: { elevation: 24 },
  default: {},
});

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingHorizontal: 16,
    paddingTop: 4,
    ...sheetShadow,
  },
  chevronDock: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
    paddingBottom: 6,
  },
  actionsDock: {
    paddingTop: 2,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.gray[300],
  },
  collapsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  collapsedTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[900],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  infoBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  infoBtnActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[200],
  },
  infoBtnPressed: {
    opacity: 0.85,
  },
  deliveryInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  deliveryInfoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.warning[900],
    lineHeight: 19,
  },
  pickupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.success[50],
    borderWidth: 1,
    borderColor: colors.success[200],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pickupBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success[700],
    letterSpacing: 0.6,
  },
  orderIdText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: colors.gray[600],
  },
  reportBtn: {
    flexShrink: 0,
    maxWidth: "42%",
  },
  reportBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 4,
  },
  reportBtnPressed: {
    opacity: 0.75,
  },
  reportText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.error[600],
    flexShrink: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  prepBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  prepBannerPreparing: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  prepBannerReady: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  prepBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  prepBannerTextPreparing: {
    color: colors.warning[800],
  },
  prepBannerTextReady: {
    color: colors.success[800],
  },
  otpEntryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary[600],
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  otpEntryBtnPressed: {
    opacity: 0.9,
  },
  otpEntryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
  waitReadyHint: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.warning[700],
    marginBottom: 10,
    lineHeight: 18,
  },
  deliveredBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.success[50],
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.success[200],
  },
  deliveredBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.success[800],
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 4,
    minHeight: 72,
    justifyContent: "center",
  },
  metricLoader: {
    marginVertical: 4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.gray[500],
    textAlign: "center",
  },
  routeError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  routeErrorText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.error[600],
  },
  pickupSection: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  pickupLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minWidth: 0,
  },
  pickupIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.success[50],
    alignItems: "center",
    justifyContent: "center",
  },
  pickupTextCol: {
    flex: 1,
    minWidth: 0,
  },
  pickupLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.gray[500],
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pickupName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 2,
  },
  pickupAddress: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.gray[600],
    lineHeight: 17,
  },
  pickupActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.success[500],
    alignItems: "center",
    justifyContent: "center",
  },
  callBtnDisabled: {
    backgroundColor: colors.gray[300],
  },
  callBtnPressed: {
    opacity: 0.9,
  },
});
