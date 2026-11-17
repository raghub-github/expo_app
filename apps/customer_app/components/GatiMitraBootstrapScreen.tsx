/**
 * Branded launch cover — flat mint + bundled splash wordmark (Zomato stack).
 *
 * Typography is baked into splash PNGs (bold Lora) so cold start never races
 * expo-font. Painting "GatiMitra" as Text before Lora loads made Android fall
 * back to system sans — the thin/normal flash seen in production.
 *
 * Full-bleed `splash-brand.png` matches phone aspect; Android 12 native icon
 * uses the square sibling. No spinner — brand-only, then home + skeletons.
 */
import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import {
  Image,
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

/** Phone-aspect brand stack (flat mint + Lora Bold + hairline + tagline). */
const SPLASH_BRAND_IMAGE = require("../assets/images/splash-brand.png");

/** Solid brand fill — matches native splash / system chrome. */
export const SPLASH_STATUS_BAR = GatiMitraColors.splashMint;
/** Visual-only fade; parent force-dismisses — never block Home on Reanimated. */
const EXIT_MS = 90;

function applySplashStatusBarChrome() {
  NativeStatusBar.setHidden(false, "none");
  if (Platform.OS === "android") {
    // Light status icons on mint brand; dark nav buttons on the white system bar.
    NativeStatusBar.setBarStyle("light-content", true);
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
  /**
   * @deprecated Splash brand is a bundled PNG — never waits on expo-font.
   * Kept optional so older call sites do not break.
   */
  fontsReady?: boolean;
  /** Fired once the splash has laid out — used to hide the native splash early. */
  onSplashReady?: () => void;
};

export function GatiMitraBootstrapScreen({
  variant = "index",
  appReady = false,
  onExitComplete,
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
    // Immersive first (sets transparent), then mint + light icons for splash.
    // Reverse order used to leave dark icons on mint / sticky immersive chrome.
    chrome.setImmersiveStatusBarChrome(true);
    chrome.setStatusBarBackground(SPLASH_STATUS_BAR, "light");
    applySplashStatusBarChrome();
    return () => {
      const reset = useScreenChromeStore.getState();
      // Full chrome restore — immersive off + solid soft strip (never leave mint stuck).
      reset.setImmersiveStatusBarChrome(false);
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

  const brandBlock = (
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
      <Image
        source={SPLASH_BRAND_IMAGE}
        style={styles.fullBleedBrand}
        resizeMode="cover"
        fadeDuration={0}
        accessibilityIgnoresInvertColors
        accessibilityLabel="GatiMitra"
        onLoad={handleSplashLayout}
      />
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
  fullBleedBrand: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    zIndex: 2,
  },
});
