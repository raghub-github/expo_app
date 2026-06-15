import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { FoodSlideToReachStore } from "@/src/components/orders/FoodSlideToReachStore";
import { NavBottomSheetChevron } from "@/src/components/orders/NavBottomSheetChevron";
import {
  formatNavSheetDistance,
  NAV_SHEET_CALL_BLUE,
  NAV_SHEET_MAP_BTN_BG,
} from "@/src/components/orders/nav-sheet-ui";
import { PartnerChatUnreadBadge } from "@/src/components/orders/PartnerChatUnreadBadge";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import type { NavigatePickupRouteMeta } from "@/src/components/orders/NavigatePickupBottomSheet";
import type { MilestoneGeoState } from "@/src/hooks/useMilestoneGeoFence";
import { mergeMilestoneGeoLocks, resolveMilestoneGeoUi } from "@/src/lib/milestone-geo-hint";
import {
  PersonRideFlowSteps,
  type PersonRideFlowStep,
} from "@/src/components/orders/PersonRideFlowSteps";

export const PERSON_RIDE_NAV_SHEET_HEIGHT = 368;
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
  onStartRide?: () => void;
  startRideLoading?: boolean;
  completeRideLoading?: boolean;
  reachSliderDone?: boolean;
  startRideSliderKey?: number;
  waitTimerLabel?: string | null;
  otpSheetOpen?: boolean;
  onCancel: () => void;
  onCallCustomer: () => void;
  onChatCustomer?: () => void;
  onOpenMaps: () => void;
  onGoHome?: () => void;
  callDisabled?: boolean;
  chatDisabled?: boolean;
  chatUnreadCount?: number;
  sheetExpanded?: boolean;
  onToggleSheetExpanded?: () => void;
  milestoneGeo?: Partial<Record<string, MilestoneGeoState>>;
};

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
  onStartRide,
  startRideLoading = false,
  completeRideLoading = false,
  reachSliderDone = false,
  startRideSliderKey = 0,
  waitTimerLabel = null,
  otpSheetOpen = false,
  onCancel,
  onCallCustomer,
  onChatCustomer,
  onOpenMaps,
  onGoHome,
  callDisabled,
  chatDisabled,
  chatUnreadCount = 0,
  sheetExpanded = true,
  onToggleSheetExpanded,
  milestoneGeo,
}: Props) {
  const { t } = useTranslation();
  const distanceLabel = routeMeta.loading
    ? "…"
    : formatNavSheetDistance(routeMeta.metersAway);
  const fullAddress = [locationAddress, locationLandmark].filter(Boolean).join(", ");
  const showCancel = phase === "pickup" && !rideStarted;

  const showReachPickup =
    phase === "pickup" && !pickupOtpVerified && !rideStarted && !reachSliderDone;
  const showStartRide =
    phase === "pickup" && reachSliderDone && !pickupOtpVerified && !rideStarted && !!onStartRide;
  const showPickupWaitTimer =
    phase === "pickup" && reachSliderDone && !pickupOtpVerified && !rideStarted && !!waitTimerLabel;
  const showReachDrop = phase === "drop" && rideStarted && !atDrop && !orderDelivered;
  const showCompleteRide = phase === "drop" && atDrop && !orderDelivered;

  const flowStep: PersonRideFlowStep = orderDelivered
    ? "complete"
    : !reachSliderDone
      ? "reach"
      : otpSheetOpen
        ? "otp"
        : !pickupOtpVerified || !rideStarted
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
      {showPickupWaitTimer ? (
        <View style={styles.waitTimerRow}>
          <Ionicons name="time-outline" size={18} color={colors.secondary[700]} />
          <Text style={styles.waitTimerText}>{waitTimerLabel}</Text>
        </View>
      ) : null}
      {showStartRide ? (
        <FoodSlideToReachStore
          key={`start-ride-${startRideSliderKey}`}
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
        <>
          <View style={styles.doneBanner}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success[700]} />
            <Text style={styles.doneBannerText}>
              {t("orders.activeRide.rideCompletedBanner", "Ride completed successfully")}
            </Text>
          </View>
          {onGoHome ? (
            <Pressable
              onPress={onGoHome}
              style={({ pressed }) => [styles.goHomeBtn, pressed && styles.goHomeBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t("orders.deliverySuccess.goToHome", "Go to Home")}
            >
              <Ionicons name="grid-outline" size={20} color="#ffffff" />
              <Text style={styles.goHomeBtnText}>
                {t("orders.deliverySuccess.goToHome", "Go to Home")}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#ffffff" />
            </Pressable>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 12) }]}>
      <View style={styles.sheetHandleDock}>
        {onToggleSheetExpanded ? (
          <NavBottomSheetChevron expanded={sheetExpanded} onPress={onToggleSheetExpanded} />
        ) : (
          <View style={styles.chevronDock}>
            <View style={styles.handle} />
          </View>
        )}
      </View>

      {sheetExpanded ? (
        <View style={styles.sheetBody}>
        <View style={styles.detailsBody}>
          <View style={styles.customerHeaderRow}>
            <View style={styles.customerInfoCol}>
              <Text style={styles.locationName} numberOfLines={2}>
                {locationName}
              </Text>
              <Text style={styles.locationAddress} numberOfLines={2}>
                {fullAddress}
              </Text>
            </View>
            <View style={styles.metaTopCol}>
              {showCancel ? (
                <Pressable
                  onPress={onCancel}
                  disabled={cancelLoading}
                  style={({ pressed }) => [
                    styles.cancelTopBtn,
                    pressed && styles.cancelTopBtnPressed,
                  ]}
                  hitSlop={6}
                >
                  {cancelLoading ? (
                    <ActivityIndicator size="small" color={colors.error[600]} />
                  ) : (
                    <Text style={styles.cancelTopBtnText}>
                      {t("orders.activeRide.cancelShort", "Cancel")}
                    </Text>
                  )}
                </Pressable>
              ) : null}
              <Text style={styles.distanceLabel}>{distanceLabel}</Text>
            </View>
          </View>

          <View style={styles.tripleActionRow}>
            <RideNavActionButton
              icon="call"
              label={t("orders.activeFood.call", "Call")}
              onPress={onCallCustomer}
              disabled={callDisabled}
            />
            <RideNavActionButton
              icon="chatbubble-ellipses"
              label={t("orders.activeRide.chat", "Chat")}
              onPress={onChatCustomer ?? (() => {})}
              disabled={chatDisabled || !onChatCustomer}
              unreadCount={chatUnreadCount}
            />
            <RideNavActionButton
              icon="navigate"
              label={t("orders.activeFood.goToMap", "Go to Map")}
              onPress={onOpenMaps}
              variant="filled"
            />
          </View>

          <PersonRideFlowSteps activeStep={flowStep} orderDelivered={orderDelivered} />

        </View>
        </View>
      ) : (
        <View style={styles.sheetBody}>
        <View style={styles.collapsedHeader}>
          <Text style={styles.collapsedTitle} numberOfLines={1}>
            {locationName}
          </Text>
          <Text style={styles.collapsedDistance}>{distanceLabel}</Text>
        </View>
        </View>
      )}

      <View style={styles.sheetBody}>
        <View style={styles.actionsDock}>{actionButtons}</View>
      </View>
    </View>
  );
}

