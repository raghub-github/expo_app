/**
 * Floating dual-dock bottom nav (GatiMitra light theme — not dark mode).
 * Main dock: Home, Orders, Catalog, Profile + Flow satellite to open the Flow hub.
 * Hub dock: Earnings, Insight, Review (scroll) + Home satellite to return.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  Modal,
  ScrollView,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import {
  GatiMitraMerchant,
  FONT_LORA,
  TAB_BAR_FLOATING_GAP,
} from "@/constants/theme";
import { useActiveTab } from "@/context/ActiveTabContext";
import { useProfileNav } from "@/context/ProfileNavContext";
import { hubTabFromPath, isHubPath } from "@/lib/merchantNavigation";
import { OffersPercentBadgeIcon } from "@/components/OffersPercentBadgeIcon";

const MAIN_TAB_ORDER = ["index", "orders", "menu", "profile"] as const;

const DOCK_CLIP_PADDING = 6;
const CAPSULE_RADIUS = 26;
/** Unified dock height — main capsule + Flow/Home satellite (reference partner app). */
const DOCK_BAR_HEIGHT = 52;
const SATELLITE_WIDTH = 52;
const ICON_SIZE = 20;
const LABEL_FONT_SIZE = 10;
const ICON_LABEL_GAP = 2;
/** Rounded pill behind active tab (icon + label together). */
const TAB_PILL_RADIUS = 999;
/** Blocks multi-tap stacking on Zone/Flow tabs (Offers push, Profile stack, dock switch). */
const DOCK_PRESS_DEBOUNCE_MS = 700;
const SAME_TAB_PRESS_DEBOUNCE_MS = 700;
const DOCK_SWITCH_OVERLAY_MS = 380;
const TAB_HIT_SLOP = { top: 8, bottom: 8, left: 6, right: 6 };

/** True when the profile stack root (index) is showing — not any pushed child route. */
function isProfileStackAtRoot(tabState: BottomTabBarProps["state"]): boolean {
  const profileRoute = tabState.routes.find((r) => r.name === "profile");
  const stack = profileRoute?.state;
  if (!stack || typeof stack.index !== "number") return true;
  const active = stack.routes[stack.index];
  const name = active?.name ?? "index";
  return name === "index";
}

type MainTabName = (typeof MAIN_TAB_ORDER)[number];
/** Zone dock — active tab pill (green). */
const TAB_ACTIVE_BG = GatiMitraMerchant.primary;
/** Flow hub dock — active tab pill (blue). Home satellite stays green. */
const HUB_TAB_ACTIVE_BG = GatiMitraMerchant.navy;
const TAB_ACTIVE_FG = "#FFFFFF";
const TAB_INACTIVE_FG = GatiMitraMerchant.tabInactive;

function useIsKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = () => setShown(true);
    const hide = () => setShown(false);
    const subs =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillShow", show),
            Keyboard.addListener("keyboardWillHide", hide),
          ]
        : [
            Keyboard.addListener("keyboardDidShow", show),
            Keyboard.addListener("keyboardDidHide", hide),
          ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return shown;
}

function isMainTab(name: string): name is MainTabName {
  return (MAIN_TAB_ORDER as readonly string[]).includes(name);
}

// Hub bottom bar: Earnings, Growth, Offers, Reviews (+ Complaints via Reviews toggle).
const HUB_TAB_ORDER = ["earnings", "growth", "offers", "reviews"] as const;
type HubTabName = (typeof HUB_TAB_ORDER)[number];

function HubGrowthIcon({ color }: { color: string }) {
  return (
    <View style={[styles.hubChartFrame, { borderColor: color }]}>
      <Ionicons name="stats-chart" size={15} color={color} />
    </View>
  );
}

function HubOffersIcon({ color, active }: { color: string; active?: boolean }) {
  return <OffersPercentBadgeIcon size={18} color={color} filled={active} />;
}

function TabCluster({
  active,
  compact,
  tone = "primary",
  children,
}: {
  active: boolean;
  compact?: boolean;
  /** primary = green (Zone tabs); navy = blue (Flow hub tabs). */
  tone?: "primary" | "navy";
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.tabCluster,
        compact && styles.tabClusterCompact,
        active && (tone === "navy" ? styles.tabClusterActiveNavy : styles.tabClusterActive),
      ]}
    >
      {children}
    </View>
  );
}

