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
import { SlideToReachPickup } from "@/src/components/orders/SlideToReachPickup";
import { NavBottomSheetChevron } from "@/src/components/orders/NavBottomSheetChevron";
import { formatActiveOrderEarning } from "@/src/lib/active-order-display";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";

/** Fixed sheet height for map padding — tuned for premium layout on common phones. */
export const NAVIGATE_PICKUP_SHEET_HEIGHT = 418;
export const NAVIGATE_PICKUP_SHEET_COLLAPSED_HEIGHT = 118;

export type NavigatePickupRouteMeta = {
  etaMinutes?: number;
  distanceKm?: number;
  metersAway?: number | null;
  loading?: boolean;
  error?: boolean;
  onRetryRoute?: () => void;
};

type Props = {
  order: RiderOrderSummary;
  tripId: string;
  title: string;
  pickupAddress: string;
  pickupLandmark?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerRating?: number | null;
  routeMeta: NavigatePickupRouteMeta;
  pickupConfirmed: boolean;
  rideStarted: boolean;
  reachedLoading: boolean;
  cancelLoading: boolean;
  bottomInset: number;
  onReachedPickup: () => void;
  reachSliderDone?: boolean;
  onCancel: () => void;
  onCallCustomer: () => void;
  onChatCustomer: () => void;
  onOpenMaps: () => void;
  callDisabled?: boolean;
  sheetExpanded?: boolean;
  onToggleSheetExpanded?: () => void;
  chatDisabled?: boolean;
};

