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

/** Solid brand fill — matches native splash / system chrome. */
export const SPLASH_STATUS_BAR = GatiMitraColors.splashMint;
/** Extra space above the system gesture / nav inset so the spinner never clips. */
const SPINNER_BOTTOM_GAP = 28;
const EXIT_MS = 420;

function applySplashStatusBarChrome() {
  NativeStatusBar.setHidden(false, "none");
  if (Platform.OS === "android") {
    NativeStatusBar.setBarStyle("light-content", true);
    void applyAndroidNavigationChrome({ buttonStyle: "dark" }).catch(() => {});
  }
}

export type GatiMitraBootstrapScreenProps = {
  /**
   * `root` — overlay on top of app; fades out when `appReady` becomes true.
   * `index` — inline full screen while resolving session (no exit animation).
   */
  variant?: "root" | "index";
  /** When true (root only), brand layer fades then `onExitComplete` runs. */
  appReady?: boolean;
  onExitComplete?: () => void;
  statusMessage?: string | null;
  /** Hide native splash only after Lora is loaded — otherwise wordmark flashes thin system text. */
  fontsReady?: boolean;
  /** Fired once the splash has laid out — used to hide the native splash early. */
  onSplashReady?: () => void;
};

export function GatiMitraBootstrapScreen({
  variant = "index",
  appReady = false,
  onExitComplete,
  statusMessage = null,
  fontsReady = true,
  onSplashReady,
}: GatiMitraBootstrapScreenProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const opacity = useSharedValue(1);
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
    if (!fontsReady) return;
    if (splashReadyFiredRef.current) return;
    splashReadyFiredRef.current = true;
    onSplashReadyRef.current?.();
  }, [fontsReady]);

  useEffect(() => {
    if (!fontsReady) return;
    handleSplashLayout();
  }, [fontsReady, handleSplashLayout]);

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
    const easing = Easing.bezier(0.22, 0.94, 0.36, 1);
    // Fade only — never scale up (that read as small → big).
    opacity.value = withTiming(0, { duration: EXIT_MS, easing }, (finished) => {
      if (finished) {
        runOnJS(finishExit)();
      }
    });
  }, [variant, appReady, opacity, finishExit]);

  const exitStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const statusFallback =
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 44;
  const topBleed = Math.max(insets.top, statusFallback);
  const bottomBleed = Math.max(insets.bottom, 16);
  const spinnerBottom = bottomBleed + SPINNER_BOTTOM_GAP;

  const content = (
    <>
      <StatusBar
        hidden={false}
        style="light"
        backgroundColor="transparent"
        translucent
      />
      <View
        pointerEvents="none"
        style={[styles.statusFill, { height: topBleed, backgroundColor: SPLASH_STATUS_BAR }]}
      />
      <View style={styles.logoLayer} pointerEvents="none">
        {fontsReady ? (
          <>
            <AppText style={styles.title} bold numberOfLines={1}>
              GatiMitra
            </AppText>
            <AppText style={styles.subtitle} bold numberOfLines={1}>
              CRAFTED FOR CONVENIENCE
            </AppText>
          </>
        ) : null}
        <ActivityIndicator
          style={[styles.spinner, { bottom: spinnerBottom }]}
          size="small"
          color="rgba(255,255,255,0.88)"
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
    </>
  );

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
      {variant === "root" ? (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, styles.panel, exitStyle]}
        >
          {content}
        </Animated.View>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: "transparent",
  },
  inlineRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: GatiMitraColors.splashMint,
  },
  panel: {
    backgroundColor: GatiMitraColors.splashMint,
  },
  statusFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  logoLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
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
    backgroundColor: "rgba(15, 118, 110, 0.28)",
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
    fontSize: 64,
    lineHeight: 72,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.8,
    textAlign: "center",
    width: "100%",
  },
  subtitle: {
    marginTop: 16,
    fontSize: 12,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 3.4,
    textAlign: "center",
    width: "100%",
  },
});
