import { useEffect, useRef, useCallback } from "react";
import { AppText } from "@/components/AppText";

import {
  ActivityIndicator,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { applyAndroidNavigationChrome } from "@/lib/androidEdgeToEdgeChrome";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const GRADIENT_TOP = "#5eead4";
const GRADIENT_BOTTOM = "#0d9488";
const DOOR_COLOR = "#0f766e";
/** Match gradient top so status bar blends with splash (never white). */
export const SPLASH_STATUS_BAR = GRADIENT_TOP;
/** Extra space above the system gesture / nav inset so the spinner never clips. */
const SPINNER_BOTTOM_GAP = 28;

function applySplashStatusBarChrome() {
  NativeStatusBar.setHidden(false, "none");
  if (Platform.OS === "android") {
    NativeStatusBar.setBarStyle("light-content", true);
    void applyAndroidNavigationChrome({ buttonStyle: "light" }).catch(() => {});
  }
}

export type GatiMitraBootstrapScreenProps = {
  /**
   * `root` — overlay on top of app; plays door exit when `appReady` becomes true.
   * `index` — inline full screen while resolving session (no door animation).
   */
  variant?: "root" | "index";
  /** When true (root only), door panels slide apart then `onExitComplete` runs. */
  appReady?: boolean;
  onExitComplete?: () => void;
  statusMessage?: string | null;
  /** Fired once the splash has laid out — used to hide the native splash early. */
  onSplashReady?: () => void;
};

export function GatiMitraBootstrapScreen({
  variant = "index",
  appReady = false,
  onExitComplete,
  statusMessage = null,
  onSplashReady,
}: GatiMitraBootstrapScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const leftX = useSharedValue(0);
  const rightX = useSharedValue(0);
  const exitStartedRef = useRef(false);
  const completedRef = useRef(false);
  const splashReadyFiredRef = useRef(false);
  const onExitRef = useRef(onExitComplete);
  onExitRef.current = onExitComplete;
  const onSplashReadyRef = useRef(onSplashReady);
  onSplashReadyRef.current = onSplashReady;

  const finishExit = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onExitRef.current?.();
  }, []);

  const handleSplashLayout = useCallback(() => {
    if (splashReadyFiredRef.current) return;
    splashReadyFiredRef.current = true;
    onSplashReadyRef.current?.();
  }, []);

  useEffect(() => {
    const chrome = useScreenChromeStore.getState();
    chrome.setBootstrapActive(true);
    chrome.setStatusBarBackground(SPLASH_STATUS_BAR, "light");
    chrome.setImmersiveStatusBarChrome(true);
    applySplashStatusBarChrome();
    return () => {
      const reset = useScreenChromeStore.getState();
      reset.setBootstrapActive(false);
      reset.resetStatusBarBackground();
    };
  }, []);

  useEffect(() => {
    if (variant !== "root" || !appReady || exitStartedRef.current) return;
    exitStartedRef.current = true;
    const travel = width * 0.52;
    const easing = Easing.bezier(0.22, 0.94, 0.36, 1);
    const duration = 820;
    leftX.value = withTiming(-travel, { duration, easing });
    rightX.value = withTiming(
      travel,
      { duration, easing },
      (finished) => {
        if (finished) {
          runOnJS(finishExit)();
        }
      }
    );
  }, [variant, appReady, width, leftX, rightX, finishExit]);

  const doorLeftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftX.value }],
  }));
  const doorRightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightX.value }],
  }));

  // Full-bleed under status / nav bars — never depend on a zero first-frame inset.
  const statusFallback =
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 44;
  const topBleed = Math.max(insets.top, statusFallback);
  const bottomBleed = Math.max(insets.bottom, 16);
  const bleedHeight = height + topBleed + bottomBleed;
  const bleedTop = -topBleed;
  const spinnerBottom = bottomBleed + SPINNER_BOTTOM_GAP;

  const showDoors = variant === "root";

  const rootStyle =
    variant === "root"
      ? [StyleSheet.absoluteFillObject, styles.overlayRoot]
      : [styles.inlineRoot, { minHeight: height }];

  return (
    <View
      style={rootStyle}
      accessibilityLabel="GatiMitra loading"
      onLayout={handleSplashLayout}
    >
      <StatusBar
        hidden={false}
        style="light"
        backgroundColor="transparent"
        translucent
      />
      <LinearGradient
        colors={[GRADIENT_TOP, GatiMitraColors.splashMint, GRADIENT_BOTTOM]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.gradient, { top: bleedTop, height: bleedHeight }]}
      />
      {/* Explicit mint strip under the status bar in case the OS paints an opaque bar. */}
      <View
        pointerEvents="none"
        style={[styles.statusFill, { height: topBleed, backgroundColor: GRADIENT_TOP }]}
      />
      {showDoors ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.door,
              styles.doorLeft,
              doorLeftStyle,
              { top: bleedTop, height: bleedHeight, width: width * 0.51, backgroundColor: DOOR_COLOR },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.door,
              styles.doorRight,
              doorRightStyle,
              { top: bleedTop, height: bleedHeight, width: width * 0.51, backgroundColor: DOOR_COLOR },
            ]}
          />
        </>
      ) : null}
      <View style={styles.logoLayer} pointerEvents="none">
        <AppText style={styles.title} bold>
          GatiMitra
        </AppText>
        <View style={styles.divider} />
        <AppText style={styles.subtitle} bold>
          CRAFTED FOR CONVENIENCE
        </AppText>
        <ActivityIndicator
          style={[styles.spinner, { bottom: spinnerBottom }]}
          size="small"
          color="rgba(255,255,255,0.9)"
        />
      </View>
      {statusMessage ? (
        <View
          pointerEvents="none"
          style={[styles.statusDock, { bottom: spinnerBottom + 36 }]}
        >
          <View style={styles.statusRow}>
            <AppText style={styles.statusTitle} bold>
              {statusMessage}
            </AppText>
            <AppText style={styles.statusSubtitle}>Please wait...</AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: GatiMitraColors.splashMint,
  },
  inlineRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: GatiMitraColors.splashMint,
  },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  statusFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  door: {
    position: "absolute",
    top: 0,
  },
  doorLeft: {
    left: 0,
  },
  doorRight: {
    right: 0,
  },
  logoLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    zIndex: 2,
  },
  spinner: {
    position: "absolute",
    alignSelf: "center",
  },
  statusDock: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 5,
  },
  statusRow: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(13, 148, 136, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  statusSubtitle: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    fontFamily: "Lora_400Regular",
    fontWeight: "400",
    textAlign: "center",
    marginTop: 4,
  },
  title: {
    fontSize: 40,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  divider: {
    width: "72%",
    maxWidth: 220,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.92)",
    marginTop: 20,
    marginBottom: 18,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: "rgba(255,255,255,0.94)",
    letterSpacing: 3.2,
    textAlign: "center",
  },
});
