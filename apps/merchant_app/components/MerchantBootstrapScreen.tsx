/**
 * Branded boot splash — solid darker teal canvas, centered Lora branding.
 * Tagline: Sell More · Earn More · Grow More
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LORA_BOLD = "Lora_700Bold";
const LORA_REGULAR = "Lora_400Regular";

/** Brighter brand teal — black branding for contrast. */
const CANVAS = "#0D9B8A";
const TITLE_COLOR = "#000000";
const SUBTITLE_COLOR = "#000000";
const RULE_COLOR = "rgba(0,0,0,0.35)";
const SPINNER_COLOR = "rgba(0,0,0,0.55)";
/** Status/nav bar colour while the splash owns the screen. */
export const MERCHANT_SPLASH_BG = CANVAS;
const SPINNER_BOTTOM_GAP = 28;
const EXIT_DURATION_MS = 280;

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
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const brandLift = useRef(new Animated.Value(10)).current;
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
    Animated.parallel([
      Animated.timing(brandOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(brandLift, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [brandOpacity, brandLift]);

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
      <StatusBar style="dark" backgroundColor={CANVAS} translucent={false} />
      <View
        pointerEvents="none"
        style={[styles.canvas, { top: bleedTop, height: bleedHeight, backgroundColor: CANVAS }]}
      />
      <View pointerEvents="none" style={styles.glow} />

      <View
        pointerEvents="none"
        style={[styles.statusFill, { height: topBleed, backgroundColor: CANVAS }]}
      />

      <Animated.View
        style={[
          styles.center,
          {
            opacity: brandOpacity,
            transform: [{ translateY: brandLift }],
          },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.title}>GatiMitra Partner</Text>
        <View style={styles.rule} />
        <Text style={styles.subtitle}>Sell More · Earn More · Grow More</Text>
        <ActivityIndicator
          style={[styles.spinner, { bottom: spinnerBottom }]}
          size="small"
          color={SPINNER_COLOR}
        />
      </Animated.View>

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
    backgroundColor: CANVAS,
  },
  inlineRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: CANVAS,
  },
  canvas: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.08)",
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
    fontSize: 36,
    fontWeight: "700",
    color: TITLE_COLOR,
    letterSpacing: 0.15,
    textAlign: "center",
  },
  rule: {
    width: 44,
    height: 2,
    borderRadius: 1,
    backgroundColor: RULE_COLOR,
    marginTop: 8,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: LORA_BOLD,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    color: SUBTITLE_COLOR,
    letterSpacing: 0.9,
    textAlign: "center",
    marginTop: 0,
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
    backgroundColor: "rgba(0,0,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
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
