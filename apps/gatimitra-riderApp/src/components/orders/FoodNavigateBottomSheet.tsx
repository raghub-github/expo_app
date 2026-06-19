// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { FoodSlideToReachStore } from "@/src/components/orders/FoodSlideToReachStore";
import { NavBottomSheetChevron } from "@/src/components/orders/NavBottomSheetChevron";
import { PartnerChatUnreadBadge } from "@/src/components/orders/PartnerChatUnreadBadge";
import {
  formatNavSheetDistance,
  NAV_SHEET_CALL_BLUE,
  NAV_SHEET_DROP_MAP_BTN_BG,
  NAV_SHEET_MAP_BTN_BG,
  NAV_SHEET_PHASE_BADGE_DROP_BG,
} from "@/src/components/orders/nav-sheet-ui";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import type { NavigatePickupRouteMeta } from "@/src/components/orders/NavigatePickupBottomSheet";
import type { MilestoneGeoState } from "@/src/hooks/useMilestoneGeoFence";
import { resolveMilestoneGeoUi } from "@/src/lib/milestone-geo-hint";
import { useLiveSecondTicker } from "@/src/hooks/useLiveSecondTicker";
import {
  foodPrepCountdownFromOrder,
  formatPrepDelayedLabel,
  isFoodPrepDelayed,
  prepOverdueSeconds,
} from "@/src/lib/food-prep-delay";

export const FOOD_NAV_SHEET_HEIGHT = 368;
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
  /** Photo already captured + uploaded — slide reopens OTP, not camera. */
  deliveryPhotoReady?: boolean;
  bottomInset: number;
  onReachStore: () => void;
  onMarkPickup: () => void;
  onReachCustomer: () => void;
  onDelivered: () => void;
  reachSliderDone?: boolean;
  /** Hide mark-pickup slider while the pick-order modal is open. */
  hideMarkPickupWhilePickSheet?: boolean;
  /** At-store prep/ready banner lives on the pick-order sheet instead. */
  hidePrepBanner?: boolean;
  /** Rider dismissed pick-order sheet — show reopen row. */
  showPickOrderReopen?: boolean;
  onOpenPickOrderSheet?: () => void;
  onReportIssue: () => void;
  onCallRestaurant: () => void;
  onCallCustomer?: () => void;
  onChatCustomer?: () => void;
  onOpenMaps: () => void;
  onCancel?: () => void;
  cancelLoading?: boolean;
  callDisabled?: boolean;
  chatDisabled?: boolean;
  chatUnreadCount?: number;
  sheetExpanded?: boolean;
  onToggleSheetExpanded?: () => void;
  milestoneGeo?: Partial<Record<string, MilestoneGeoState>>;
  /** Drop-order full screen owns the deliver slider while open. */
  suppressDropDeliverSlider?: boolean;
};

