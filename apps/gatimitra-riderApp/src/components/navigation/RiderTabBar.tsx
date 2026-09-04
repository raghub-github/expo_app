import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveRiderTabBarBottomInset } from "@/src/hooks/useRiderBottomInset";
import { useEarningsBankSheetStore } from "@/src/stores/earningsBankSheetStore";
import { useProfileSelfieSheetStore } from "@/src/stores/profileSelfieSheetStore";
import { colors } from "@/src/theme";
import { TAB_LABEL_SIZE } from "@/src/theme/headerFonts";

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

export function RiderTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = resolveRiderTabBarBottomInset(insets.bottom);
  const bankSheetOpen = useEarningsBankSheetStore((s) => s.visible);
  const selfieSheetOpen = useProfileSelfieSheetStore((s) => s.visible);

  if (bankSheetOpen || selfieSheetOpen) return null;

  return (
    <View style={[styles.shell, { paddingBottom: bottomPad }]}>
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
              style={styles.tabBtn}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
            >
              {focused ? <View style={styles.activeLine} /> : <View style={styles.activeLineSpacer} />}
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={22}
                color={focused ? BRAND : colors.gray[500]}
              />
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
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
    paddingTop: 4,
    paddingHorizontal: 6,
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
  // System face — avoid Lora blank on first paint before brand fonts finish.
  label: {
    fontSize: TAB_LABEL_SIZE,
    fontWeight: "600",
    color: colors.gray[500],
    includeFontPadding: false,
  },
  labelActive: {
    fontWeight: "700",
    color: BRAND,
  },
});
