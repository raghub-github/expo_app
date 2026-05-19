/**
 * Floating dual-dock bottom nav (GatiMitra light theme — not dark mode).
 * Main dock: Home, Orders, Catalog, Profile + Flow satellite to open the Flow hub.
 * Hub dock: Earnings, Insight, Review (scroll) + Home satellite to return.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  Modal,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CommonActions } from "@react-navigation/native";
import {
  GatiMitraMerchant,
  TAB_BAR_HEIGHT,
  TAB_BAR_FLOATING_GAP,
} from "@/constants/theme";
import { useActiveTab } from "@/context/ActiveTabContext";
import { useProfileNav } from "@/context/ProfileNavContext";

const MAIN_TAB_ORDER = ["index", "orders", "menu", "profile"] as const;
type MainTabName = (typeof MAIN_TAB_ORDER)[number];

const ICON_SIZE = 22;
const LABEL_FONT_SIZE = 11;
const ICON_LABEL_GAP = 2;
const MAIN_TAB_PRESS_DEBOUNCE_MS = 450;

/** True when the profile stack is showing the home screen (index), not a pushed child route. */
function isProfileStackAtRoot(tabState: BottomTabBarProps["state"]): boolean {
  const profileRoute = tabState.routes.find((r) => r.name === "profile");
  const stack = profileRoute?.state;
  if (!stack || typeof stack.index !== "number") return true;
  if (stack.index > 0) return false;
  const first = stack.routes[0];
  const name = first?.name ?? "index";
  return name === "index";
}
/** Same active treatment for every main tab (matches Home): mint pill + white icon/label. */
const TAB_ACTIVE_BG = GatiMitraMerchant.primary;
const TAB_ACTIVE_FG = "#FFFFFF";
const TAB_INACTIVE_FG = GatiMitraMerchant.tabInactive;

const CAPSULE_RADIUS = 28;
const SATELLITE_SIZE = 56;

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

// Hub bottom bar shows these buttons only (Complaints is reachable via toggle inside Reviews screen).
const HUB_TAB_ORDER = ["earnings", "growth", "reviews"] as const;
type HubTabName = (typeof HUB_TAB_ORDER)[number];

