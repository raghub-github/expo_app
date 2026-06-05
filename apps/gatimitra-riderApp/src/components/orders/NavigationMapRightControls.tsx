import React from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { NavMapViewMode } from "@/src/lib/map-assets";

const NAV_TEAL = "#0F766E";
const NAV_GREEN = "#0B5D30";
const NAV_FAB_BG = "#FFFFFF";
const NAV_FAB_SIZE = 50;

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

function MapFab({
  icon,
  onPress,
  onLongPress,
  accessibilityLabel,
  grouped = false,
  active = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  grouped?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={420}
      style={({ pressed }) => [
        styles.mapFab,
        grouped && styles.mapFabGrouped,
        active && styles.mapFabActive,
        pressed && styles.mapFabPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={22} color={active ? "#ffffff" : NAV_TEAL} />
    </Pressable>
  );
}

type Props = {
  bottom?: number;
  mapViewMode?: NavMapViewMode;
  onRecenter: () => void;
  onRecenterLongPress?: () => void;
  onToggleMapView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onMutePress?: () => void;
  muted?: boolean;
};

/** Zoom, re-centre, map view toggle — food + ride navigation. */
export function NavigationMapRightControls({
  bottom = 20,
  mapViewMode = "navigation",
  onRecenter,
  onRecenterLongPress,
  onToggleMapView,
  onZoomIn,
  onZoomOut,
  onMutePress,
  muted = false,
}: Props) {
  const { t } = useTranslation();
  const streetMode = mapViewMode === "street";

  return (
    <>
      <View style={[styles.zoomCol, { bottom: bottom + 176 }]} pointerEvents="box-none">
        <View style={styles.zoomGroup}>
          <MapFab
            icon="add"
            grouped
            onPress={onZoomIn}
            accessibilityLabel={t("orders.activeFood.zoomIn", "Zoom in")}
          />
          <View style={styles.zoomDivider} />
          <MapFab
            icon="remove"
            grouped
            onPress={onZoomOut}
            accessibilityLabel={t("orders.activeFood.zoomOut", "Zoom out")}
          />
        </View>
      </View>

      <View style={[styles.fabCol, { bottom }]} pointerEvents="box-none">
        <MapFab
          icon="locate"
          onPress={onRecenter}
          onLongPress={onRecenterLongPress}
          accessibilityLabel={t(
            "orders.activeFood.recenter",
            "Re-centre navigation. Long press for full route."
          )}
        />
        <MapFab
          icon={muted ? "volume-mute" : "volume-high"}
          onPress={onMutePress ?? (() => {})}
          accessibilityLabel={t("orders.activeFood.voice", "Voice guidance")}
        />
        <MapFab
          icon={streetMode ? "navigate" : "map-outline"}
          active={streetMode}
          onPress={onToggleMapView}
          accessibilityLabel={
            streetMode
              ? t("orders.activeFood.mapViewNav", "Switch to navigation map")
              : t("orders.activeFood.mapViewStreet", "Switch to street map")
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fabCol: {
    position: "absolute",
    right: 14,
    zIndex: 15,
    gap: 10,
  },
  zoomCol: {
    position: "absolute",
    right: 14,
    zIndex: 15,
  },
  zoomGroup: {
    backgroundColor: NAV_FAB_BG,
    borderRadius: NAV_FAB_SIZE / 2 + 4,
    borderWidth: 2,
    borderColor: NAV_TEAL,
    overflow: "hidden",
    ...fabShadow,
  },
  zoomDivider: {
    height: 1,
    backgroundColor: "rgba(15, 118, 110, 0.22)",
    marginHorizontal: 10,
  },
  mapFab: {
    width: NAV_FAB_SIZE,
    height: NAV_FAB_SIZE,
    borderRadius: NAV_FAB_SIZE / 2,
    backgroundColor: NAV_FAB_BG,
    borderWidth: 2,
    borderColor: NAV_TEAL,
    alignItems: "center",
    justifyContent: "center",
    ...fabShadow,
  },
  mapFabActive: {
    backgroundColor: NAV_TEAL,
    borderColor: NAV_GREEN,
  },
  mapFabGrouped: {
    borderWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  mapFabPressed: {
    backgroundColor: "#E6F7F4",
    opacity: 0.96,
  },
});
