import React, { useLayoutEffect, useMemo, useCallback, useState } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  SlideInRight,
  SlideOutRight,
} from "react-native-reanimated";
import {
  ACTIVE_TAB_RADIUS,
  CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT,
  CUSTOMER_TAB_BAR_FLOAT_GAP,
  FLOATING_CART_UI_LIFT,
  FLOATING_NAV_RADIUS,
  resolveCustomerBottomNavHeight,
  resolveFloatingCartBottomOffset,
  resolveTabBarBottomInset,
} from "@/constants/layout";
import { FLOATING_EDGE_TAB_GAP } from "@/components/FloatingEdgeChrome";
import { EdgePeekTab } from "@/components/EdgePeekTab";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { useCustomerGeoServiceAvailability } from "@/hooks/useCustomerGeoServiceAvailability";
import { useCustomerServiceBlocks } from "@/hooks/useCustomerServiceBlocks";
import { CUSTOMER_HOME_SERVICE_META } from "@/lib/customerHomeServiceMeta";
import { useCustomerServiceBlockSheetStore } from "@/store/customerServiceBlockSheetStore";
import { useFloatingDockUiStore } from "@/store/floatingDockUiStore";
import { useDiscoveryFloatingChromeStore } from "@/store/discoveryFloatingChromeStore";
import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { DiscoveryFloatingBar } from "@/features/discovery-home/DiscoveryFloatingBar";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";

/** Merchant Flow navy — active pill (no red). */
const TAB_ACTIVE_BG = "#1E3A5F";
const TAB_ACTIVE_FG = "#FFFFFF";
const TAB_INACTIVE = "#64748B";
const TAB_DISABLED = "#94A3B8";
const TAB_INACTIVE_DARK = DiscoveryColors.textMuted;
const TAB_DISABLED_DARK = DiscoveryColors.textDim;
const ICON_SIZE = 22;

/** Identical geometry for every tab’s active (and inactive shell). */
const PILL_H = 52;
const PILL_SIDE_INSET = 6;

const CAPSULE_H = 64;
const CAPSULE_PAD_H = 8;
const CAPSULE_PAD_V = 6;
const H_MARGIN = 16;
const TAB_COUNT = 4;

/** Match page tab slide (~280ms) so the active pill moves with the screen. */
const ACTIVE_PILL_MS = 280;

/** @deprecated Use `CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT` from `@/constants/layout`. */
export const CUSTOMER_TAB_BAR_CONTENT_HEIGHT = CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT;

export function customerTabBarOffset(insetsBottom: number): number {
  return resolveCustomerBottomNavHeight(insetsBottom);
}

type IconFamily = "ionicons" | "material";

type TabConfig = {
  routeName: string;
  label: string;
  family: IconFamily;
  icon: string;
  iconFocused: string;
};

const TABS: TabConfig[] = [
  {
    routeName: "index",
    label: "Home",
    family: "ionicons",
    icon: "home-outline",
    iconFocused: "home",
  },
  {
    routeName: "food",
    label: "Food",
    family: "material",
    icon: "room-service-outline",
    iconFocused: "room-service",
  },
  {
    routeName: "orders",
    label: "Orders",
    family: "material",
    icon: "clipboard-text-outline",
    iconFocused: "clipboard-text",
  },
  {
    routeName: "profile",
    label: "Profile",
    family: "material",
    icon: "account-outline",
    iconFocused: "account",
  },
];

function tabIndexForRoute(routeName: string): number {
  const idx = TABS.findIndex((t) => t.routeName === routeName);
  return idx >= 0 ? idx : 0;
}

function TabIcon({
  tab,
  focused,
  color,
}: {
  tab: TabConfig;
  focused: boolean;
  color: string;
}) {
  const name = focused ? tab.iconFocused : tab.icon;

  if (tab.family === "material") {
    return (
      <MaterialCommunityIcons
        name={name as keyof typeof MaterialCommunityIcons.glyphMap}
        size={ICON_SIZE}
        color={color}
      />
    );
  }

  return (
    <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={ICON_SIZE} color={color} />
  );
}

