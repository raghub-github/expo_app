import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDutyStore } from "@/src/stores/dutyStore";
import { FoodNavigationManeuverBanner } from "@/src/components/orders/FoodNavigationManeuverBanner";
import { NavigationMapRightControls } from "@/src/components/orders/NavigationMapRightControls";
import type { ActiveManeuverDisplay } from "@/src/lib/navigation-maneuver";

/** Matches navigation banner + speedo (teal / nav green). */
const NAV_TEAL = "#0F766E";
const NAV_GREEN = "#0B5D30";
const NAV_FAB_BG = "#FFFFFF";
const fabShadow = Platform.select({
  ios: {
    shadowColor: NAV_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  android: { elevation: 6 },
  default: {},
});

type Props = {
  maneuver: ActiveManeuverDisplay | null;
  speedKmh?: number | null;
  /** Distance from bottom of map stage to floating controls (map no longer overlaps sheet). */
  mapControlsBottom?: number;
  maneuverTop?: number;
  onMenuPress: () => void;
  onSafetyPress: () => void;
  onRecenter: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onMutePress?: () => void;
  mapViewMode?: import("@/src/lib/map-assets").NavMapViewMode;
  onToggleMapView?: () => void;
  onRouteOverviewLongPress?: () => void;
  muted?: boolean;
};

export function FoodNavigationMapChrome({
  maneuver,
  speedKmh,
  mapControlsBottom = 20,
  maneuverTop = 96,
  onMenuPress,
  onSafetyPress,
  onRecenter,
  onZoomIn,
  onZoomOut,
  onMutePress,
  mapViewMode = "navigation",
  onToggleMapView,
  onRouteOverviewLongPress,
  muted = false,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isOnDuty = useDutyStore((s) => s.isOnDuty);

  const speedLabel = useMemo(() => {
    if (speedKmh == null || !Number.isFinite(speedKmh) || speedKmh < 1) return "—";
    return `${Math.round(speedKmh)}`;
  }, [speedKmh]);

  const fabBottom = mapControlsBottom;

  return (
    <>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <Pressable
          onPress={onMenuPress}
          style={({ pressed }) => [styles.roundBtn, pressed && styles.roundBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Menu"
        >
          <Ionicons name="menu" size={22} color="#111827" />
        </Pressable>

        <View style={styles.onlinePill}>
          <View style={[styles.onlineDot, { backgroundColor: isOnDuty ? "#22C55E" : "#9CA3AF" }]} />
          <Text style={styles.onlineText}>
            {isOnDuty ? t("topbar.online", "Online") : t("topbar.offline", "Offline")}
          </Text>
        </View>

        <Pressable
          onPress={onSafetyPress}
          style={({ pressed }) => [styles.roundBtn, pressed && styles.roundBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Safety"
        >
          <Ionicons name="shield-checkmark" size={22} color="#111827" />
        </Pressable>
      </View>

      {maneuver ? (
        <View style={[styles.maneuverWrap, { top: maneuverTop }]} pointerEvents="none">
          <FoodNavigationManeuverBanner maneuver={maneuver} />
        </View>
      ) : null}

      <View style={[styles.speedo, { bottom: fabBottom }]} pointerEvents="none">
        <Text style={styles.speedValue}>{speedLabel}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>

      <NavigationMapRightControls
        bottom={fabBottom}
        mapViewMode={mapViewMode}
        onRecenter={onRecenter}
        onRecenterLongPress={onRouteOverviewLongPress}
        onToggleMapView={onToggleMapView ?? (() => {})}
        onZoomIn={onZoomIn ?? (() => {})}
        onZoomOut={onZoomOut ?? (() => {})}
        onMutePress={onMutePress}
        muted={muted}
      />
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: NAV_FAB_BG,
    borderWidth: 2,
    borderColor: NAV_TEAL,
    alignItems: "center",
    justifyContent: "center",
    ...fabShadow,
  },
  roundBtnPressed: {
    opacity: 0.88,
  },
  onlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: NAV_FAB_BG,
    borderWidth: 1.5,
    borderColor: "rgba(15, 118, 110, 0.35)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    ...fabShadow,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  maneuverWrap: {
    position: "absolute",
    top: 96,
    left: 0,
    right: 0,
    zIndex: 25,
  },
  speedo: {
    position: "absolute",
    left: 16,
    zIndex: 15,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 3,
    borderColor: NAV_TEAL,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0f766e",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  speedValue: {
    fontSize: 20,
    fontWeight: "800",
    color: NAV_TEAL,
    lineHeight: 22,
  },
  speedUnit: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.4,
  },
});
