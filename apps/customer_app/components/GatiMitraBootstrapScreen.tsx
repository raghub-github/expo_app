import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { startupMeasure } from "@/lib/startupPerf";

/** Solid brand fill — matches native splash / system chrome. */
export const SPLASH_STATUS_BAR = GatiMitraColors.splashMint;
/** Visual-only fade; parent force-dismisses — never block Home on Reanimated. */
const EXIT_MS = 90;

function applySplashStatusBarChrome() {
  NativeStatusBar.setHidden(false, "none");
  if (Platform.OS === "android") {
    NativeStatusBar.setBarStyle("dark-content", true);
    void applyAndroidNavigationChrome({ buttonStyle: "dark" }).catch(() => {});
  }
}

export type GatiMitraBootstrapScreenProps = {
  /**
   * `root` — overlay on top of app; fades out when `appReady` becomes true.
   * `index` — lightweight branded hold while auth still hydrates after splash deadline.
   */
  variant?: "root" | "index";
  /** When true (root only), brand layer fades then `onExitComplete` runs. */
  appReady?: boolean;
  onExitComplete?: () => void;
  /** @deprecated Unused. */
  statusMessage?: string | null;
  /** Preferred brand fonts loaded — apply Lora when true; still paint brand immediately. */
  fontsReady?: boolean;
  /** Fired once the splash has laid out — used to hide the native splash early. */
  onSplashReady?: () => void;
};

export function GatiMitraBootstrapScreen({
  variant = "index",
  appReady = false,
  onExitComplete,
  fontsReady = true,
  onSplashReady,
}: GatiMitraBootstrapScreenProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const opacity = useSharedValue(1);
  const exitStartedRef = useRef(false);
  const completedRef = useRef(false);
  const splashReadyFiredRef = useRef(false);
  const brandingLoggedRef = useRef(false);
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
    if (!brandingLoggedRef.current && variant === "root") {
      brandingLoggedRef.current = true;
      startupMeasure("branding_visible", "process_start");
      startupMeasure("branding_subtitle_visible", "process_start");
    }
    onSplashReadyRef.current?.();
  }, [variant]);

  useEffect(() => {
    handleSplashLayout();
  }, [handleSplashLayout]);

  useEffect(() => {
    const chrome = useScreenChromeStore.getState();
    chrome.setBootstrapActive(true);
    chrome.setStatusBarBackground(SPLASH_STATUS_BAR, "dark");
    chrome.setImmersiveStatusBarChrome(true);
    applySplashStatusBarChrome();
    return () => {
      const reset = useScreenChromeStore.getState();
      reset.setBootstrapActive(false);
      reset.resetStatusBarBackground();
      if (exitStartedRef.current && !completedRef.current) {
        completedRef.current = true;
        onExitRef.current?.();
      }
    };
  }, []);

  // Layout-phase exit — must not wait for useEffect after Home's heavy work.
  useLayoutEffect(() => {
    if (variant !== "root" || !appReady || exitStartedRef.current || completedRef.current) {
      return;
    }
    exitStartedRef.current = true;
    // Cosmetic fade only — parent useLayoutEffect owns hard dismiss.
    opacity.value = withTiming(0, { duration: EXIT_MS });
    finishExit();
  }, [variant, appReady, opacity, finishExit]);

  const exitStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const statusFallback =
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 44;
  const topBleed = Math.max(insets.top, statusFallback);
  const spinnerBottom = Math.max(insets.bottom, 12) + 28;

  const titleStyle = fontsReady
    ? styles.title
    : [styles.title, styles.titleFallback];
  const subtitleStyle = fontsReady
    ? styles.subtitle
    : [styles.subtitle, styles.subtitleFallback];

  const brandBlock = (
    <>
      <StatusBar
        hidden={false}
        style="dark"
        backgroundColor="transparent"
        translucent
      />
      <View
        pointerEvents="none"
        style={[styles.statusFill, { height: topBleed, backgroundColor: SPLASH_STATUS_BAR }]}
      />
      <View style={styles.logoLayer} pointerEvents="none">
        <AppText style={titleStyle} bold numberOfLines={1}>
          GatiMitra
        </AppText>
        <AppText style={subtitleStyle} bold numberOfLines={1}>
          CRAFTED FOR CONVENIENCE
        </AppText>
      </View>
      <View
        pointerEvents="none"
        style={[styles.spinnerDock, { bottom: spinnerBottom }]}
      >
        <ActivityIndicator
          size="small"
          color="#000000"
          accessibilityLabel="Loading"
        />
      </View>
    </>
  );

  // Root = branded splash. Index = mint-only soft hold under root (no duplicate wordmark).
  const content =
    variant === "root" ? (
      brandBlock
    ) : (
      <>
        <StatusBar
          hidden={false}
          style="dark"
          backgroundColor="transparent"
          translucent
        />
        <View
          pointerEvents="none"
          style={[styles.statusFill, { height: topBleed, backgroundColor: SPLASH_STATUS_BAR }]}
        />
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
    paddingHorizontal: 12,
    zIndex: 2,
  },
  spinnerDock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  title: {
    fontSize: 54,
    lineHeight: 62,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: "#000000",
    letterSpacing: -0.8,
    textAlign: "center",
    width: "100%",
    maxWidth: 380,
  },
  titleFallback: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  },
  subtitle: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: "#000000",
    letterSpacing: 0.8,
    textAlign: "center",
    alignSelf: "center",
    maxWidth: 280,
  },
  subtitleFallback: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  },
});