function DockSwitchPill({
  label,
  icon,
  onPress,
  variant,
  accessibilityLabel,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant: "flow" | "home";
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dockSwitchPill,
        variant === "home" ? styles.dockSwitchPillHome : styles.dockSwitchPillFlow,
        pressed && styles.pressed,
        GatiMitraMerchant.cursorPointer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={18} color={TAB_ACTIVE_FG} />
      <Text style={styles.dockSwitchLabel}>{label}</Text>
    </Pressable>
  );
}

function isHubTab(name: string): boolean {
  return (HUB_TAB_ORDER as readonly string[]).includes(name) || name === "complaints";
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { setActiveTab } = useActiveTab();
  const {
    returnRoute,
    setOpenProfileRootOnNextFocus,
    setLastProfileSlug,
    setReturnRoute,
    clearReturnRoute,
  } = useProfileNav();
  const bottomInset = insets.bottom;
  const keyboardShown = useIsKeyboardShown();
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const hideTabBarOnKeyboard = focusedOptions.tabBarHideOnKeyboard === true;

  const currentName = state.routes[state.index]?.name ?? "index";
  /** Profile opened from Flow hub (3-line menu) — keep hub dock visible. */
  const profileHubOverlay =
    currentName === "profile" && returnRoute != null && isHubPath(returnRoute);
  const overlayHubTab = profileHubOverlay ? hubTabFromPath(returnRoute) : null;
  /** Hide Zone/Flow dock on Profile nested screens unless opened as Flow overlay. */
  const profileInnerPage =
    currentName === "profile" && !isProfileStackAtRoot(state) && !profileHubOverlay;
  const packagingTipsPage = (pathname ?? "").includes("packaging-tips");
  const tabBarHidden =
    (hideTabBarOnKeyboard && keyboardShown) || profileInnerPage || packagingTipsPage;

  const [dock, setDock] = useState<"main" | "hub">(() =>
    isHubTab(currentName) ? "hub" : "main"
  );
  const lastMainRoute = useRef<MainTabName>(
    isMainTab(currentName) ? currentName : "index"
  );
  const [switchOverlay, setSwitchOverlay] = useState(false);
  const [switchKind, setSwitchKind] = useState<"flow" | "home">("flow");
  const switchOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (switchOverlayTimerRef.current) clearTimeout(switchOverlayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (profileHubOverlay) {
      setDock("hub");
      const hubTab = hubTabFromPath(returnRoute);
      if (hubTab) setActiveTab(hubTab);
      return;
    }
    if (isHubTab(currentName)) {
      setDock("hub");
      setActiveTab(currentName);
    } else if (isMainTab(currentName)) {
      setDock("main");
      lastMainRoute.current = currentName;
      setActiveTab(currentName);
    }
  }, [currentName, setActiveTab, profileHubOverlay, returnRoute]);

  const runDockSwitch = useCallback(
    (nextDock: "main" | "hub", kind: "flow" | "home", navigate: () => void) => {
      // Navigate on the same tick as the press: any pre-delay behind the full-screen
      // overlay swallows follow-up taps and reads as a dead button.
      setSwitchKind(kind);
      setSwitchOverlay(true);
      setDock(nextDock);
      navigate();
      if (switchOverlayTimerRef.current) clearTimeout(switchOverlayTimerRef.current);
      switchOverlayTimerRef.current = setTimeout(() => setSwitchOverlay(false), DOCK_SWITCH_OVERLAY_MS);
    },
    []
  );

  const navigateToMainTab = useCallback(
    (routeName: MainTabName) => {
      // Optimistic highlight first so Catalog/Home feel instant on tap.
      setActiveTab(routeName);
      lastMainRoute.current = routeName;
      // jumpTo switches tabs without stack push overhead.
      const tabNav = navigation as typeof navigation & {
        jumpTo?: (name: string) => void;
      };
      if (typeof tabNav.jumpTo === "function") {
        tabNav.jumpTo(routeName);
      } else {
        navigation.dispatch(CommonActions.navigate({ name: routeName } as never));
      }
    },
    [navigation, setActiveTab]
  );

  /** Match focused tab by route name (stable vs key during transitions / nested state). */
  const focusedRouteName = state.routes[state.index]?.name;

  const lastMainTabPressAt = useRef(0);
  const lastMainTabPressed = useRef<MainTabName | null>(null);

  const resetProfileToRoot = useCallback(() => {
    setLastProfileSlug(null);
    setOpenProfileRootOnNextFocus(true);
    router.replace("/(tabs)/profile");
  }, [router, setLastProfileSlug, setOpenProfileRootOnNextFocus]);

  const onPressMainTab = useCallback(
    (routeName: MainTabName, isActive: boolean) => {
      const now = Date.now();
      // Multi-tap must not stack Profile / Catalog nested screens.
      if (
        lastMainTabPressed.current === routeName &&
        now - lastMainTabPressAt.current < SAME_TAB_PRESS_DEBOUNCE_MS
      ) {
        return;
      }
      lastMainTabPressAt.current = now;
      lastMainTabPressed.current = routeName;

      const alreadyOnTab = isActive || focusedRouteName === routeName;
      const profileHasInnerPage = !isProfileStackAtRoot(state);

      if (routeName === "profile" && profileHasInnerPage) {
        resetProfileToRoot();
        if (!alreadyOnTab) {
          navigateToMainTab(routeName);
        }
        return;
      }

      if (alreadyOnTab) {
        // Re-tapping Catalog pops nested item screens once — ignore further taps in debounce.
        if (routeName === "menu") {
          router.replace("/(tabs)/menu" as never);
        }
        return;
      }

      navigateToMainTab(routeName);
    },
    [
      focusedRouteName,
      navigateToMainTab,
      resetProfileToRoot,
      router,
      state,
    ]
  );

  const lastHubTabPressAt = useRef(0);

  const goHub = useCallback(() => {
    if (dock === "hub") return;
    const now = Date.now();
    if (now - lastHubTabPressAt.current < DOCK_PRESS_DEBOUNCE_MS) return;
    lastHubTabPressAt.current = now;
    runDockSwitch("hub", "flow", () => {
      setActiveTab("earnings");
      navigation.dispatch(CommonActions.navigate({ name: "earnings" } as never));
    });
  }, [navigation, runDockSwitch, setActiveTab, dock]);

  const goMainDock = useCallback(() => {
    if (dock === "main" && !profileHubOverlay) return;
    const now = Date.now();
    if (now - lastHubTabPressAt.current < DOCK_PRESS_DEBOUNCE_MS) return;
    lastHubTabPressAt.current = now;
    const target = lastMainRoute.current;
    runDockSwitch("main", "home", () => {
      if (profileHubOverlay) clearReturnRoute();
      navigateToMainTab(target);
    });
  }, [navigateToMainTab, runDockSwitch, dock, profileHubOverlay, clearReturnRoute]);

  const orderedMain = MAIN_TAB_ORDER.map((name) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    return { route };
  }).filter(Boolean) as { route: (typeof state.routes)[0] }[];

  /** Same height as `(tabs)/_layout` tabBarStyle so this strip fills the slot — extra padding avoids clipping circles. */
  const tabSlotHeight = DOCK_BAR_HEIGHT + bottomInset + TAB_BAR_FLOATING_GAP + DOCK_CLIP_PADDING;

  // One root View: a Fragment would flatten Modal + bar beside the scene; Modal skips flex, so flex:1 on the bar split the screen with the tab scene (blank band over content).
  return (
    <View style={styles.tabBarRoot} pointerEvents="box-none">
      <Modal
        visible={switchOverlay}
        transparent
        animationType="fade"
        statusBarTranslucent
        {...Platform.select({
          ios: { presentationStyle: "fullScreen" as const },
          default: {},
        })}
      >
        <View
          style={[
            styles.switchFullPage,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.switchGlowLayer} pointerEvents="none">
            <LinearGradient
              colors={["rgba(186, 230, 253, 0.55)", "rgba(204, 251, 241, 0.4)", "rgba(255, 255, 255, 0)"]}
              locations={[0, 0.35, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.switchGlowGradient}
            />
            <View style={[styles.switchSparkle, styles.switchSparkle1]} />
            <View style={[styles.switchSparkle, styles.switchSparkle2]} />
            <View style={[styles.switchSparkle, styles.switchSparkle3]} />
          </View>

          <View style={styles.switchCenterColumn}>
            <LinearGradient
              colors={[GatiMitraMerchant.primaryLight, GatiMitraMerchant.primary, GatiMitraMerchant.primaryDark]}
              locations={[0, 0.45, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.switchIconGradient}
            >
              <Ionicons
                name={switchKind === "flow" ? "swap-horizontal" : "home"}
                size={38}
                color={TAB_ACTIVE_FG}
              />
            </LinearGradient>

            <View style={styles.switchTextBlock}>
              <Text style={styles.switchFullTitle}>
                {switchKind === "flow" ? "Switched to Flow" : "Switched to Zone"}
              </Text>
              <Text style={styles.switchFullLine}>
                {switchKind === "flow"
                  ? "You're now in Flow mode."
                  : "You're now in Zone mode."}
              </Text>
              <Text style={styles.switchFullSub}>
                {switchKind === "flow"
                  ? "Insights, earnings, and performance — track and manage them here."
                  : "Live orders, updates, and day-to-day operations — manage them here."}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      <View
        style={[
          styles.wrapper,
          {
            paddingBottom: bottomInset + TAB_BAR_FLOATING_GAP * 0.65,
            minHeight: tabBarHidden ? 0 : tabSlotHeight,
            backgroundColor: tabBarHidden ? "transparent" : GatiMitraMerchant.surfaceWarm,
            justifyContent: "flex-end",
          },
          tabBarHidden && styles.wrapperHidden,
        ]}
        pointerEvents="box-none"
      >
        {dock === "main" ? (
          <View style={styles.row} pointerEvents="box-none">
            <View style={styles.mainCapsule} collapsable={false}>
              {orderedMain.map(({ route }) => {
                const isActive = route.name === focusedRouteName;
                const { options } = descriptors[route.key];
                const label = options.title ?? route.name;
                const iconColor = isActive ? TAB_ACTIVE_FG : TAB_INACTIVE_FG;
                const iconElement = options.tabBarIcon?.({
                  focused: isActive,
                  color: iconColor,
                  size: ICON_SIZE,
                });
                return (
                  <Pressable
                    key={route.key}
                    onPress={() => onPressMainTab(route.name as MainTabName, isActive)}
                    hitSlop={TAB_HIT_SLOP}
                    style={({ pressed }) => [
                      styles.mainTab,
                      pressed && styles.pressed,
                      GatiMitraMerchant.cursorPointer,
                    ]}
                  >
                    <TabCluster active={isActive}>
                      <View style={styles.mainTabIconSlot}>{iconElement}</View>
                      <Text
                        style={[
                          styles.label,
                          isActive ? styles.labelActive : styles.labelInactive,
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </TabCluster>
                  </Pressable>
                );
              })}
            </View>

            <DockSwitchPill
              label="Flow"
              icon="swap-horizontal"
              onPress={goHub}
              variant="flow"
              accessibilityLabel="Open Flow hub"
            />
          </View>
        ) : (
          <View style={styles.row} pointerEvents="box-none">
            <DockSwitchPill
              label="Home"
              icon="home"
              onPress={goMainDock}
              variant="home"
              accessibilityLabel="Back to Home"
            />

            <View style={[styles.hubCapsule, styles.hubCapsuleWide]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hubScrollInner}
              >
                {HUB_TAB_ORDER.map((routeName) => {
                  const complaintsActive = focusedRouteName === "complaints";
                  const offersHubActive =
                    typeof pathname === "string" && pathname.includes("/profile/offers");
                  const isFocused =
                    profileHubOverlay && overlayHubTab
                      ? routeName === overlayHubTab
                      : routeName === "offers"
                        ? offersHubActive
                        : focusedRouteName === routeName ||
                          (routeName === "reviews" && complaintsActive);
                  const label =
                    routeName === "earnings"
                      ? "Earnings"
                      : routeName === "growth"
                        ? "Growth"
                        : routeName === "offers"
                          ? "Offers"
                          : complaintsActive
                            ? "Complaints"
                            : "Reviews";
                  return (
                    <Pressable
                      key={routeName}
                      onPress={() => {
                        const now = Date.now();
                        if (now - lastHubTabPressAt.current < DOCK_PRESS_DEBOUNCE_MS) return;
                        lastHubTabPressAt.current = now;

                        if (routeName === "offers") {
                          if (isFocused || (pathname ?? "").includes("/profile/offers")) {
                            return;
                          }
                          if (profileHubOverlay) clearReturnRoute();
                          router.replace("/(tabs)/profile/offers" as never);
                          setReturnRoute(pathname ?? "/(tabs)/earnings");
                          return;
                        }
                        if (isFocused) return;
                        if (profileHubOverlay) clearReturnRoute();
                        setActiveTab(routeName);
                        navigation.dispatch(CommonActions.navigate({ name: routeName } as never));
                      }}
                      hitSlop={TAB_HIT_SLOP}
                      style={({ pressed }) => [
                        styles.hubPillPress,
                        pressed && styles.pressed,
                        GatiMitraMerchant.cursorPointer,
                      ]}
                    >
                      <TabCluster active={isFocused} compact tone="navy">
                        <View style={styles.mainTabIconSlot}>
                          {routeName === "growth" ? (
                            <HubGrowthIcon color={isFocused ? TAB_ACTIVE_FG : TAB_INACTIVE_FG} />
                            ) : routeName === "offers" ? (
                              <HubOffersIcon
                                color={isFocused ? TAB_ACTIVE_FG : TAB_INACTIVE_FG}
                                active={isFocused}
                              />
                          ) : (
                            <Ionicons
                              name={
                                routeName === "earnings"
                                  ? "wallet-outline"
                                  : complaintsActive
                                    ? "warning-outline"
                                    : "star-outline"
                              }
                              size={ICON_SIZE}
                              color={isFocused ? TAB_ACTIVE_FG : TAB_INACTIVE_FG}
                            />
                          )}
                        </View>
                        <Text
                          style={[styles.label, isFocused ? styles.labelActive : styles.labelInactive]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </TabCluster>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  switchFullPage: {
    flex: 1,
    width: "100%",
    backgroundColor: GatiMitraMerchant.background,
  },
  switchGlowLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  switchGlowGradient: {
    position: "absolute",
    left: "-15%",
    right: "-15%",
    top: "18%",
    height: 360,
    borderRadius: 200,
    opacity: 0.95,
  },
  switchSparkle: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
  },
  switchSparkle1: { top: "24%", left: "18%" },
  switchSparkle2: { top: "32%", right: "22%" },
  switchSparkle3: { top: "28%", left: "72%" },
  switchCenterColumn: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  switchIconGradient: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  switchTextBlock: {
    maxWidth: 340,
    width: "100%",
    alignItems: "center",
  },
  switchFullTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    marginBottom: 12,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  switchFullLine: {
    fontSize: 17,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
    marginBottom: 10,
    lineHeight: 25,
    textAlign: "center",
  },
  switchFullSub: {
    fontSize: 15,
    fontWeight: "400",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 22,
    textAlign: "center",
  },
  // Tab bar slot is taller than the floating capsule; box-none lets scroll/taps pass
  // through the padded area above the dock (auto was swallowing bottom-of-list touches).
  tabBarRoot: {
    width: "100%",
    flexShrink: 0,
    flexGrow: 0,
    overflow: "visible",
  },
  wrapper: {
    width: "100%",
    paddingHorizontal: 12,
    overflow: "visible",
  },
  wrapperHidden: {
    height: 0,
    minHeight: 0,
    opacity: 0,
    overflow: "hidden",
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
    overflow: "visible",
  },
  mainCapsule: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 2,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 2,
    paddingHorizontal: 4,
    minHeight: DOCK_BAR_HEIGHT,
    overflow: "visible",
  },
  hubCapsule: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 2,
    paddingHorizontal: 4,
    minHeight: DOCK_BAR_HEIGHT,
    overflow: "visible",
  },
  hubCapsuleWide: {
    minWidth: 0,
  },
  hubScrollInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 2,
    flexGrow: 1,
    justifyContent: "space-around",
  },
  hubPillPress: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  hubChartFrame: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  mainTab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Active pill wraps icon + label (reference: Zomato partner dock). */
  tabCluster: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: TAB_PILL_RADIUS,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
    minWidth: 48,
  },
  tabClusterCompact: {
    paddingHorizontal: 7,
    minWidth: 54,
  },
  tabClusterActive: {
    backgroundColor: TAB_ACTIVE_BG,
    borderColor: TAB_ACTIVE_BG,
    borderRadius: TAB_PILL_RADIUS,
  },
  tabClusterActiveNavy: {
    backgroundColor: HUB_TAB_ACTIVE_BG,
    borderColor: HUB_TAB_ACTIVE_BG,
    borderRadius: TAB_PILL_RADIUS,
  },
  mainTabIconSlot: {
    marginBottom: ICON_LABEL_GAP,
    alignItems: "center",
    justifyContent: "center",
    height: 20,
  },
  label: {
    fontSize: LABEL_FONT_SIZE,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  labelActive: {
    color: TAB_ACTIVE_FG,
  },
  labelInactive: {
    color: TAB_INACTIVE_FG,
  },
  dockSwitchPill: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    width: SATELLITE_WIDTH,
    height: DOCK_BAR_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    gap: 1,
    overflow: "visible",
  },
  dockSwitchPillFlow: {
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: CAPSULE_RADIUS,
  },
  dockSwitchPillHome: {
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: CAPSULE_RADIUS,
  },
  dockSwitchLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: TAB_ACTIVE_FG,
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});
