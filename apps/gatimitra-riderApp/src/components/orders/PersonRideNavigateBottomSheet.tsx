import React from "react";
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
import { mergeMilestoneGeoLocks, resolveMilestoneGeoUi } from "@/src/lib/milestone-geo-hint";
import {
  PersonRideFlowSteps,
  type PersonRideFlowStep,
} from "@/src/components/orders/PersonRideFlowSteps";

export const PERSON_RIDE_NAV_SHEET_HEIGHT = 448;
export const PERSON_RIDE_NAV_SHEET_COLLAPSED_HEIGHT = 132;

type Props = {
  order: RiderOrderSummary;
  tripId: string;
  phase: "pickup" | "drop";
  title: string;
  locationLabel: string;
  locationName: string;
  locationAddress: string;
  locationLandmark?: string;
  routeMeta: NavigatePickupRouteMeta;
  pickupConfirmed: boolean;
  pickupOtpVerified: boolean;
  rideStarted: boolean;
  atDrop: boolean;
  orderDelivered?: boolean;
  reachedLoading: boolean;
  cancelLoading: boolean;
  bottomInset: number;
  onReachPickup: () => void;
  onReachDrop: () => void;
  onCompleteRide: () => void;
  onEnterPickupOtp?: () => void;
  onStartRide?: () => void;
  startRideLoading?: boolean;
  completeRideLoading?: boolean;
  reachSliderDone?: boolean;
  onCancel: () => void;
  onCallCustomer: () => void;
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

export function PersonRideNavigateBottomSheet({
  order,
  tripId,
  phase,
  title,
  locationLabel,
  locationName,
  locationAddress,
  locationLandmark,
  routeMeta,
  pickupConfirmed,
  pickupOtpVerified,
  rideStarted,
  atDrop,
  orderDelivered,
  reachedLoading,
  cancelLoading,
  bottomInset,
  onReachPickup,
  onReachDrop,
  onCompleteRide,
  onEnterPickupOtp,
  onStartRide,
  startRideLoading = false,
  completeRideLoading = false,
  reachSliderDone = false,
  onCancel,
  onCallCustomer,
  callDisabled,
  sheetExpanded = false,
  onToggleSheetExpanded,
  milestoneGeo,
}: Props) {
  const { t } = useTranslation();
  const earning = formatActiveOrderEarning(order);
  const phaseBadge =
    phase === "drop"
      ? t("orders.activeRide.dropBadge", "DROP")
      : t("orders.activeRide.pickupBadge", "PICKUP");
  const fullAddress = [locationAddress, locationLandmark].filter(Boolean).join(", ");

  const showReachPickup =
    phase === "pickup" && !pickupOtpVerified && !rideStarted && !reachSliderDone;
  const showEnterPickupOtp =
    phase === "pickup" && reachSliderDone && !pickupOtpVerified && !!onEnterPickupOtp;
  const showStartRide =
    phase === "pickup" && pickupOtpVerified && !rideStarted && !!onStartRide;
  const showReachDrop = phase === "drop" && rideStarted && !atDrop && !orderDelivered;
  const showCompleteRide = phase === "drop" && atDrop && !orderDelivered;

  const flowStep: PersonRideFlowStep = orderDelivered
    ? "complete"
    : !reachSliderDone && !pickupOtpVerified
      ? "reach"
      : !pickupOtpVerified
        ? "otp"
        : !rideStarted
          ? "start"
          : "complete";

  const pickupOtpGeo = resolveMilestoneGeoUi(
    milestoneGeo?.pickup_confirmation,
    "pickup_confirmation"
  );
  /** Same radii as OTP — slider locked until all pickup milestones pass (e.g. 1 m test on pickup_confirmation). */
  const reachPickupGeo = mergeMilestoneGeoLocks(
    resolveMilestoneGeoUi(milestoneGeo?.reach_pickup, "reach_pickup"),
    pickupOtpGeo
  );
  const startRideGeo = resolveMilestoneGeoUi(milestoneGeo?.start_ride, "start_ride");
  const reachDropGeo = resolveMilestoneGeoUi(
    milestoneGeo?.reach_destination,
    "reach_destination"
  );
  const completeRideGeo = resolveMilestoneGeoUi(
    milestoneGeo?.complete_ride,
    "complete_ride"
  );

  const actionButtons = (
    <>
      {showReachPickup ? (
        <FoodSlideToReachStore
          label={t("orders.activeRide.slideReachPickup", "Reach pickup")}
          onComplete={onReachPickup}
          disabled={reachSliderDone || pickupOtpVerified}
          loading={reachedLoading && !reachSliderDone}
          completed={reachSliderDone || pickupOtpVerified}
          completedLabel={t("orders.activeRide.reachedDone", "Reached pickup ✓")}
          geoLocked={reachPickupGeo.locked}
          geoHint={reachPickupGeo.hintText}
        />
      ) : null}
      {showEnterPickupOtp && pickupOtpGeo.locked && pickupOtpGeo.hintText ? (
        <View style={styles.geoHintSlot}>
          <Text style={styles.geoHint} numberOfLines={3}>
            {pickupOtpGeo.hintText}
          </Text>
        </View>
      ) : null}
      {showEnterPickupOtp ? (
        <Pressable
          onPress={onEnterPickupOtp}
          disabled={pickupOtpGeo.locked}
          style={({ pressed }) => [
            styles.startOtpBtn,
            pressed && styles.startOtpBtnPressed,
            pickupOtpGeo.locked && styles.startOtpBtnDisabled,
          ]}
        >
          <Ionicons name="keypad-outline" size={20} color="#ffffff" />
          <Text style={styles.startOtpBtnText}>
            {t("orders.activeRide.submitPickupOtp", "Submit pickup OTP")}
          </Text>
        </Pressable>
      ) : null}
      {showStartRide ? (
        <FoodSlideToReachStore
          label={t("orders.activeRide.slideStartRide", "Start ride")}
          onComplete={onStartRide!}
          loading={startRideLoading}
          completed={false}
          completedLabel={t("orders.activeRide.rideStartedDone", "Ride started ✓")}
          geoLocked={startRideGeo.locked}
          geoHint={startRideGeo.hintText}
        />
      ) : null}
      {showReachDrop ? (
        <FoodSlideToReachStore
          label={t("orders.activeRide.slideReachDrop", "Reach drop location")}
          onComplete={onReachDrop}
          loading={reachedLoading}
          completed={atDrop}
          completedLabel={t("orders.activeRide.reachedDrop", "Reached drop ✓")}
          geoLocked={reachDropGeo.locked}
          geoHint={reachDropGeo.hintText}
        />
      ) : null}
      {showCompleteRide ? (
        <FoodSlideToReachStore
          label={t("orders.activeRide.slideCompleteRider", "Complete rider")}
          onComplete={onCompleteRide}
          loading={completeRideLoading}
          completed={orderDelivered}
          completedLabel={t("orders.activeRide.rideCompleted", "Ride completed ✓")}
          geoLocked={completeRideGeo.locked}
          geoHint={completeRideGeo.hintText}
        />
      ) : null}
      {orderDelivered ? (
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={22} color={colors.success[700]} />
          <Text style={styles.doneBannerText}>
            {t("orders.activeRide.rideCompletedBanner", "Ride completed successfully")}
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
              <View style={styles.phaseBadge}>
                <Ionicons
                  name={phase === "drop" ? "flag" : "person"}
                  size={12}
                  color={phase === "drop" ? colors.primary[700] : colors.success[700]}
                />
                <Text style={styles.phaseBadgeText}>{phaseBadge}</Text>
              </View>
              <Text style={styles.tripIdText} numberOfLines={1}>
                {t("orders.activeRide.tripIdLabel", "Trip")} #{tripId}
              </Text>
            </View>
            {phase === "pickup" && !rideStarted ? (
              <Pressable
                onPress={onCancel}
                disabled={cancelLoading}
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
                hitSlop={6}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color={colors.error[600]} />
                ) : (
                  <Text style={styles.cancelBtnText}>
                    {t("orders.activeRide.cancelShort", "Cancel")}
                  </Text>
                )}
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.title}>{title}</Text>

          <PersonRideFlowSteps activeStep={flowStep} orderDelivered={orderDelivered} />

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
                value={routeMeta.etaMinutes != null ? `${routeMeta.etaMinutes} min` : "—"}
                label={t("orders.activeRide.statEta", "ETA")}
                loading={routeMeta.loading}
              />
              <MetricBox
                icon="navigate-outline"
                value={
                  routeMeta.distanceKm != null
                    ? `${routeMeta.distanceKm.toFixed(1)} km`
                    : "—"
                }
                label={t("orders.activeRide.statDistance", "Distance")}
                loading={routeMeta.loading}
              />
              <MetricBox
                icon="person-outline"
                value={
                  locationName.length > 10
                    ? `${locationName.slice(0, 9)}…`
                    : locationName
                }
                label={
                  phase === "drop"
                    ? t("orders.activeRide.dropPassenger", "Passenger")
                    : t("orders.activeRide.pickupPassenger", "Pickup")
                }
              />
              <MetricBox
                icon="wallet-outline"
                value={earning || "—"}
                label={t("orders.activeRide.statEarnings", "Est. earnings")}
              />
            </View>
          )}

          <View style={styles.locationSection}>
            <View style={styles.locationLeft}>
              <View style={styles.locationIconWrap}>
                <Ionicons
                  name={phase === "drop" ? "flag" : "location"}
                  size={18}
                  color={phase === "drop" ? colors.primary[600] : colors.success[600]}
                />
              </View>
              <View style={styles.locationTextCol}>
                <Text style={styles.locationLabel}>{locationLabel}</Text>
                <Text style={styles.locationName} numberOfLines={1}>
                  {locationName}
                </Text>
                <Text style={styles.locationAddress} numberOfLines={3}>
                  {fullAddress}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onCallCustomer}
              disabled={callDisabled}
              style={({ pressed }) => [
                styles.callBtn,
                callDisabled && styles.callBtnDisabled,
                pressed && !callDisabled && styles.callBtnPressed,
              ]}
            >
              <Ionicons name="call" size={20} color="#ffffff" />
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.collapsedHeader}>
          <View style={styles.phaseBadge}>
            <Text style={styles.phaseBadgeText}>{phaseBadge}</Text>
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
    paddingTop: 6,
    paddingBottom: 10,
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
    marginBottom: 10,
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
  headerLeft: { flex: 1, minWidth: 0 },
  phaseBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.success[50],
    marginBottom: 4,
  },
  phaseBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.success[800],
    letterSpacing: 0.4,
  },
  tripIdText: { fontSize: 12, fontWeight: "600", color: colors.gray[500] },
  cancelBtn: {
    borderRadius: 10,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  cancelBtnPressed: { opacity: 0.85 },
  cancelBtnText: { fontSize: 12, fontWeight: "800", color: colors.error[600] },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 10,
  },
  routeError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.error[50],
    marginBottom: 10,
  },
  routeErrorText: { fontSize: 13, fontWeight: "600", color: colors.error[700] },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  metricValue: { fontSize: 13, fontWeight: "800", color: colors.gray[900] },
  metricLabel: { fontSize: 10, fontWeight: "600", color: colors.gray[500] },
  metricLoader: { marginVertical: 4 },
  locationSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  locationLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  locationTextCol: { flex: 1, minWidth: 0 },
  locationLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.gray[500],
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationName: { fontSize: 15, fontWeight: "700", color: colors.gray[900] },
  locationAddress: { fontSize: 13, color: colors.gray[600], marginTop: 2 },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
  },
  callBtnDisabled: { backgroundColor: colors.gray[300] },
  callBtnPressed: { opacity: 0.9 },
  doneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.success[50],
  },
  doneBannerText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.success[800] },
  startOtpBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.secondary[600],
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  startOtpBtnPressed: { opacity: 0.9 },
  startOtpBtnDisabled: { opacity: 0.5 },
  startOtpBtnText: { fontSize: 15, fontWeight: "800", color: "#ffffff" },
  actionsDock: {
    paddingTop: 2,
  },
  geoHintSlot: {
    minHeight: 40,
    justifyContent: "center",
    marginTop: 4,
  },
  geoHint: {
    fontSize: 13,
    color: colors.gray[600],
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
