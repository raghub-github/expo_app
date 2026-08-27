import { View, TouchableOpacity, StyleSheet, Platform, type LayoutChangeEvent } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { resolveTabBarBottomInset } from "@/constants/layout";

export type RideServiceTab = "all" | "intercity";

/** Keep in sync with `styles.track` + `styles.tab` + wrapper bottom gap below. */
const TRACK_MARGIN_TOP = 8;
const TRACK_PADDING = 4;
const TAB_MIN_H = 48;
const TRACK_MARGIN_BOTTOM = 8;
/** Visible gap between nav chrome and screen/home-indicator edge. */
const BOTTOM_GAP = 10;

const RIDE_NAV_CONTENT_HEIGHT =
  TRACK_MARGIN_TOP + TRACK_PADDING * 2 + TAB_MIN_H + TRACK_MARGIN_BOTTOM + BOTTOM_GAP;

/**
 * Keep a short clearance above the system gesture/nav area, plus a deliberate
 * visual gap so the pill row does not sit flush on the bottom edge.
 */
function resolveRideNavBottomPad(rawBottomInset: number): number {
  const inset = resolveTabBarBottomInset(rawBottomInset);
  if (Platform.OS === "android") return Math.max(BOTTOM_GAP, Math.min(inset, 12));
  return Math.max(BOTTOM_GAP, Math.min(inset, 14));
}

export function getRideServiceBottomNavHeight(bottomInset = 0): number {
  return RIDE_NAV_CONTENT_HEIGHT - BOTTOM_GAP + resolveRideNavBottomPad(bottomInset);
}

/** @deprecated Use `getRideServiceBottomNavHeight`. */
export const RIDE_BOTTOM_NAV_CONTENT_H = RIDE_NAV_CONTENT_HEIGHT;

type Props = {
  activeTab: RideServiceTab;
  onTabChange: (tab: RideServiceTab) => void;
  /** Measured total bar height (content + bottom pad) for floating UI positioning. */
  onHeightChange?: (height: number) => void;
};

export function RideServiceBottomNav({ activeTab, onTabChange, onHeightChange }: Props) {
  const { bottom: rawBottom } = useSafeAreaInsets();
  const bottomPad = resolveRideNavBottomPad(rawBottom);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) onHeightChange?.(h);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrapper, { paddingBottom: bottomPad }]}
    >
      <View style={styles.track}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "all" && styles.tabActive]}
          onPress={() => onTabChange("all")}
          activeOpacity={0.9}
        >
          <Ionicons
            name="grid"
            size={18}
            color={activeTab === "all" ? "#065F46" : GatiMitraColors.textSecondary}
          />
          <AppText style={[styles.tabLabel, activeTab === "all" && styles.tabLabelActive]}>
            All Services
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "intercity" && styles.tabActive]}
          onPress={() => onTabChange("intercity")}
          activeOpacity={0.9}
        >
          <Ionicons
            name="map"
            size={18}
            color={activeTab === "intercity" ? "#065F46" : GatiMitraColors.textSecondary}
          />
          <AppText style={[styles.tabLabel, activeTab === "intercity" && styles.tabLabelActive]}>
            Inter city
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  track: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: TRACK_MARGIN_TOP,
    marginBottom: TRACK_MARGIN_BOTTOM,
    padding: TRACK_PADDING,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: TAB_MIN_H,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 7,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  tabLabelActive: {
    color: "#065F46",
    fontWeight: "800",
  },
});
