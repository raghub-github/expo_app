/**
 * Branded boot splash — deep navy/slate (rider identity), not mint.
 * Tagline: Moving India Forward
 */
import { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RiderFonts } from "@/src/theme/fonts";

/** Deep navy → slate — matches Active Ride chrome, distinct from mint customer splash. */
const GRADIENT_TOP = "#0f172a";
const GRADIENT_MID = "#1e3a5f";
const GRADIENT_BOTTOM = "#0c4a6e";
const ACCENT = "#f97316";
const SPINNER_BOTTOM_GAP = 28;

type Props = {
  statusMessage?: string | null;
  onSplashReady?: () => void;
};

export function RiderBootstrapScreen({ statusMessage = null, onSplashReady }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const splashReadyFiredRef = useRef(false);
  const onSplashReadyRef = useRef(onSplashReady);
  onSplashReadyRef.current = onSplashReady;

  const handleSplashLayout = useCallback(() => {
    if (splashReadyFiredRef.current) return;
    splashReadyFiredRef.current = true;
    onSplashReadyRef.current?.();
  }, []);

  const statusFallback =
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 44;
  const topBleed = Math.max(insets.top, statusFallback);
  const bottomBleed = Math.max(insets.bottom, 16);
  const bleedHeight = height + topBleed + bottomBleed;
  const bleedTop = -topBleed;
  const spinnerBottom = bottomBleed + SPINNER_BOTTOM_GAP;

  return (
    <View
      style={[styles.root, { minHeight: height }]}
      accessibilityLabel="GatiMitra Rider loading"
      onLayout={handleSplashLayout}
    >
      <StatusBar hidden={false} style="light" backgroundColor="transparent" translucent />
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
      <View style={styles.logoLayer} pointerEvents="none">
        <Text style={styles.title}>GatiMitra</Text>
        <Text style={styles.riderLabel}>RIDER</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>MOVING INDIA FORWARD</Text>
        <ActivityIndicator
          style={[styles.spinner, { bottom: spinnerBottom }]}
          size="small"
          color="rgba(255,255,255,0.95)"
        />
      </View>
      {statusMessage ? (
        <View pointerEvents="none" style={[styles.statusDock, { bottom: spinnerBottom + 36 }]}>
          <View style={styles.statusRow}>
            <Text style={styles.statusTitle}>{statusMessage}</Text>
            <Text style={styles.statusSubtitle}>Please wait...</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
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
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  statusTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: RiderFonts.loraBold,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  statusSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontFamily: RiderFonts.loraBold,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },
  title: {
    fontSize: 44,
    fontFamily: RiderFonts.loraBold,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  riderLabel: {
    marginTop: 8,
    fontSize: 15,
    fontFamily: RiderFonts.loraBold,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 5,
    textAlign: "center",
  },
  divider: {
    width: "72%",
    maxWidth: 220,
    height: 2.5,
    backgroundColor: ACCENT,
    marginTop: 18,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: RiderFonts.loraBold,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 2.6,
    textAlign: "center",
  },
});
