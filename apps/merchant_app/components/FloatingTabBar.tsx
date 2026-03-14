/**
 * Bottom navigation bar — anchored, system-style.
 * Active tab: soft pill highlight (#ECFDF5), primary green icon + label.
 * Inactive: neutral grey, no background. No floating gap; respects safe area.
 */

import React, { useRef } from "react";
import { View, Text, Pressable, StyleSheet, Platform, LayoutAnimation } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import { GatiMitraMerchant, TAB_BAR_HEIGHT } from "@/constants/theme";
import { useActiveTab } from "@/context/ActiveTabContext";
import { useProfileNav } from "@/context/ProfileNavContext";
const BAR_PADDING_H = 14;
const TOP_RADIUS = 12;
const ICON_SIZE = 23;
const LABEL_FONT_SIZE = 12;
const ICON_LABEL_GAP = 4;

const PILL_BG = "#ECFDF5";
const PILL_PADDING_V = 6;
const PILL_PADDING_H = 10;
const INACTIVE_COLOR = "#6B7280";
const TOP_DIVIDER = "#E5E7EB";
const PROFILE_PRESS_DEBOUNCE_MS = 600;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setActiveTab } = useActiveTab();
  const { setOpenProfileRootOnNextFocus } = useProfileNav();
  const bottomInset = insets.bottom;
  const lastProfilePressAt = useRef(0);

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomInset }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isActive = state.index === index;
          const label = options.title ?? route.name;

          const onPress = () => {
            // Prevent multiple rapid clicks on Profile when already on Profile tab.
            if (route.name === "profile" && isActive) {
              const now = Date.now();
              if (now - lastProfilePressAt.current < PROFILE_PRESS_DEBOUNCE_MS) return;
              lastProfilePressAt.current = now;
            }
            setActiveTab(route.name);
            if (Platform.OS !== "web") {
              LayoutAnimation.configureNext(
                LayoutAnimation.create(200, "easeOut", "opacity"),
              );
            }
            // When opening Profile tab, always show the profile root (grid), not a nested screen like My tickets.
            if (route.name === "profile") {
              setOpenProfileRootOnNextFocus(true);
              router.replace("/(tabs)/profile");
              navigation.dispatch(CommonActions.navigate({ name: "profile" } as never));
            } else {
              navigation.dispatch(
                CommonActions.navigate({
                  name: route.name,
                } as never)
              );
            }
          };

          const iconColor = isActive ? GatiMitraMerchant.tabActive : INACTIVE_COLOR;
          const iconElement = options.tabBarIcon?.({
            focused: isActive,
            color: iconColor,
            size: ICON_SIZE,
          });

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                pressed && styles.tabItemPressed,
                GatiMitraMerchant.cursorPointer,
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  isActive && [
                    styles.activePill,
                    { transform: [{ scale: 1.05 }] },
                  ],
                ]}
              >
                {iconElement}
              </View>
              <Text
                style={[
                  styles.label,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}
                numberOfLines={1}
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
  wrapper: {
    backgroundColor: GatiMitraMerchant.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: TOP_DIVIDER,
    borderTopLeftRadius: TOP_RADIUS,
    borderTopRightRadius: TOP_RADIUS,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    height: TAB_BAR_HEIGHT,
    paddingHorizontal: BAR_PADDING_H,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemPressed: {
    opacity: 0.9,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: ICON_LABEL_GAP,
  },
  activePill: {
    backgroundColor: PILL_BG,
    paddingVertical: PILL_PADDING_V,
    paddingHorizontal: PILL_PADDING_H,
    borderRadius: 999,
  },
  label: {
    fontSize: LABEL_FONT_SIZE,
    fontWeight: "500",
  },
  labelActive: {
    color: GatiMitraMerchant.tabActive,
  },
  labelInactive: {
    color: INACTIVE_COLOR,
  },
});