function TripIdPill({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={[styles.tripPill, accent && styles.tripPillAccent]}>
      <Text style={[styles.tripPillText, accent && styles.tripPillTextAccent]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatCard({
  icon,
  value,
  label,
  highlight,
  loading,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: string;
  label: string;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <View style={[styles.statCard, highlight && styles.statCardHighlight]}>
      {loading ? (
        <ActivityIndicator size="small" color={highlight ? colors.primary[800] : colors.primary[700]} />
      ) : (
        <Ionicons
          name={icon}
          size={14}
          color={highlight ? colors.primary[800] : colors.primary[700]}
        />
      )}
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, highlight && styles.statLabelHighlight]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  disabled,
  tint = "primary",
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: "primary" | "mint" | "maps";
}) {
  const iconColor = disabled
    ? colors.gray[400]
    : tint === "maps"
      ? colors.primary[800]
      : colors.primary[700];

  const wrapStyle =
    tint === "mint"
      ? styles.quickIconWrapMint
      : tint === "maps"
        ? styles.quickIconWrapMaps
        : styles.quickIconWrap;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.quickAction,
        disabled && styles.quickActionDisabled,
        pressed && !disabled && styles.quickActionPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label.replace(/\n/g, " ")}
    >
      <View style={[wrapStyle, disabled && styles.quickIconWrapDisabled]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
    </Pressable>
  );
}

export function NavigatePickupBottomSheet({
  order,
  tripId,
  title,
  pickupAddress,
  pickupLandmark,
  customerName,
  customerPhone,
  customerRating,
  routeMeta,
  pickupConfirmed,
  rideStarted,
  reachedLoading,
  cancelLoading,
  bottomInset,
  onReachedPickup,
  reachSliderDone = false,
  onCancel,
  onCallCustomer,
  onChatCustomer,
  onOpenMaps,
  callDisabled,
  chatDisabled,
  sheetExpanded = true,
  onToggleSheetExpanded,
}: Props) {
  const { t } = useTranslation();
  const earning = formatActiveOrderEarning(order);

  const metersLabel =
    routeMeta.metersAway == null
      ? "—"
      : routeMeta.metersAway >= 1000
        ? `${(routeMeta.metersAway / 1000).toFixed(1)} km`
        : `${Math.round(routeMeta.metersAway)} m`;

  const displayCustomer = customerName?.trim() || t("orders.activeRide.customerFallback", "Customer");
  const displayPhone = customerPhone?.trim() || null;

  const reachPickupControl = (
    <SlideToReachPickup
      title={t("orders.activeRide.slideReachPickup", "Slide to reach pickup")}
      subtitle={t("orders.activeRide.slideReachSubtitle", "Arrived at pickup location?")}
      onComplete={onReachedPickup}
      disabled={reachSliderDone || pickupConfirmed || rideStarted}
      loading={reachedLoading && !reachSliderDone && !pickupConfirmed}
      completed={reachSliderDone || pickupConfirmed || rideStarted}
      completedLabel={
        rideStarted
          ? t("orders.activeRide.rideStartedDone", "Ride started ✓")
          : t("orders.activeRide.reachedDone", "Reached pickup ✓")
      }
    />
  );

  return (
    <View style={[styles.sheet, { paddingBottom: bottomInset > 0 ? bottomInset : 0 }]}>
      <View style={styles.chevronDock}>
        {onToggleSheetExpanded ? (
          <NavBottomSheetChevron expanded={sheetExpanded} onPress={onToggleSheetExpanded} />
        ) : (
          <View style={styles.handle} />
        )}
      </View>

      {sheetExpanded ? (
        <>
      <View style={styles.sheetTop}>
        <View style={styles.tripRow}>
          <TripIdPill label={t("orders.activeRide.tripIdLabel", "Trip ID")} />
          <TripIdPill label={tripId} accent />
        </View>
        <Pressable
          onPress={onCancel}
          disabled={cancelLoading}
          style={({ pressed }) => [styles.cancelTopBtn, pressed && styles.cancelTopBtnPressed]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("orders.activeRide.cancelRide", "Cancel ride")}
        >
          {cancelLoading ? (
            <ActivityIndicator size="small" color={colors.error[600]} />
          ) : (
            <View style={styles.cancelTopInner}>
              <Ionicons name="warning-outline" size={15} color={colors.error[600]} />
              <Text style={styles.cancelTopText} numberOfLines={1}>
                {t("orders.activeRide.cancelShort", "Cancel")}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <Text style={styles.title}>{title}</Text>

      {routeMeta.error ? (
        <Pressable onPress={routeMeta.onRetryRoute} style={styles.routeError}>
          <Ionicons name="refresh-outline" size={14} color={colors.error[600]} />
          <Text style={styles.routeErrorText}>
            {t("orders.activeRide.routeFailed", "Route unavailable — retry")}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.statsRow}>
          <StatCard
            icon="time-outline"
            value={
              routeMeta.etaMinutes != null
                ? `${routeMeta.etaMinutes} ${t("orders.activeRide.min", "min")}`
                : "—"
            }
            label={t("orders.activeRide.statEta", "ETA")}
            loading={routeMeta.loading}
          />
          <StatCard
            icon="navigate-outline"
            value={
              routeMeta.distanceKm != null ? `${routeMeta.distanceKm.toFixed(1)} km` : "—"
            }
            label={t("orders.activeRide.statDistance", "Distance")}
            loading={routeMeta.loading}
          />
          <StatCard
            icon="locate-outline"
            value={metersLabel}
            label={t("orders.activeRide.statFromPickup", "From pickup")}
          />
          <StatCard
            icon="cash-outline"
            value={earning || "—"}
            label={t("orders.activeRide.statEarnings", "Est. earnings")}
            highlight
          />
        </View>
      )}

      <View style={styles.locationActionsRow}>
        <View style={styles.locationCard}>
          <View style={styles.locationCol}>
            <View style={styles.colHeader}>
              <Ionicons name="location" size={15} color={colors.success[600]} />
              <Text style={styles.colTitle}>
                {t("orders.activeRide.pickupLocation", "Pickup location")}
              </Text>
            </View>
            <Text style={styles.colMain} numberOfLines={2}>
              {pickupAddress}
            </Text>
            {pickupLandmark ? (
              <Text style={styles.colSub} numberOfLines={1}>
                {pickupLandmark}
              </Text>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.locationCol}>
            <View style={styles.colHeader}>
              <Ionicons name="person" size={15} color={colors.gray[500]} />
              <Text style={styles.colTitle}>{t("orders.activeRide.customer", "Customer")}</Text>
            </View>
            <Text style={styles.colMain} numberOfLines={1}>
              {displayCustomer}
            </Text>
            {displayPhone ? (
              <Text style={styles.colSub} numberOfLines={1}>
                {displayPhone}
              </Text>
            ) : null}
            {customerRating != null && Number.isFinite(customerRating) ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.ratingText}>{customerRating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.quickCol}>
          <QuickAction
            icon="call"
            label={t("orders.activeRide.callCustomer", "Call customer")}
            onPress={onCallCustomer}
            disabled={callDisabled}
            tint="primary"
          />
          <QuickAction
            icon="chatbubble-ellipses"
            label={t("orders.activeRide.chat", "Chat")}
            onPress={onChatCustomer}
            disabled={chatDisabled}
            tint="mint"
          />
          <QuickAction
            icon="map"
            label={t("orders.activeRide.openMaps", "Open in maps")}
            onPress={onOpenMaps}
            tint="maps"
          />
        </View>
      </View>
        </>
      ) : (
        <Text style={styles.collapsedTitle} numberOfLines={1}>
          {title}
        </Text>
      )}

      {reachPickupControl}
    </View>
  );
}

const sheetShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  android: { elevation: 20 },
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
  collapsedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[900],
    marginBottom: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.gray[200],
    marginBottom: 10,
  },
  sheetTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    flexShrink: 1,
  },
  cancelTopBtn: {
    flexShrink: 0,
    borderRadius: 10,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 78,
  },
  cancelTopBtnPressed: {
    opacity: 0.85,
  },
  cancelTopInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flexWrap: "nowrap",
  },
  cancelTopText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.error[600],
    flexShrink: 0,
  },
  tripPill: {
    backgroundColor: colors.primary[50],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  tripPillAccent: {
    backgroundColor: colors.primary[100],
    borderColor: colors.primary[200],
  },
  tripPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary[700],
  },
  tripPillTextAccent: {
    fontWeight: "800",
    color: colors.primary[900],
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  statsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 2,
    minHeight: 58,
  },
  statCardHighlight: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[200],
  },
  statValue: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
  },
  statValueHighlight: {
    color: colors.primary[900],
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.gray[500],
    textAlign: "center",
  },
  statLabelHighlight: {
    color: colors.primary[700],
  },
  routeError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingVertical: 4,
  },
  routeErrorText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.error[600],
  },
  locationActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 12,
  },
  locationCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.gray[50],
    minWidth: 0,
  },
  locationCol: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    width: 1,
    backgroundColor: colors.gray[200],
    marginHorizontal: 10,
  },
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  colTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  colMain: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[900],
    lineHeight: 18,
  },
  colSub: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[500],
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[800],
  },
  quickCol: {
    flexShrink: 0,
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 2,
  },
  quickAction: {
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionDisabled: {
    opacity: 0.55,
  },
  quickActionPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  quickIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
  },
  quickIconWrapMint: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
  },
  quickIconWrapMaps: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    alignItems: "center",
    justifyContent: "center",
  },
  quickIconWrapDisabled: {
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
  },
});
