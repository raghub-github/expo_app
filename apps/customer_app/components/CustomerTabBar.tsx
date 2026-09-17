import React, { useEffect, useLayoutEffect, useMemo, useCallback, useState } from "react";
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
  SlideInRight,
  SlideOutRight,
} from "react-native-reanimated";
import {
  CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT,
  FLOATING_CART_BAR_HEIGHT,
  resolveCustomerBottomNavHeight,
  resolveCustomerFloatingChromeBottom,
} from "@/constants/layout";
import { FLOATING_EDGE_TAB_GAP } from "@/components/FloatingEdgeChrome";
import { EdgePeekTab } from "@/components/EdgePeekTab";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { useCustomerGeoServiceAvailability } from "@/hooks/useCustomerGeoServiceAvailability";
import { useCustomerServiceBlocks } from "@/hooks/useCustomerServiceBlocks";
import { CUSTOMER_HOME_SERVICE_META } from "@/lib/customerHomeServiceMeta";
import { useCustomerServiceBlockSheetStore } from "@/store/customerServiceBlockSheetStore";
import { useFloatingDockUiStore } from "@/store/floatingDockUiStore";
import { useClassicFoodChromeStore } from "@/store/classicFoodChromeStore";
import { useDiscoveryFloatingChromeStore } from "@/store/discoveryFloatingChromeStore";
import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { DiscoveryFloatingBar } from "@/features/discovery-home/DiscoveryFloatingBar";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  acknowledgeNavigatorPrimaryTab,
  primaryTabFromRouteName,
  resolveOptimisticPrimaryTabIndex,
} from "@/lib/customerPrimaryTabNav";
import { navigatePrimaryTab, setCustomerTabsNavigation } from "@/lib/navigatePrimaryTab";
import {
  CustomerTabBarCurvedSheet,
  TAB_SHEET_CURVE_RISE,
  TAB_SHEET_REAR_PEEK,
  TAB_SHEET_FILL_LIGHT,
  TAB_SHEET_FILL_DARK,
  TAB_SHEET_EDGE_LIGHT,
  TAB_SHEET_EDGE_DARK,
  TAB_SHEET_LIFT_LIGHT,
  TAB_SHEET_LIFT_DARK,
} from "@/components/CustomerTabBarCurvedSheet";

/**
 * Bottom dock UI: full-bleed sheet (rounded top corners), connected to screen bottom.
 * Light theme white bg matches main area; mint active icon/label; clear press feedback.
 */
const TAB_ACTIVE = GatiMitraColors.primaryMint;
const TAB_INACTIVE = GatiMitraColors.textSecondary;
const TAB_DISABLED = "#9CA3AF";
const TAB_INACTIVE_DARK = DiscoveryColors.textMuted;
const TAB_DISABLED_DARK = DiscoveryColors.textDim;
const ICON_SIZE = 22;
const TAB_PRESS_BG = "rgba(34, 197, 94, 0.14)";
const TAB_PRESS_BG_DARK = "rgba(255, 255, 255, 0.12)";

/** Identical geometry for every tab hit target. */
const PILL_H = 52;
const PILL_SIDE_INSET = 6;

