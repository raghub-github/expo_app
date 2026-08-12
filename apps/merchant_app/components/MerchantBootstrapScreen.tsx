/**
 * Branded boot splash — soft mint canvas, plain centered copy.
 * Tagline: Sell More . Earn More . Grow More
 */
import { useCallback, useEffect, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LORA_BOLD = "Lora_700Bold";
const LORA_REGULAR = "Lora_400Regular";

/** Soft mint-white canvas. */
const GRADIENT_TOP = "#F6FBF9";
const GRADIENT_MID = "#EFF8F4";
const GRADIENT_BOTTOM = "#E3F2EB";
const ACCENT = "#14B8A6";
const TITLE_COLOR = "#0F172A";
const SUBTITLE_COLOR = "#334155";
/** Status/nav bar colour while the splash owns the screen. */
export const MERCHANT_SPLASH_BG = GRADIENT_TOP;
const SPINNER_BOTTOM_GAP = 28;
const EXIT_DURATION_MS = 420;

type Props = {
  /**
   * `root` — overlay above the app; fades out once `appReady` turns true.
   * `index` — inline full screen while a session/store is resolving.
   */
  variant?: "root" | "index";
  /** Root only: start the fade-out, then call `onExitComplete`. */
  appReady?: boolean;
  onExitComplete?: () => void;
  statusMessage?: string | null;
  /** Fired after first layout — used to hide the native splash. */
  onSplashReady?: () => void;
};

export function MerchantBootstrapScreen({
  variant = "index",
  appReady = false,
  onExitComplete,
  statusMessage = null,
  onSplashReady,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;
  const splashReadyFiredRef = useRef(false);
  const exitStartedRef = useRef(false);
  const completedRef = useRef(false);
  const onSplashReadyRef = useRef(onSplashReady);
  onSplashReadyRef.current = onSplashReady;
  const onExitRef = useRef(onExitComplete);
  onExitRef.current = onExitComplete;

  const handleSplashLayout = useCallback(() => {
    if (splashReadyFiredRef.current) return;
    splashReadyFiredRef.current = true;
    onSplashReadyRef.current?.();
  }, []);

  useEffect(() => {
    if (variant !== "root" || !appReady || exitStartedRef.current) return;
    exitStartedRef.current = true;
    Animated.timing(fade, {
      toValue: 0,
      duration: EXIT_DURATION_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || completedRef.current) return;
      completedRef.current = true;
      onExitRef.current?.();
    });
  }, [variant, appReady, fade]);

  const statusFallback =
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 44;
  const topBleed = Math.max(insets.top, statusFallback);
  const bottomBleed = Math.max(insets.bottom, 16);
  const bleedHeight = height + topBleed + bottomBleed;
  const bleedTop = -topBleed;
  const spinnerBottom = bottomBleed + SPINNER_BOTTOM_GAP;

  const rootStyle =
    variant === "root"
      ? [StyleSheet.absoluteFillObject, styles.overlayRoot, { opacity: fade }]
      : [styles.inlineRoot, { minHeight: height }];

  return (
    <Animated.View
      style={rootStyle}
      accessibilityLabel="GatiMitra Partner loading"
      onLayout={handleSplashLayout}
    >
      <StatusBar style="dark" backgroundColor={GRADIENT_TOP} translucent={false} />
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOTTOM]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { top: bleedTop, height: bleedHeight }]}
      />
      <LinearGradient
        colors={["rgba(22,163,74,0.10)", "rgba(22,163,74,0)", "rgba(30,58,95,0.06)"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.gradient, { top: bleedTop, height: bleedHeight }]}
        pointerEvents="none"
      />

      <View pointerEvents="none" style={[styles.blob, styles.blobTopRight]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBottomLeft]} />
      <View pointerEvents="none" style={[styles.ring, styles.ringOuter]} />
      <View pointerEvents="none" style={[styles.ring, styles.ringInner]} />

      <View
        pointerEvents="none"
        style={[styles.statusFill, { height: topBleed, backgroundColor: GRADIENT_TOP }]}
      />

      <View style={styles.center} pointerEvents="none">
        <Text style={styles.title}>GatiMitra Partner</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Sell More . Earn More . Grow More</Text>
        <ActivityIndicator
          style={[styles.spinner, { bottom: spinnerBottom }]}
          size="small"
          color={ACCENT}
        />
      </View>

      {statusMessage ? (
        <View
          pointerEvents="none"
          style={[styles.statusDock, { bottom: spinnerBottom + 36 }]}
        >
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>{statusMessage}</Text>
            <Text style={styles.statusSubtext}>Please wait...</Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: GRADIENT_TOP,
  },
  inlineRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: GRADIENT_TOP,
  },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  blob: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(22, 163, 74, 0.07)",
  },
  blobTopRight: {
    width: 220,
    height: 220,
    top: "8%",
    right: -70,
  },
  blobBottomLeft: {
    width: 180,
    height: 180,
    bottom: "14%",
    left: -50,
    backgroundColor: "rgba(30, 58, 95, 0.05)",
  },
  ring: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 1,
  },
  ringOuter: {
    width: 320,
    height: 320,
    top: "22%",
    alignSelf: "center",
    left: "50%",
    marginLeft: -160,
    borderColor: "rgba(22, 163, 74, 0.08)",
  },
  ringInner: {
    width: 260,
    height: 260,
    top: "26%",
    alignSelf: "center",
    left: "50%",
    marginLeft: -130,
    borderColor: "rgba(30, 58, 95, 0.06)",
  },
  statusFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    zIndex: 2,
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 34,
    fontWeight: "700",
    color: TITLE_COLOR,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  divider: {
    width: "76%",
    maxWidth: 260,
    height: 2,
    backgroundColor: ACCENT,
    marginTop: 20,
    marginBottom: 18,
  },
  subtitle: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    color: SUBTITLE_COLOR,
    letterSpacing: 1.3,
    textAlign: "center",
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
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  statusText: {
    fontFamily: LORA_BOLD,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: TITLE_COLOR,
  },
  statusSubtext: {
    fontFamily: LORA_REGULAR,
    marginTop: 4,
    textAlign: "center",
    fontSize: 12,
    color: SUBTITLE_COLOR,
  },
});
