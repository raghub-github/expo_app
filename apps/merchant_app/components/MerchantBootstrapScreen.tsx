/**
 * Branded boot splash — deep merchant green into mint (Partner identity).
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
/** Deep partner green → mint, matching the Partner Control mark and brand primary. */
const GRADIENT_TOP = "#0B241C";
const GRADIENT_MID = "#14543F";
const GRADIENT_BOTTOM = "#2E9B6E";
const ACCENT = "#5DD9A8";
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
      <StatusBar style="light" backgroundColor={GRADIENT_TOP} translucent={false} />
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOTTOM]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.gradient, { top: bleedTop, height: bleedHeight }]}
      />
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
          color="rgba(255,255,255,0.95)"
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
    color: "#FFFFFF",
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
    color: "#FFFFFF",
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
    backgroundColor: "rgba(11, 36, 28, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  statusText: {
    fontFamily: LORA_BOLD,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statusSubtext: {
    fontFamily: LORA_REGULAR,
    marginTop: 4,
    textAlign: "center",
    fontSize: 12,
    color: "rgba(255,255,255,0.88)",
  },
});