const CAPSULE_H = FLOATING_CART_BAR_HEIGHT;
const CAPSULE_PAD_H = 8;
const CAPSULE_PAD_V = 6;
/** Full-bleed — reference dock is flush to left/right screen edges. */
const H_MARGIN = 0;
/** Legacy hill extras (kept at 0 for Magicpin rounded-rect sheet). */
const SHEET_TOP_EXTRA = TAB_SHEET_CURVE_RISE + TAB_SHEET_REAR_PEEK;
const DOCK_H = CAPSULE_H + SHEET_TOP_EXTRA;

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
 * Classic Food Search pill mounts in app root overlay hosts (not here) so TabBar
 * absoluteFill/elevation cannot cover it.
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
  const classicFoodChromeActive = useClassicFoodChromeStore((s) => s.active);
  const classicFoodFooting = useClassicFoodChromeStore((s) => s.footingOwner);
  const expandClassicFoodNav = useClassicFoodChromeStore((s) => s.expandNav);
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
  /** Prefer optimistic requested tab while inflight — chrome must not flash Home. */
  const chromeRouteName =
    TABS[resolveOptimisticPrimaryTabIndex(activeRouteName, tabIndexForRoute)]?.routeName ??
    activeRouteName;

  /** Discovery Food: filters own footing like cart; nav collapses to HOME edge. */
  const darkChrome = discoveryLayout && chromeRouteName === "food";
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
  const activeColor = TAB_ACTIVE;
  const sheetFill = darkChrome ? TAB_SHEET_FILL_DARK : TAB_SHEET_FILL_LIGHT;
  const sheetEdge = darkChrome ? TAB_SHEET_EDGE_DARK : TAB_SHEET_EDGE_LIGHT;
  const sheetLift = darkChrome ? TAB_SHEET_LIFT_DARK : TAB_SHEET_LIFT_LIGHT;
  const pressBg = darkChrome ? TAB_PRESS_BG_DARK : TAB_PRESS_BG;
  /** One Y for Home / Food / Track swap — never flip formulas mid-session. */
  const bottomAnchor = resolveCustomerFloatingChromeBottom(rawBottom);
  /** Sheet fills into the gesture area; tabs pad above it. */
  const sheetHeight = DOCK_H + bottomAnchor;
  /**
   * Classic Food (Discovery-style): HOME edge only until the edge is tapped.
   * Full nav capsule appears only after expandNav — never permanently on Food.
   */
  const classicFoodEdgeOnly =
    classicFoodChromeActive &&
    chromeRouteName === "food" &&
    classicFoodFooting === "edge" &&
    !dockVisible &&
    !discoveryFiltersOwnFooting;
  const sideMargin =
    showCartEdge || showDiscoveryFilterEdge || classicFoodEdgeOnly ? 0 : H_MARGIN;
  const dockLeft = sideMargin;
  const dockRight =
    showCartEdge || showDiscoveryFilterEdge || classicFoodEdgeOnly ? 16 : sideMargin;
  const capsuleTabs = TABS;
  const capsuleTabCount = capsuleTabs.length;

  useEffect(() => {
    setCustomerTabsNavigation(navigation);
    return () => setCustomerTabsNavigation(null);
  }, [navigation]);

  useEffect(() => {
    acknowledgeNavigatorPrimaryTab(activeRouteName, "CustomerTabBar.state");
  }, [activeRouteName]);

  useLayoutEffect(() => {
    setPillIndex(resolveOptimisticPrimaryTabIndex(activeRouteName, tabIndexForRoute));
  }, [routeActiveIndex, activeRouteName]);

  const { tabSlotW, pillW } = useMemo(() => {
    const edgeReserve =
      showCartEdge || showDiscoveryFilterEdge ? FLOATING_EDGE_TAB_GAP : 0;
    const capsuleInner = Math.max(
      0,
      windowWidth - dockLeft - dockRight - CAPSULE_PAD_H * 2 - edgeReserve
    );
    const slot = Math.floor(capsuleInner / capsuleTabCount);
    const width = Math.max(56, slot - PILL_SIDE_INSET * 2);
    return {
      tabSlotW: slot,
      pillW: width,
    };
  }, [
    windowWidth,
    dockLeft,
    dockRight,
    showCartEdge,
    showDiscoveryFilterEdge,
    capsuleTabCount,
  ]);

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
      const nextTab = primaryTabFromRouteName(route.name);
      const nextIdx = tabIndexForRoute(route.name);
      // Optimistic active tab with the page slide — don't wait for navigator index.
      setPillIndex(nextIdx);
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (event.defaultPrevented) return;
      // Same tab: still allow scroll-to-top via default tabPress; no second navigate.
      if (focused) return;
      navigatePrimaryTab(nextTab, `CustomerTabBar.${route.name}`);
    },
    [
      foodEnabled,
      foodBlocked,
      openBlockSheet,
      accountBlocks.food,
      navigation,
    ]
  );

  const [sheetWidth, setSheetWidth] = useState(0);

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setSheetWidth((prev) => (prev === w ? prev : w));
  }, []);

  const fallbackSheetWidth = Math.max(
    0,
    windowWidth -
      dockLeft -
      dockRight -
      (showCartEdge || showDiscoveryFilterEdge ? FLOATING_EDGE_TAB_GAP : 0),
  );
  const curvedSheetW = sheetWidth > 0 ? sheetWidth : fallbackSheetWidth;

  if (hideBottomCapsule) {
    // Keep a fixed host at the shared bottom Y so RN tab chrome never
    // remounts geometry when Track/cart owns footing (HOME edge lives on the dock).
    return (
      <View pointerEvents="none" style={styles.host} collapsable={false}>
        <View
          collapsable={false}
          style={[
            styles.dockPlaceholder,
            {
              left: dockLeft,
              right: dockRight,
              bottom: bottomAnchor,
              opacity: 0,
            },
          ]}
        >
          <View style={styles.capsulePlaceholder} collapsable={false} />
        </View>
      </View>
    );
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

  /**
   * Classic Food default: HOME edge only — full nav after edge tap (Discovery parity).
   * Search pill mounts in root overlay (not here) — never put elevation on this
   * transparent absoluteFill without a background (breaks sibling compositing).
   */
  if (classicFoodEdgeOnly) {
    return (
      <View pointerEvents="box-none" style={[styles.host, styles.hostNoElevation]} collapsable={false}>
        <View
          pointerEvents="box-none"
          style={[styles.classicEdgeOnlyRow, { bottom: bottomAnchor }]}
        >
          <EdgePeekTab
            side="left"
            label="HOME"
            height={CAPSULE_H}
            onPress={expandClassicFoodNav}
          />
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.host, styles.hostNoElevation]}>
      <View
        pointerEvents="box-none"
        style={[
          styles.dock,
          styles.dockElevated,
          showCartEdge || showDiscoveryFilterEdge ? styles.dockWithCartEdge : null,
          {
            left: dockLeft,
            right: dockRight,
            bottom: 0,
            height: sheetHeight,
          },
        ]}
        onLayout={onSheetLayout}
      >
        {/* Full-bleed fill into Android gesture / home-indicator area */}
        <CustomerTabBarCurvedSheet
          width={curvedSheetW}
          height={sheetHeight}
          fill={sheetFill}
          edgeColor={sheetEdge}
          liftColor={sheetLift}
        />
        <View
          style={[
            styles.capsuleWrap,
            showCartEdge || showDiscoveryFilterEdge ? styles.capsuleWrapInRow : null,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.capsule} pointerEvents="auto">
            <View style={styles.track}>
              {capsuleTabs.map((tab) => {
                const route = state.routes.find((r) => r.name === tab.routeName);
                if (!route) return null;

                const focused = activeIndex === tabIndexForRoute(route.name);
                const foodTabDisabled = route.name === "food" && (foodBlocked || !foodEnabled);
                const color = foodTabDisabled
                  ? disabledColor
                  : focused
                    ? activeColor
                    : inactiveColor;

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
                      // Style-only press bg — never mount/unmount children mid-gesture
                      // (Android cancels onPress when absolute shadow is inserted).
                      style={({ pressed }) => [
                        styles.tabHit,
                        foodTabDisabled && styles.tabDisabled,
                        // Native Pressable has no hover; keep pressed-only to avoid
                        // web-only `hovered` deps and accidental press-stuck styles.
                        !foodTabDisabled && pressed && { backgroundColor: pressBg },
                      ]}
                    >
                      <TabLabelRow
                        tab={tab}
                        color={color}
                        focused={focused}
                        bold={focused}
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
            style={styles.edgeAlignTop}
          >
            <EdgePeekTab
              side="right"
              label="FILTERS"
              height={CAPSULE_H}
              onPress={expandDiscoveryFilters}
            />
          </Animated.View>
        ) : showCartEdge ? (
          <Animated.View
            key="cart-edge"
            entering={SlideInRight.duration(280).easing(Easing.out(Easing.cubic))}
            exiting={SlideOutRight.duration(220).easing(Easing.in(Easing.cubic))}
            collapsable={false}
            style={styles.edgeAlignTop}
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
  /** Transparent absoluteFill must not use elevation — blocks sibling taps on Android. */
  hostNoElevation: {
    elevation: 0,
  },
  /** Full-bleed sheet host — connected to screen bottom; height set inline. */
  dock: {
    position: "absolute",
    overflow: "visible",
  },
  /** Elevate only the real dock chrome (not the full-screen host). */
  dockElevated: {
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  /** Invisible geometry reserved when cart/track owns footing. */
  dockPlaceholder: {
    position: "absolute",
    height: DOCK_H,
    overflow: "visible",
  },
  capsulePlaceholder: {
    width: "100%",
    height: DOCK_H,
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
  classicEdgeOnlyRow: {
    position: "absolute",
    left: 0,
    height: CAPSULE_H,
    flexDirection: "row",
    alignItems: "center",
    overflow: "visible",
  },
  capsuleWrap: {
    width: "100%",
    height: DOCK_H,
    overflow: "visible",
    zIndex: 1,
  },
  dockWithCartEdge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    overflow: "visible",
  },
  capsuleWrapInRow: {
    flex: 1,
    minWidth: 0,
    width: undefined,
  },
  edgeAlignTop: {
    alignSelf: "flex-start",
  },
  capsule: {
    width: "100%",
    height: DOCK_H,
    paddingHorizontal: CAPSULE_PAD_H,
    paddingTop: SHEET_TOP_EXTRA + CAPSULE_PAD_V,
    paddingBottom: CAPSULE_PAD_V,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  track: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: PILL_H,
    position: "relative",
    zIndex: 1,
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
    borderRadius: 25,
    overflow: "hidden",
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