function RideNavActionButton({
  icon,
  label,
  onPress,
  disabled,
  variant = "outline",
  unreadCount = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "outline" | "filled";
  unreadCount?: number;
}) {
  const filled = variant === "filled";
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionIconBtn,
        filled ? styles.actionIconBtnFilled : styles.actionIconBtnOutline,
        disabled && styles.actionIconBtnDisabled,
      ]}
    >
      <View style={styles.actionIconInner}>
        <Ionicons
          name={icon}
          size={22}
          color={filled ? "#ffffff" : disabled ? "#9AA0A6" : NAV_SHEET_CALL_BLUE}
        />
        <PartnerChatUnreadBadge count={unreadCount} style={styles.actionUnreadBadge} />
      </View>
      <Text
        style={[
          styles.actionIconBtnText,
          filled ? styles.actionIconBtnTextFilled : styles.actionIconBtnTextOutline,
          disabled && styles.actionIconBtnTextDisabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
    width: "100%",
    alignSelf: "stretch",
    alignItems: "stretch",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 0,
    zIndex: 50,
    elevation: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8EAED",
    ...sheetShadow,
  },
  sheetHandleDock: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "center",
  },
  sheetBody: {
    width: "100%",
    paddingHorizontal: 12,
    marginTop: -8,
  },
  customerHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  customerInfoCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  metaTopCol: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  cancelTopBtn: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  cancelTopBtnPressed: { opacity: 0.75 },
  cancelTopBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.error[600],
  },
  distanceLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#202124",
    letterSpacing: -0.2,
  },
  tripleActionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 10,
  },
  actionIconBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 9,
  },
  actionIconInner: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  actionUnreadBadge: {
    position: "absolute",
    top: -4,
    right: -6,
  },
  actionIconBtnOutline: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: NAV_SHEET_CALL_BLUE,
  },
  actionIconBtnFilled: {
    backgroundColor: NAV_SHEET_MAP_BTN_BG,
    borderWidth: 0,
  },
  actionIconBtnDisabled: {
    opacity: 0.55,
  },
  actionIconBtnText: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "600",
  },
  actionIconBtnTextOutline: {
    color: NAV_SHEET_CALL_BLUE,
  },
  actionIconBtnTextFilled: {
    color: "#ffffff",
  },
  actionIconBtnTextDisabled: {
    color: "#9AA0A6",
  },
  callMapRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  callBtn: {
    flex: 1,
    height: 48,
    marginRight: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#DADCE0",
    borderRadius: 8,
  },
  callBtnDisabled: {
    opacity: 0.55,
  },
  callBtnText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "600",
    color: NAV_SHEET_CALL_BLUE,
  },
  callBtnTextDisabled: {
    color: "#9AA0A6",
  },
  mapBtn: {
    flex: 1,
    height: 48,
    marginLeft: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NAV_SHEET_MAP_BTN_BG,
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  mapBtnText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    flexShrink: 1,
  },
  detailsBody: {
    width: "100%",
    paddingBottom: 0,
  },
  chevronDock: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
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
    marginHorizontal: 8,
  },
  collapsedDistance: {
    fontSize: 14,
    fontWeight: "700",
    color: "#202124",
    flexShrink: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  headerLeft: { flex: 1, minWidth: 0 },
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
  locationName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#202124",
    marginBottom: 2,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  locationAddress: {
    fontSize: 13,
    fontWeight: "400",
    color: "#5F6368",
    lineHeight: 18,
  },
  doneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.success[50],
  },
  doneBannerText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.success[800] },
  goHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#15803d",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  goHomeBtnPressed: { opacity: 0.92 },
  goHomeBtnText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  waitTimerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.secondary[50],
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.secondary[200],
  },
  waitTimerText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.secondary[800],
  },
  actionsDock: {
    width: "100%",
    paddingTop: 4,
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
