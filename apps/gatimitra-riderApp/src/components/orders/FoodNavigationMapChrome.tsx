import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationMapRightControls } from "@/src/components/orders/NavigationMapRightControls";
/** Reference-matched navigation header tokens */
const HEADER_BG = "#FFFFFF";
const HEADER_TITLE_COLOR = "#000000";
const EMERGENCY_PINK = "#E91E8C";
const SIDE_PAD = 16;
const ROW_HEIGHT = 48;
const CHEVRON_SIZE = 22;
const TITLE_GAP = 20;
const TITLE_SIZE = 18;
const RIGHT_GAP = 14;
const SIREN_SIZE = 24;
const DIRECTIONS_SIZE = 30;
const HELP_HEIGHT = 30;

const headerShadow = Platform.select({
  ios: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  android: { elevation: 2 },
  default: {},
});

type Props = {
  headerTitle: string;
  mapControlsBottom?: number;
  onBackPress: () => void;
  onEmergencyPress: () => void;
  onDirectionsPress: () => void;
  onHelpPress: () => void;
  onRecenter: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRouteOverviewLongPress?: () => void;
};

const NOOP = () => {};

export function FoodNavigationMapChromeInner({
  headerTitle,
  mapControlsBottom = 20,
  onBackPress,
  onEmergencyPress,
  onDirectionsPress,
  onHelpPress,
  onRecenter,
  onZoomIn,
  onZoomOut,
  onRouteOverviewLongPress,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <>
      <View
        style={[styles.headerBar, { paddingTop: insets.top }, headerShadow]}
        pointerEvents="box-none"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={onBackPress}
              style={({ pressed }) => [styles.chevronHit, pressed && styles.hitPressed]}
              accessibilityRole="button"
              accessibilityLabel={t("common.back", "Back")}
            >
              <Ionicons name="chevron-down" size={CHEVRON_SIZE} color={HEADER_TITLE_COLOR} />
            </Pressable>
            <View style={styles.titleGap} />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
          </View>

          <View style={styles.headerSpacer} />

          <View style={styles.headerRight}>
            <Pressable
              onPress={onEmergencyPress}
              style={({ pressed }) => [styles.emergencyHit, pressed && styles.hitPressed]}
              accessibilityRole="button"
              accessibilityLabel={t("orders.activeFood.emergency", "Emergency")}
            >
              <MaterialCommunityIcons name="alarm-light" size={SIREN_SIZE} color={EMERGENCY_PINK} />
            </Pressable>

            <Pressable
              onPress={onDirectionsPress}
              style={({ pressed }) => [
                styles.directionsBtn,
                pressed && styles.hitPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("orders.activeFood.openDirections", "Open directions")}
            >
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </Pressable>

            <Pressable
              onPress={onHelpPress}
              style={({ pressed }) => [styles.helpBtn, pressed && styles.helpBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel={t("orders.activeFood.help", "Help")}
            >
              <Text style={styles.helpText}>{t("orders.activeFood.helpLabel", "HELP")}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <NavigationMapRightControls
        variant="compact"
        bottom={mapControlsBottom}
        onRecenter={onRecenter}
        onRecenterLongPress={onRouteOverviewLongPress}
        onZoomIn={onZoomIn ?? NOOP}
        onZoomOut={onZoomOut ?? NOOP}
      />
    </>
  );
}

export const FoodNavigationMapChrome = React.memo(FoodNavigationMapChromeInner);

const styles = StyleSheet.create({
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: HEADER_BG,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    height: ROW_HEIGHT,
    paddingHorizontal: SIDE_PAD,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
  },
  chevronHit: {
    width: 24,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  titleGap: {
    width: TITLE_GAP,
    height: 1,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: TITLE_SIZE,
    fontWeight: "700",
    color: HEADER_TITLE_COLOR,
    letterSpacing: 0,
    lineHeight: 22,
    flexShrink: 1,
  },
  headerSpacer: {
    flex: 1,
    minWidth: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  emergencyHit: {
    width: 28,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginRight: RIGHT_GAP,
  },
  directionsBtn: {
    width: DIRECTIONS_SIZE,
    height: DIRECTIONS_SIZE,
    borderRadius: DIRECTIONS_SIZE / 2,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    marginRight: RIGHT_GAP,
  },
  helpBtn: {
    height: HELP_HEIGHT,
    minWidth: 48,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: "#000000",
    borderRadius: 5,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  helpBtnPressed: {
    backgroundColor: "#F5F5F5",
  },
  helpText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#000000",
    letterSpacing: 0.6,
  },
  hitPressed: {
    opacity: 0.7,
  },
});