function TabLabelRow({
  tab,
  color,
  focused,
  bold,
  width,
}: {
  tab: TabConfig;
  color: string;
  focused: boolean;
  bold?: boolean;
  width: number;
}) {
  return (
    <View style={[styles.tabPill, { width, height: PILL_H }]}>
      <TabIcon tab={tab} focused={focused} color={color} />
      <Text
        style={[styles.label, { color }, bold && styles.labelBold]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {tab.label}
      </Text>
    </View>
  );
}

/**
 * True floating dock — absolute to the tab navigator root (not page content).
 * When cart/track owns the bottom footing, collapses to a left HOME edge peek.
 */
export function CustomerTabBar({ state, navigation }: BottomTabBarProps) {
  const { width: windowWidth } = useWindowDimensions();
  const { bottom: rawBottom } = useAppSafeAreaInsets();
  const { enabledServices } = useCustomerGeoServiceAvailability();
  const { accountBlocks } = useCustomerServiceBlocks();
  const openBlockSheet = useCustomerServiceBlockSheetStore((s) => s.open);
  const dockVisible = useFloatingDockUiStore((s) => s.dockVisible);
  const footingOwner = useFloatingDockUiStore((s) => s.footingOwner);
  const dockKind = useFloatingDockUiStore((s) => s.dockKind);
  const expandDock = useFloatingDockUiStore((s) => s.expandDock);
  const discoveryLayout = useDiscoveryLayout();
  const discoveryChromeActive = useDiscoveryFloatingChromeStore((s) => s.active);
  const discoveryFootingOwner = useDiscoveryFloatingChromeStore((s) => s.footingOwner);
  const discoverySortBy = useDiscoveryFloatingChromeStore((s) => s.sortBy);
  const discoveryHasFilters = useDiscoveryFloatingChromeStore((s) => s.hasActiveFilters);
  const discoveryOnSort = useDiscoveryFloatingChromeStore((s) => s.onSortPress);
  const discoveryOnFilters = useDiscoveryFloatingChromeStore((s) => s.onFiltersPress);
  const expandDiscoveryNav = useDiscoveryFloatingChromeStore((s) => s.expandNav);
  const expandDiscoveryFilters = useDiscoveryFloatingChromeStore((s) => s.expandFilters);
  const foodEnabled = enabledServices.food;
  const foodBlocked = Boolean(accountBlocks.food);

  /** Cart/track footing open → hide bottom nav immediately (keep host mounted). */
  const navOnEdge = dockVisible && footingOwner === "dock";
  const hideBottomCapsule = navOnEdge;

  /** When CART/TRACK edge is on the right, hang peek off the screen edge (Dining-style). */
  const showCartEdge = dockVisible && footingOwner === "nav";

  const activeRouteName = state.routes[state.index]?.name ?? "index";
  const routeActiveIndex = tabIndexForRoute(activeRouteName);
  const [pillIndex, setPillIndex] = useState(routeActiveIndex);
  const activeIndex = pillIndex;
  const activeTab = TABS[activeIndex] ?? TABS[0]!;

  /** Discovery Food: filters own footing like cart; nav collapses to HOME edge. */
  const darkChrome = discoveryLayout && activeRouteName === "food";
  const discoveryHandlersReady =
    darkChrome && discoveryChromeActive && !dockVisible && !!discoveryOnSort && !!discoveryOnFilters;
  /** HOME edge + Relevance|Filters dock (mirrors HOME + cart). */
  const discoveryFiltersOwnFooting =
    discoveryHandlersReady && discoveryFootingOwner === "filters";
  /** Full nav + filters right edge (mirrors full nav + CART edge). */
  const showDiscoveryFilterEdge =
    discoveryHandlersReady && discoveryFootingOwner === "nav";
  const inactiveColor = darkChrome ? TAB_INACTIVE_DARK : TAB_INACTIVE;
  const disabledColor = darkChrome ? TAB_DISABLED_DARK : TAB_DISABLED;
  const bottomAnchor = darkChrome
    ? resolveFloatingCartBottomOffset(rawBottom, { aboveTabBar: false }) + FLOATING_CART_UI_LIFT
    : resolveTabBarBottomInset(rawBottom) + CUSTOMER_TAB_BAR_FLOAT_GAP;
  const dockLeft = showCartEdge || showDiscoveryFilterEdge ? 0 : H_MARGIN;
  const dockRight = showCartEdge || showDiscoveryFilterEdge ? 0 : H_MARGIN;

  useLayoutEffect(() => {
    setPillIndex(routeActiveIndex);
  }, [routeActiveIndex]);

  const { tabSlotW, pillW, pillInset } = useMemo(() => {
    const rightPad = showCartEdge || showDiscoveryFilterEdge ? FLOATING_EDGE_TAB_GAP : dockRight;
    const sidePad = dockLeft + rightPad;
    // Edge peek hangs off-screen (same reserve as CART/TRACK) so full nav stays wide.
    const capsuleInner = Math.max(0, windowWidth - sidePad - CAPSULE_PAD_H * 2);
    const slot = Math.floor(capsuleInner / TAB_COUNT);
    const width = Math.max(56, slot - PILL_SIDE_INSET * 2);
    return {
      tabSlotW: slot,
      pillW: width,
      pillInset: Math.max(0, (slot - width) / 2),
    };
  }, [windowWidth, dockLeft, dockRight, showCartEdge, showDiscoveryFilterEdge]);

  const pillX = useSharedValue(activeIndex * tabSlotW + pillInset);

  useLayoutEffect(() => {
    pillX.value = withTiming(activeIndex * tabSlotW + pillInset, {
      duration: ACTIVE_PILL_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeIndex, tabSlotW, pillInset, pillX]);

  const activePillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  const onPressTab = useCallback(
    (route: { key: string; name: string; params?: object }, focused: boolean) => {
      if (route.name === "food" && !foodEnabled) return;
      if (route.name === "food" && foodBlocked) {
        openBlockSheet({
          serviceLabel: CUSTOMER_HOME_SERVICE_META.food.label,
          reason: accountBlocks.food!,
          serviceAssetKey: CUSTOMER_HOME_SERVICE_META.food.assetKey,
        });
        return;
      }
      const nextIdx = tabIndexForRoute(route.name);
      // Move active pill immediately with the page slide — don't wait for navigator index.
      setPillIndex(nextIdx);
      pillX.value = withTiming(nextIdx * tabSlotW + pillInset, {
        duration: ACTIVE_PILL_MS,
        easing: Easing.out(Easing.cubic),
      });
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    },
    [
      foodEnabled,
      foodBlocked,
      openBlockSheet,
      accountBlocks.food,
      navigation,
      pillX,
      tabSlotW,
      pillInset,
    ]
  );

  const onCapsuleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (!__DEV__) return;
      const { x, y, width, height } = e.nativeEvent.layout;
      // eslint-disable-next-line no-console
      console.log(
        `[NAV_GEOMETRY] mode=${hideBottomCapsule ? "home-edge" : "bottom"} activeTab=${activeRouteName} x=${x.toFixed(1)} y=${y.toFixed(1)} w=${width.toFixed(1)} h=${height.toFixed(1)} bottom=${bottomAnchor}`
      );
    },
    [activeRouteName, bottomAnchor, hideBottomCapsule]
  );

  if (hideBottomCapsule) {
    // Keep the tab-bar host mounted (empty). Returning null remounts RN tab chrome
    // mid Home↔Food shift and freezes the scene interpolator around ~50%.
    return <View pointerEvents="none" style={styles.host} collapsable={false} />;
  }

  /** Discovery default: HOME edge + Relevance|Filters dock (same row as cart footing). */
  if (discoveryFiltersOwnFooting && discoveryOnSort && discoveryOnFilters) {
    return (
      <View pointerEvents="box-none" style={styles.host}>
        <View
          pointerEvents="box-none"
          style={[
            styles.filtersFootRow,
            { bottom: bottomAnchor },
          ]}
        >
          <EdgePeekTab
            side="left"
            label="HOME"
            height={CAPSULE_H}
            onPress={expandDiscoveryNav}
          />
          <DiscoveryFloatingBar
            layout="dock"
            height={CAPSULE_H}
            sortBy={discoverySortBy}
            hasActiveFilters={discoveryHasFilters}
            onSortPress={discoveryOnSort}
            onFiltersPress={discoveryOnFilters}
          />
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <View
        pointerEvents="box-none"
        style={[
          styles.dock,
          showCartEdge || showDiscoveryFilterEdge ? styles.dockWithCartEdge : null,
          {
            left: dockLeft,
            right: dockRight,
            bottom: bottomAnchor,
          },
        ]}
      >
        <View
          style={[
            styles.capsuleWrap,
            showCartEdge || showDiscoveryFilterEdge ? styles.capsuleWrapInRow : null,
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[styles.capsule, darkChrome && styles.capsuleDarkRow]}
            pointerEvents="auto"
            onLayout={onCapsuleLayout}
          >
            <View style={styles.track}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.activePill,
                  {
                    width: pillW,
                    height: PILL_H,
                    borderRadius: ACTIVE_TAB_RADIUS,
                  },
                  activePillStyle,
                ]}
              >
                <TabLabelRow
                  tab={activeTab}
                  color={TAB_ACTIVE_FG}
                  focused
                  bold
                  width={pillW}
                />
              </Animated.View>

              {TABS.map((tab) => {
                const route = state.routes.find((r) => r.name === tab.routeName);
                if (!route) return null;

                const focused = activeRouteName === route.name;
                const foodTabDisabled = route.name === "food" && (foodBlocked || !foodEnabled);

                return (
                  <View key={tab.routeName} style={[styles.tabSlot, { width: tabSlotW }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={focused ? { selected: true } : {}}
                      accessibilityLabel={tab.label}
                      onPress={() => onPressTab(route, focused)}
                      onLongPress={() =>
                        navigation.emit({ type: "tabLongPress", target: route.key })
                      }
                      unstable_pressDelay={0}
                      style={({ pressed }) => [
                        styles.tabHit,
                        foodTabDisabled && styles.tabDisabled,
                        pressed && !foodTabDisabled && styles.tabPressed,
                      ]}
                    >
                      <TabLabelRow
                        tab={tab}
                        color={foodTabDisabled ? disabledColor : inactiveColor}
                        focused={false}
                        width={pillW}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
        {showDiscoveryFilterEdge ? (
          <Animated.View
            key="filters-edge"
            entering={SlideInRight.duration(280).easing(Easing.out(Easing.cubic))}
            exiting={SlideOutRight.duration(220).easing(Easing.in(Easing.cubic))}
            collapsable={false}
          >
            <EdgePeekTab
              side="right"
              label="FILTERS"
              height={CAPSULE_H}
              onPress={expandDiscoveryFilters}
            />
          </Animated.View>
        ) : null}
        {showCartEdge ? (
          <Animated.View
            key="cart-edge"
            entering={SlideInRight.duration(280).easing(Easing.out(Easing.cubic))}
            exiting={SlideOutRight.duration(220).easing(Easing.in(Easing.cubic))}
            collapsable={false}
          >
            <EdgePeekTab
              side="right"
              label={dockKind === "track" ? "TRACK" : "CART"}
              height={CAPSULE_H}
              onPress={expandDock}
            />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
  dock: {
    position: "absolute",
    height: CAPSULE_H,
  },
  /** Mirrors GlobalFloatingCart footRow: HOME edge + main dock. */
  filtersFootRow: {
    position: "absolute",
    left: 0,
    right: 16,
    height: CAPSULE_H,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "visible",
  },
  capsuleWrap: {
    width: "100%",
  },
  dockWithCartEdge: {
    height: CAPSULE_H,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "visible",
  },
  capsuleWrapInRow: {
    flex: 1,
    minWidth: 0,
    width: undefined,
  },
  capsule: {
    width: "100%",
    height: CAPSULE_H,
    paddingHorizontal: CAPSULE_PAD_H,
    paddingVertical: CAPSULE_PAD_V,
    backgroundColor: "#FFFFFF",
    borderRadius: FLOATING_NAV_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  capsuleDarkRow: {
    backgroundColor: DiscoveryColors.cardElevated,
    borderColor: DiscoveryColors.border,
    borderRadius: FLOATING_NAV_RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  track: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: PILL_H,
    position: "relative",
  },
  activePill: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: TAB_ACTIVE_BG,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tabSlot: {
    height: PILL_H,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabHit: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  tabPressed: {
    opacity: 0.88,
  },
  tabPill: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center",
  },
  labelBold: {
    fontWeight: "700",
  },
  tabDisabled: {
    opacity: 0.65,
  },
});
