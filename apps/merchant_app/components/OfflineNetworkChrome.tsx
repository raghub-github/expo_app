/**
 * Offline UX — red bottom row (mock) + optional full-screen “No internet” overlay.
 * System tray copy is handled in NetworkStatusContext (Zomato-style wording).
 */
import { useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "@/context/NetworkStatusContext";
import Svg, { Path, Circle, Line, Rect } from "react-native-svg";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const POPPINS = "Poppins_600SemiBold";
const RED_BAR = "#9F1239";

function RouterOfflineArt({ size = 120 }: { size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120" fill="none">
      {/* Plug */}
      <Path
        d="M48 28 V18 M72 28 V18 M52 18 H68"
        stroke="#FFFFFF"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M44 28 H76 V42 C76 48 70 52 60 52 C50 52 44 48 44 42 V28 Z"
        stroke="#FFFFFF"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* Lightning bolts */}
      <Path d="M38 22 L34 30 L40 30 L36 38" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M82 22 L86 30 L80 30 L84 38" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Router body */}
      <Rect x={28} y={70} width={64} height={28} rx={6} stroke="#FFFFFF" strokeWidth={3} />
      <Circle cx={42} cy={84} r={3} fill="#FFFFFF" />
      <Circle cx={54} cy={84} r={3} fill="#FFFFFF" />
      <Circle cx={66} cy={84} r={3} fill="#FFFFFF" />
      {/* Antennas */}
      <Line x1={40} y1={70} x2={36} y2={52} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Line x1={80} y1={70} x2={84} y2={52} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={36} cy={50} r={3} fill="#FFFFFF" />
      <Circle cx={84} cy={50} r={3} fill="#FFFFFF" />
      {/* Cable from plug to router */}
      <Path d="M60 52 V70" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** Full-screen black offline state (3rd reference) — shown when offline for a short while. */
function OfflineFullScreen({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <View style={styles.fullRoot} pointerEvents="auto">
      <View style={styles.fullCenter}>
        <RouterOfflineArt size={140} />
        <Text style={styles.fullTitle}>No internet available</Text>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.tryBtn, pressed && { opacity: 0.85 }]}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          {retrying ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.tryBtnText}>Try again</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function OfflineNetworkChrome() {
  const insets = useSafeAreaInsets();
  const { isOnline, ready, refresh } = useNetworkStatus();
  const [retrying, setRetrying] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const slide = useRef(new Animated.Value(80)).current;
  const offlineSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (isOnline) {
      offlineSinceRef.current = null;
      setShowFull(false);
      Animated.timing(slide, { toValue: 80, duration: 180, useNativeDriver: true }).start();
      return;
    }
    offlineSinceRef.current = Date.now();
    Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    // After ~1.2s offline, show the full-screen “No internet” state (mock).
    const t = setTimeout(() => {
      if (offlineSinceRef.current != null) setShowFull(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [isOnline, ready, slide]);

  const onRetry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  if (!ready || isOnline) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {showFull ? <OfflineFullScreen onRetry={onRetry} retrying={retrying} /> : null}

      <Animated.View
        style={[
          styles.barWrap,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            transform: [{ translateY: slide }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.bar}>
          <Ionicons name="cloud-offline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.barText}>No internet available</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 9990,
    elevation: 9990,
    justifyContent: "center",
    alignItems: "center",
  },
  fullCenter: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 18,
  },
  fullTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: POPPINS,
    textAlign: "center",
    marginTop: 8,
  },
  tryBtn: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    minWidth: 120,
    alignItems: "center",
  },
  tryBtnText: {
    color: "#0F172A",
    fontSize: 14,
    fontFamily: LORA_BOLD,
  },
  barWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    elevation: 9998,
  },
  bar: {
    backgroundColor: RED_BAR,
    minHeight: 36,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  barText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: LORA,
    letterSpacing: 0.2,
  },
});
