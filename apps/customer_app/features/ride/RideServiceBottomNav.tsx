import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT,
  resolveCustomerBottomNavHeight,
  resolveTabBarBottomInset,
} from "@/constants/layout";

export type RideServiceTab = "all" | "intercity";

/** @deprecated Use `CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT` from `@/constants/layout`. */
export const RIDE_BOTTOM_NAV_CONTENT_H = CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT;

export function getRideServiceBottomNavHeight(bottomInset = 0): number {
  return resolveCustomerBottomNavHeight(bottomInset);
}

type Props = {
  activeTab: RideServiceTab;
  onTabChange: (tab: RideServiceTab) => void;
};

export function RideServiceBottomNav({ activeTab, onTabChange }: Props) {
  const { bottom: rawBottom } = useSafeAreaInsets();
  const bottomPad = resolveTabBarBottomInset(rawBottom);

  return (
    <View style={[styles.wrapper, bottomPad > 0 ? { paddingBottom: bottomPad } : null]}>
      <View style={styles.wrap}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "all" && styles.tabActive]}
          onPress={() => onTabChange("all")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="grid-outline"
            size={18}
            color={activeTab === "all" ? GatiMitraColors.primaryMint : GatiMitraColors.textSecondary}
          />
          <AppText style={[styles.tabLabel, activeTab === "all" && styles.tabLabelActive]}>
            All Services
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "intercity" && styles.tabActive]}
          onPress={() => onTabChange("intercity")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="map-outline"
            size={18}
            color={activeTab === "intercity" ? GatiMitraColors.primaryMint : GatiMitraColors.textSecondary}
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
  wrap: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 24,
    gap: 10,
    elevation: 0,
    shadowOpacity: 0,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
  },
  tabActive: {
    backgroundColor: "#ECFDF5",
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  tabLabelActive: {
    color: GatiMitraColors.deepMintStart,
    fontWeight: "800",
  },
});
