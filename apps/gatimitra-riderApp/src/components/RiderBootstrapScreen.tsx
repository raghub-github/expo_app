/**
 * Branded boot splash — mint background with wordmark (no launcher icon).
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
import * as SplashScreen from "expo-splash-screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const RIDER_SPLASH_BG = "#C4E8D1";
const TITLE = "#0F172A";
const SUBTITLE = "#115E59";
const ACCENT = "#EA580C";
const SPINNER = "#0F766E";
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
    SplashScreen.hideAsync().catch(() => {});
    onSplashReadyRef.current?.();
  }, []);

  const statusFallback =
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 44;
  const topBleed = Math.max(insets.top, statusFallback);
  const bottomBleed = Math.max(insets.bottom, 16);
  const spinnerBottom = bottomBleed + SPINNER_BOTTOM_GAP;

  return (
    <View
      style={[styles.root, { minHeight: height }]}
      accessibilityLabel="GatiMitra Rider loading"
      onLayout={handleSplashLayout}
    >
      <StatusBar hidden={false} style="dark" backgroundColor={RIDER_SPLASH_BG} translucent />
      <View
        pointerEvents="none"
        style={[styles.statusFill, { height: topBleed, backgroundColor: RIDER_SPLASH_BG }]}
      />
      <View style={styles.copy} pointerEvents="none">
        <Text style={styles.title}>GatiMitra - Rider</Text>
        <View style={styles.divider} />
        <Text style={styles.subtitle}>Moving India Forward</Text>
      </View>
      <ActivityIndicator
        style={[styles.spinner, { bottom: spinnerBottom }]}
        size="small"
        color={SPINNER}
      />
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
    backgroundColor: RIDER_SPLASH_BG,
  },
  statusFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  copy: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    zIndex: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: TITLE,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  divider: {
    width: "72%",
    maxWidth: 240,
    height: 2.5,
    backgroundColor: ACCENT,
    marginTop: 18,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: SUBTITLE,
    letterSpacing: 1.8,
    textAlign: "center",
    textTransform: "uppercase",
  },
  spinner: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 3,
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
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(15, 118, 110, 0.18)",
  },
  statusTitle: {
    color: "#115E59",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  statusSubtitle: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },
});
