import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveRiderTabBarBottomInset } from "@/src/hooks/useRiderBottomInset";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { useRiderBottomDockStore } from "@/src/stores/riderBottomDockStore";
import { colors } from "@/src/theme";
import { TAB_LABEL_SIZE } from "@/src/theme/headerFonts";
import { MIN_TOUCH_TARGET } from "@/src/theme/responsive";

const BRAND = colors.primary[500];

type TabConfig = {
  routeName: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconFocused: React.ComponentProps<typeof Ionicons>["name"];
};

const TABS: TabConfig[] = [
  { routeName: "orders", label: "Orders", icon: "bag-handle-outline", iconFocused: "bag-handle" },
  { routeName: "ledger", label: "Ledger", icon: "cash-outline", iconFocused: "cash" },
  { routeName: "offers", label: "Offers", icon: "pricetag-outline", iconFocused: "pricetag" },
  { routeName: "earnings", label: "Earnings", icon: "wallet-outline", iconFocused: "wallet" },
  { routeName: "profile", label: "Profile", icon: "person-outline", iconFocused: "person" },
];

/**
 * allowFontScaling={false} on tab labels:
 * System fontScale 1.3–1.5 otherwise clips 5 labels or wraps into the map.
 * Icons still scale via responsiveIconSize; labels use moderated rf() size.
 */
export function RiderTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = resolveRiderTabBarBottomInset(insets.bottom);
  const setTabBarTotalHeight = useRiderBottomDockStore((s) => s.setTabBarTotalHeight);
  const { rf, ri, rs, isCompactWidth, layoutFontScale } = useResponsiveLayout();

  const labelSize = useMemo(
    () => rf(TAB_LABEL_SIZE, { min: 10, max: isCompactWidth ? 11 : 12 }),
    [rf, isCompactWidth]
  );
  const iconSize = ri(22);
  const tabMinHeight = Math.max(MIN_TOUCH_TARGET, Math.round(40 * layoutFontScale));

  const onShellLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setTabBarTotalHeight(h);
  };

  return (
    <View
      style={[styles.shell, { paddingBottom: bottomPad, paddingTop: rs(4) }]}
      collapsable={false}
      onLayout={onShellLayout}
    >
      <View style={styles.bar}>
        {state.routes.map((route) => {
          if (route.name === "index") return null;

          const tab = TABS.find((t) => t.routeName === route.name);
          if (!tab) return null;

          const focused = state.routes[state.index]?.key === route.key;
          const { options } = descriptors[route.key];
          const label = (options.title as string) || tab.label;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tabBtn, { minHeight: tabMinHeight }]}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
            >
              {focused ? <View style={styles.activeLine} /> : <View style={styles.activeLineSpacer} />}
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={iconSize}
                color={focused ? BRAND : colors.gray[500]}
              />
              <Text
                style={[styles.label, { fontSize: labelSize }, focused && styles.labelActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
                allowFontScaling={false}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    gap: 2,
    minWidth: 0,
  },
  activeLine: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: BRAND,
    marginBottom: 2,
  },
  activeLineSpacer: {
    width: 28,
    height: 3,
    marginBottom: 2,
    opacity: 0,
  },
  label: {
    fontWeight: "600",
    color: colors.gray[500],
    includeFontPadding: false,
    textAlign: "center",
    maxWidth: "100%",
  },
  labelActive: {
    fontWeight: "700",
    color: BRAND,
  },
});