function ActionIconButton({
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

export function FoodNavigateBottomSheet({
  order,
  orderIdLabel,
  phase,
  restaurantName,
  pickupAddress,
  pickupLandmark,
  pickupConfirmed,
  rideStarted,
  atCustomer = false,
  orderDelivered = false,
  reachedLoading,
  deliveryPhotoLoading = false,
  deliveryPhotoReady = false,
  bottomInset,
  onReachStore,
  onMarkPickup,
  onReachCustomer,
  onDelivered,
  reachSliderDone = false,
  hideMarkPickupWhilePickSheet = false,
  hidePrepBanner = false,
  showPickOrderReopen = false,
  onOpenPickOrderSheet,
  onCallRestaurant,
  onCallCustomer,
  onChatCustomer,
  onOpenMaps,
  onCancel,
  cancelLoading = false,
  callDisabled,
  chatDisabled,
  chatUnreadCount = 0,
  sheetExpanded = true,
  onToggleSheetExpanded,
  milestoneGeo,
  routeMeta,
  suppressDropDeliverSlider = false,
}: Props) {
  const { t } = useTranslation();
  const nowMs = useLiveSecondTicker(phase === "pickup" && !rideStarted);
  const [deliveryInfoOpen, setDeliveryInfoOpen] = useState(false);

  useEffect(() => {
    if (phase !== "drop") setDeliveryInfoOpen(false);
  }, [phase]);

  const distanceLabel = routeMeta.loading
    ? "…"
    : formatNavSheetDistance(routeMeta.metersAway);

  const merchantReady = order.merchantOrderReady === true;
  const prepOrder = foodPrepCountdownFromOrder(order);
  const prepDelayed = isFoodPrepDelayed(prepOrder, nowMs, merchantReady);
  const overdueSec = prepDelayed ? prepOverdueSeconds(prepOrder, nowMs) : 0;
  const showCancel = !orderDelivered && !!onCancel;

  const showReachStore =
    phase === "pickup" && !pickupConfirmed && !rideStarted && !reachSliderDone;
  const showMarkPickup =
    phase === "pickup" &&
    !rideStarted &&
    !hideMarkPickupWhilePickSheet &&
    (pickupConfirmed || reachSliderDone);
  const showReachCustomer = phase === "drop" && rideStarted && !atCustomer && !orderDelivered;
  const showDelivered =
    phase === "drop" && atCustomer && !orderDelivered && !suppressDropDeliverSlider;

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
    !hidePrepBanner &&
    phase === "pickup" &&
    !rideStarted &&
    !showReachStore &&
    (atStore || merchantReady);

  const dropSliders = (
    <>
      {showReachCustomer ? (
        <FoodSlideToReachStore
          label={t("orders.activeFood.slideReachedDrop", "Reached drop")}
          onComplete={onReachCustomer}
          loading={reachedLoading}
          completed={atCustomer}
          completedLabel={t("orders.activeFood.reachedDrop", "Reached drop ✓")}
          geoLocked={reachCustomerGeo.locked}
          geoHint={reachCustomerGeo.hintText}
        />
      ) : null}

      {showDelivered ? (
        <FoodSlideToReachStore
          label={
            deliveryPhotoReady
              ? t("orders.activeFood.slideEnterDeliveryOtp", "Enter delivery OTP")
              : t("orders.activeFood.slideDelivered", "Delivered")
          }
          onComplete={onDelivered}
          loading={deliveryPhotoLoading}
          completed={orderDelivered}
          completedLabel={t("orders.activeFood.deliveredDone", "Delivered ✓")}
          geoLocked={markDeliveredGeo.locked}
          geoHint={markDeliveredGeo.hintText}
        />
      ) : null}
    </>
  );

  const pickupActionButtons = (
    <>
      {showReachStore ? (
        <FoodSlideToReachStore
          label={t("orders.activeFood.slideReachedPickup", "Reached pickup")}
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
          {phase === "drop" ? (
            <>
              <View style={styles.dropHeaderRow}>
                <View style={styles.dropBadge}>
                  <Text style={styles.dropBadgeText}>
                    {t("orders.activeFood.dropBadge", "DROP")}
                  </Text>
                </View>
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
              </View>

              <Text style={styles.locationName} numberOfLines={2}>
                {restaurantName}
              </Text>
              <Text
                style={[styles.locationAddress, styles.locationAddressLast]}
                numberOfLines={3}
              >
                {fullAddress}
              </Text>
              <Text style={styles.orderIdLine}>
                <Text style={styles.orderIdPrefix}>
                  {t("orders.activeFood.orderPrefix", "Order")}:{" "}
                </Text>
                <Text style={styles.orderIdValue}>{orderIdLabel}</Text>
              </Text>

              <View style={styles.tripleActionRow}>
                <ActionIconButton
                  icon="call"
                  label={t("orders.activeFood.call", "Call")}
                  onPress={onCallCustomer ?? onCallRestaurant}
                  disabled={callDisabled}
                />
                <ActionIconButton
                  icon="chatbubble-ellipses"
                  label={t("orders.activeRide.chat", "Chat")}
                  onPress={onChatCustomer ?? onReportIssue}
                  disabled={chatDisabled}
                  unreadCount={chatUnreadCount}
                />
                <ActionIconButton
                  icon="navigate"
                  label={t("orders.activeFood.map", "Map")}
                  onPress={onOpenMaps}
                  variant="filled"
                />
              </View>

              <View style={styles.dropSliderDock}>{dropSliders}</View>
            </>
          ) : (
            <>
              <View style={styles.customerHeaderRow}>
                <View style={styles.customerInfoCol}>
                  <Text style={styles.locationName} numberOfLines={2}>
                    {restaurantName}
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

              <View style={styles.callMapRow}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={onCallRestaurant}
                  disabled={callDisabled}
                  style={[styles.callBtn, callDisabled && styles.callBtnDisabled]}
                >
                  <Ionicons
                    name="call"
                    size={20}
                    color={callDisabled ? "#9AA0A6" : NAV_SHEET_CALL_BLUE}
                  />
                  <Text
                    style={[styles.callBtnText, callDisabled && styles.callBtnTextDisabled]}
                  >
                    {t("orders.activeFood.call", "Call")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={onOpenMaps}
                  style={styles.mapBtn}
                >
                  <Ionicons name="navigate" size={18} color="#ffffff" />
                  <Text style={styles.mapBtnText} numberOfLines={1} adjustsFontSizeToFit>
                    {t("orders.activeFood.goToMap", "Go to Map")}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {phase === "pickup" && prepDelayed ? (
            <View style={styles.delayBanner}>
              <Ionicons name="hourglass-outline" size={14} color="#ffffff" />
              <Text style={styles.delayBannerText}>{formatPrepDelayedLabel(overdueSec)}</Text>
            </View>
          ) : null}

          {phase === "pickup" && showPickOrderReopen && onOpenPickOrderSheet ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onOpenPickOrderSheet}
              style={[
                styles.pickOrderReopen,
                merchantReady ? styles.pickOrderReopenReady : styles.pickOrderReopenPreparing,
              ]}
            >
              <Ionicons
                name={merchantReady ? "checkmark-circle-outline" : "restaurant-outline"}
                size={20}
                color={merchantReady ? colors.success[700] : colors.warning[700]}
              />
              <View style={styles.pickOrderReopenTextCol}>
                <Text style={styles.pickOrderReopenTitle}>
                  {t("orders.activeFood.pickOrderTitle", "Pick order now!")}
                </Text>
                <Text style={styles.pickOrderReopenSub} numberOfLines={1}>
                  {prepDelayed
                    ? formatPrepDelayedLabel(overdueSec)
                    : merchantReady
                      ? t("orders.activeFood.tapToPickOrder", "Tap to verify and pick up the order")
                      : t("orders.activeFood.underPreparation", "Order is under preparation")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#5F6368" />
            </TouchableOpacity>
          ) : null}

          {phase === "pickup" && showPrepBanner ? (
            <View
              style={[
                styles.prepBanner,
                prepDelayed
                  ? styles.prepBannerDelayed
                  : merchantReady
                    ? styles.prepBannerReady
                    : styles.prepBannerPreparing,
              ]}
            >
              <Ionicons
                name={
                  prepDelayed
                    ? "hourglass-outline"
                    : merchantReady
                      ? "checkmark-circle"
                      : "restaurant-outline"
                }
                size={16}
                color={
                  prepDelayed ? "#ffffff" : merchantReady ? colors.success[700] : colors.warning[700]
                }
              />
              <Text
                style={[
                  styles.prepBannerText,
                  prepDelayed
                    ? styles.prepBannerTextDelayed
                    : merchantReady
                      ? styles.prepBannerTextReady
                      : styles.prepBannerTextPreparing,
                ]}
              >
                {prepDelayed
                  ? formatPrepDelayedLabel(overdueSec)
                  : merchantReady
                    ? t("orders.activeFood.orderIsReady", "Order is ready")
                    : t(
                        "orders.activeFood.underPreparation",
                        "Order is under preparation"
                      )}
              </Text>
            </View>
          ) : null}

          {phase === "drop" && deliveryInfoOpen ? (
            <View style={styles.deliveryInfoCard}>
              <Ionicons name="alert-circle" size={18} color={colors.warning[700]} />
              <Text style={styles.deliveryInfoText}>
                {t(
                  "orders.activeFood.deliveryPenaltyBody",
                  "If you miss or cancel this delivery without valid approval, you may be fined up to the full order value. Deliver only to the customer address shown on the map."
                )}
              </Text>
            </View>
          ) : null}

        </View>
        </View>
      ) : (
        <View style={styles.sheetBody}>
        <View style={styles.collapsedHeader}>
          <Text style={styles.collapsedTitle} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.collapsedDistance}>{distanceLabel}</Text>
        </View>
        </View>
      )}

      {phase === "drop" && !sheetExpanded ? (
        <View style={styles.sheetBody}>
          <View style={styles.actionsDock}>{dropSliders}</View>
        </View>
      ) : null}

      {phase === "pickup" ? (
        <View style={styles.sheetBody}>
          <View style={styles.actionsDock}>{pickupActionButtons}</View>
        </View>
      ) : null}

      {phase === "drop" && orderDelivered ? (
        <View style={styles.sheetBody}>
          <View style={styles.deliveredBanner}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success[700]} />
            <Text style={styles.deliveredBannerText}>
              {t("orders.activeFood.orderDelivered", "Order delivered successfully")}
            </Text>
          </View>
        </View>
      ) : null}
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
    marginTop: -6,
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
  metaTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  distanceLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#202124",
    letterSpacing: -0.2,
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
  chevronDock: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
  },
  detailsBody: {
    width: "100%",
    paddingBottom: 2,
  },
  locationName: {
    fontSize: 19,
    fontWeight: "700",
    color: "#202124",
    marginBottom: 3,
    letterSpacing: -0.2,
    lineHeight: 25,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: "400",
    color: "#5F6368",
    lineHeight: 20,
    marginBottom: 4,
  },
  locationAddressSecondary: {
    fontSize: 14,
    fontWeight: "400",
    color: "#5F6368",
    lineHeight: 20,
    marginBottom: 10,
  },
  locationAddressLast: {
    marginBottom: 8,
  },
  dropHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  dropBadge: {
    alignSelf: "flex-start",
    backgroundColor: NAV_SHEET_PHASE_BADGE_DROP_BG,
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  dropBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.8,
  },
  orderIdLine: {
    marginBottom: 12,
  },
  orderIdPrefix: {
    fontSize: 14,
    fontWeight: "400",
    color: "#5F6368",
  },
  orderIdValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#202124",
  },
  tripleActionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 0,
  },
  dropSliderDock: {
    width: "100%",
    marginTop: 12,
    paddingBottom: 2,
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
    backgroundColor: NAV_SHEET_DROP_MAP_BTN_BG,
    borderWidth: 0,
  },
  actionIconBtnDisabled: {
    opacity: 0.55,
  },
  actionIconBtnText: {
    marginTop: 3,
    fontSize: 13,
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
  collapsedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  collapsedTitle: {
    flex: 1,
    fontSize: 16,
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
  delayBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#8B0000",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  delayBannerText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pickOrderReopen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  pickOrderReopenPreparing: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  pickOrderReopenReady: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  pickOrderReopenTextCol: {
    flex: 1,
    minWidth: 0,
  },
  pickOrderReopenTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#202124",
  },
  pickOrderReopenSub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
  },
  prepBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  prepBannerPreparing: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  prepBannerDelayed: {
    backgroundColor: "#8B0000",
    borderColor: "#8B0000",
  },
  prepBannerReady: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  prepBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  prepBannerTextPreparing: {
    color: colors.warning[800],
  },
  prepBannerTextDelayed: {
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
  prepBannerTextReady: {
    color: colors.success[800],
  },
  deliveryInfoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.warning[50],
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  deliveryInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.warning[900],
    lineHeight: 17,
  },
  actionsDock: {
    width: "100%",
    paddingTop: 0,
    paddingBottom: 4,
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
});