function isHubTab(name: string): boolean {
  return (HUB_TAB_ORDER as readonly string[]).includes(name) || name === "complaints";
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setActiveTab } = useActiveTab();
  const { setOpenProfileRootOnNextFocus } = useProfileNav();
  const bottomInset = insets.bottom;
  const lastMainTabPressAt = useRef(0);
  const keyboardShown = useIsKeyboardShown();
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const hideTabBarOnKeyboard = focusedOptions.tabBarHideOnKeyboard === true;
  const tabBarHidden = hideTabBarOnKeyboard && keyboardShown;

  const currentName = state.routes[state.index]?.name ?? "index";
  const [dock, setDock] = useState<"main" | "hub">(() =>
    isHubTab(currentName) ? "hub" : "main"
  );
  const lastMainRoute = useRef<MainTabName>(
    isMainTab(currentName) ? currentName : "index"
  );
  const [switchOverlay, setSwitchOverlay] = useState(false);
  const [switchKind, setSwitchKind] = useState<"flow" | "home">("flow");

  useEffect(() => {
    const name = state.routes[state.index]?.name ?? "index";
    if (isHubTab(name)) {
      setDock("hub");
      setActiveTab(name);
    } else if (isMainTab(name)) {
      setDock("main");
      lastMainRoute.current = name;
      setActiveTab(name);
    }
  }, [state.index, state.routes, setActiveTab]);

  const runDockSwitch = useCallback(
    (nextDock: "main" | "hub", kind: "flow" | "home", navigate: () => void) => {
      setSwitchKind(kind);
      setSwitchOverlay(true);
      const delay = Platform.OS === "web" ? 180 : 260;
      // Keep this short: a long full-screen overlay can feel like the Flow/Home buttons "disappeared".
      const messageMs = 450;
      setTimeout(() => {
        setDock(nextDock);
        navigate();
        setTimeout(() => setSwitchOverlay(false), messageMs);
      }, delay);
    },
    []
  );

  const navigateToMainTab = useCallback(
    (routeName: MainTabName) => {
      setActiveTab(routeName);
      navigation.dispatch(CommonActions.navigate({ name: routeName } as never));
      lastMainRoute.current = routeName;
    },
    [navigation, setActiveTab]
  );

  const onPressMainTab = useCallback(
    (routeName: MainTabName, isActive: boolean) => {
      const now = Date.now();
      if (now - lastMainTabPressAt.current < MAIN_TAB_PRESS_DEBOUNCE_MS) return;
      lastMainTabPressAt.current = now;

      if (isActive) {
        if (routeName === "profile" && !isProfileStackAtRoot(state)) {
          setOpenProfileRootOnNextFocus(true);
          router.replace("/(tabs)/profile");
        }
        return;
      }

      navigateToMainTab(routeName);
    },
    [navigateToMainTab, state, router, setOpenProfileRootOnNextFocus]
  );

  const lastHubTabPressAt = useRef(0);

  const goHub = useCallback(() => {
    const now = Date.now();
    if (now - lastHubTabPressAt.current < MAIN_TAB_PRESS_DEBOUNCE_MS) return;
    lastHubTabPressAt.current = now;
    if (dock === "hub") return;
    runDockSwitch("hub", "flow", () => {
      setActiveTab("earnings");
      navigation.dispatch(CommonActions.navigate({ name: "earnings" } as never));
    });
  }, [navigation, runDockSwitch, setActiveTab, dock]);

  const goMainDock = useCallback(() => {
    const now = Date.now();
    if (now - lastHubTabPressAt.current < MAIN_TAB_PRESS_DEBOUNCE_MS) return;
    lastHubTabPressAt.current = now;
    if (dock === "main") return;
    const target = lastMainRoute.current;
    runDockSwitch("main", "home", () => {
      navigateToMainTab(target);
    });
  }, [navigateToMainTab, runDockSwitch, dock]);

  const orderedMain = MAIN_TAB_ORDER.map((name) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    return { route };
  }).filter(Boolean) as { route: (typeof state.routes)[0] }[];

  /** Match focused tab by route name (stable vs key during transitions / nested state). */
  const focusedRouteName = state.routes[state.index]?.name;
  /** Same height as `(tabs)/_layout` tabBarStyle so this strip fills the slot — no default grey “plate” behind the pill. */
  const tabSlotHeight = TAB_BAR_HEIGHT + bottomInset + TAB_BAR_FLOATING_GAP;

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
        pointerEvents={tabBarHidden ? "none" : "auto"}
      >
        {dock === "main" ? (
          <View style={styles.row}>
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
                    style={({ pressed }) => [
                      styles.mainTab,
                      pressed && styles.pressed,
                      GatiMitraMerchant.cursorPointer,
                    ]}
                  >
                    <View
                      style={[
                        styles.mainTabClusterBase,
                        isActive && styles.mainTabClusterActive,
                      ]}
                    >
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
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={goHub}
              style={({ pressed }) => [
                styles.satellite,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open earnings (Flow)"
            >
              <Ionicons name="swap-horizontal" size={22} color={TAB_ACTIVE_FG} />
              <Text style={styles.satelliteLabel}>Flow</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <View style={[styles.hubCapsule, styles.hubCapsuleWide]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hubScrollInner}
              >
                {HUB_TAB_ORDER.map((routeName) => {
                  const complaintsActive = focusedRouteName === "complaints";
                  const isFocused =
                    focusedRouteName === routeName ||
                    (routeName === "reviews" && complaintsActive);
                  const label =
                    routeName === "earnings"
                      ? "Earnings"
                      : routeName === "growth"
                        ? "Growth"
                        : complaintsActive
                          ? "Complaints"
                          : "Reviews";
                  const iconName =
                    routeName === "earnings"
                      ? ("wallet-outline" as const)
                      : routeName === "growth"
                        ? ("trending-up-outline" as const)
                        : complaintsActive
                          ? ("warning-outline" as const)
                          : ("star-outline" as const);
                  return (
                    <Pressable
                      key={routeName}
                      onPress={() => {
                        const now = Date.now();
                        if (now - lastHubTabPressAt.current < MAIN_TAB_PRESS_DEBOUNCE_MS) return;
                        lastHubTabPressAt.current = now;
                        if (isFocused) return;
                        setActiveTab(routeName);
                        navigation.dispatch(CommonActions.navigate({ name: routeName } as never));
                      }}
                      style={({ pressed }) => [
                        styles.hubPillPress,
                        pressed && styles.pressed,
                        GatiMitraMerchant.cursorPointer,
                      ]}
                    >
                      <View
                        style={[
                          styles.mainTabClusterBase,
                          styles.hubMiniPill,
                          isFocused && styles.mainTabClusterActive,
                        ]}
                      >
                        <View style={styles.mainTabIconSlot}>
                          <Ionicons
                            name={iconName}
                            size={ICON_SIZE}
                            color={isFocused ? TAB_ACTIVE_FG : TAB_INACTIVE_FG}
                          />
                        </View>
                        <Text
                          style={[styles.label, isFocused ? styles.labelActive : styles.labelInactive]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              onPress={goMainDock}
              style={({ pressed }) => [
                styles.satelliteHome,
                pressed && styles.pressed,
                GatiMitraMerchant.cursorPointer,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
            >
              <Ionicons name="home" size={22} color={TAB_ACTIVE_FG} />
              <Text style={styles.satelliteLabel}>Home</Text>
            </Pressable>
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
  tabBarRoot: {
    width: "100%",
    flexShrink: 0,
    flexGrow: 0,
  },
  wrapper: {
    width: "100%",
    paddingHorizontal: 12,
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
    alignItems: "flex-end",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  mainCapsule: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: TAB_BAR_HEIGHT - 4,
    overflow: "hidden",
  },
  hubCapsule: {
    // Do not stretch to full width when only 3 hub pills.
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: TAB_BAR_HEIGHT - 4,
    overflow: "hidden",
  },
  hubCapsuleWide: {
    minWidth: 0,
  },
  hubScrollInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  hubPillPress: {
    flexShrink: 0,
  },
  hubMiniPill: {
    paddingHorizontal: 12,
    minWidth: 72,
  },
  mainTab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Icon+label cluster: intrinsic width only, centered in the tab slot.
   * Full-width green (old stretch) looked like a sharp rectangle and changed shape per tab — same pill for everyone.
   */
  mainTabClusterBase: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  mainTabClusterActive: {
    backgroundColor: TAB_ACTIVE_BG,
  },
  mainTabIconSlot: {
    marginBottom: ICON_LABEL_GAP,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: LABEL_FONT_SIZE,
    fontWeight: "600",
  },
  labelActive: {
    color: TAB_ACTIVE_FG,
  },
  labelInactive: {
    color: TAB_INACTIVE_FG,
  },
  satellite: {
    flexShrink: 0,
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    borderRadius: SATELLITE_SIZE / 2,
    backgroundColor: GatiMitraMerchant.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  satelliteHome: {
    flexShrink: 0,
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    borderRadius: SATELLITE_SIZE / 2,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  satelliteLabel: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});
