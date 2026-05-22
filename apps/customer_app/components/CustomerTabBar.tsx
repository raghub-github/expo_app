import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";

const TAB_ACTIVE = GatiMitraColors.splashMint;
const TAB_INACTIVE = "#94A3B8";
const TAB_GRADIENT = ["#0D9488", "#14B8A6", "#2DD4BF"] as const;
const ICON_SIZE = 20;
const ORB_SIZE = 38;

type TabConfig = {
  routeName: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
};

const TABS: TabConfig[] = [
  { routeName: "index", label: "Home", icon: "home-outline", iconFocused: "home" },
  { routeName: "orders", label: "Orders", icon: "receipt-outline", iconFocused: "receipt" },
  { routeName: "profile", label: "Profile", icon: "person-outline", iconFocused: "person" },
];

function getTabConfig(routeName: string): TabConfig {
  return TABS.find((t) => t.routeName === routeName) ?? TABS[0];
}

export function CustomerTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 6 : 4);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPad }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const tab = getTabConfig(route.name);
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={tab.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}
            >
              {focused ? (
                <LinearGradient
                  colors={TAB_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activeOrb}
                >
                  <Ionicons name={tab.iconFocused} size={ICON_SIZE} color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <View style={styles.inactiveIconWrap}>
                  <Ionicons name={tab.icon} size={ICON_SIZE} color={TAB_INACTIVE} />
                </View>
              )}
              <Text style={[styles.label, focused && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "transparent",
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "rgba(20, 184, 166, 0.1)",
    ...Platform.select({
      ios: {
        shadowColor: "#0D9488",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 2,
    gap: 2,
  },
  activeOrb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: TAB_ACTIVE,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  inactiveIconWrap: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: TAB_INACTIVE,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: TAB_ACTIVE,
    fontWeight: "700",
  },
});
