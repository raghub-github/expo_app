/**
 * Classic food home — floating Search pill (bottom center).
 *
 * AUTHORITATIVE mount: `app/_layout.tsx` sibling host (zIndex ≥ 110, NO elevation).
 * Visibility is owned by `classicFoodChromeStore` (sticky categories + scroll-up).
 */

import { Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  FLOATING_CART_BAR_HEIGHT,
  resolveCustomerFloatingChromeBottom,
} from "@/constants/layout";
import { useFloatingDockUiStore } from "@/store/floatingDockUiStore";
import { useClassicFoodChromeStore } from "@/store/classicFoodChromeStore";
import { resolveClassicSearchPillBottom } from "@/lib/classicSearchPillLayout";

const PILL_H = 38;
/** Softer than near-black — still readable white label. */
const PILL_BG = "#475569";

type Props = {
  extraBottom?: number;
};

export function ClassicFloatingSearchPill({ extraBottom = 0 }: Props) {
  const { bottom } = useAppSafeAreaInsets();
  const visible = useClassicFoodChromeStore((s) => s.searchPillVisible);
  const onPress = useClassicFoodChromeStore((s) => s.onSearchPress);
  const dockVisible = useFloatingDockUiStore((s) => s.dockVisible);
  const classicFooting = useClassicFoodChromeStore((s) => s.footingOwner);

  if (!visible || !onPress) return null;

  const bottomOffset = resolveClassicSearchPillBottom({
    safeBottom: bottom,
    resolveChromeBottom: resolveCustomerFloatingChromeBottom,
    cartDockVisible: dockVisible,
    floatingCartBarHeight: FLOATING_CART_BAR_HEIGHT,
    classicNavExpanded: classicFooting === "nav" && !dockVisible,
    extraBottom,
  });

  return (
    <View pointerEvents="box-none" style={styles.root} testID="classic-floating-search-pill">
      <View pointerEvents="box-none" style={[styles.host, { bottom: bottomOffset }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search"
          onPress={() => {
            try {
              onPress();
            } catch {
              // Never let a search-handler throw take down the Food tab.
            }
          }}
          unstable_pressDelay={0}
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        >
          <View style={styles.pill} collapsable={false}>
            <Ionicons name="search" size={15} color="#FFFFFF" />
            <Text style={styles.label} allowFontScaling={false}>
              Search
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pressable: {
    borderRadius: 999,
  },
  pill: {
    height: PILL_H,
    minWidth: 102,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: PILL_BG,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PILL_BG,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});
