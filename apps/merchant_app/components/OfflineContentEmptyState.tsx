import { AppText as Text } from "@/components/AppText";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

const POPPINS = "Poppins_600SemiBold";
const LORA_BOLD = "Lora_700Bold";

export function RouterOfflineArt({ size = 120 }: { size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120" fill="none">
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
      <Path d="M38 22 L34 30 L40 30 L36 38" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M82 22 L86 30 L80 30 L84 38" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={28} y={70} width={64} height={28} rx={6} stroke="#FFFFFF" strokeWidth={3} />
      <Circle cx={42} cy={84} r={3} fill="#FFFFFF" />
      <Circle cx={54} cy={84} r={3} fill="#FFFFFF" />
      <Circle cx={66} cy={84} r={3} fill="#FFFFFF" />
      <Line x1={40} y1={70} x2={36} y2={52} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Line x1={80} y1={70} x2={84} y2={52} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={36} cy={50} r={3} fill="#FFFFFF" />
      <Circle cx={84} cy={50} r={3} fill="#FFFFFF" />
      <Path d="M60 52 V70" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

type Props = {
  onRetry: () => void;
  retrying?: boolean;
  /** Light theme for screens with white backgrounds; default dark (Zomato-style). */
  variant?: "dark" | "light";
};

/** Reusable offline empty state for the main content area (not full-screen). */
export function OfflineContentEmptyState({ onRetry, retrying = false, variant = "dark" }: Props) {
  const isDark = variant === "dark";
  return (
    <View style={[styles.root, isDark ? styles.rootDark : styles.rootLight]}>
      <View style={styles.center}>
        <RouterOfflineArt size={120} />
        <Text style={[styles.title, isDark ? styles.titleDark : styles.titleLight]}>No internet available</Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  rootDark: {
    backgroundColor: "#000000",
  },
  rootLight: {
    backgroundColor: "#FFFFFF",
  },
  center: {
    alignItems: "center",
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: POPPINS,
    textAlign: "center",
    marginTop: 4,
  },
  titleDark: {
    color: "#FFFFFF",
  },
  titleLight: {
    color: "#0F172A",
  },
  tryBtn: {
    marginTop: 4,
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
});
