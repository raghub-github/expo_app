import { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { AppText } from "@/components/AppText";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

export type VegModeTransitionKind = "on" | "off";

type Props = {
  kind: VegModeTransitionKind | null;
};

const RING = 120;
const RING_COLOR = "#86EFAC";
const PULSE_MS = 600;
const SCREEN_W = Dimensions.get("window").width;
/** Off rings start inside the screen and shrink toward the title. */
const OFF_START_SCALE = Math.min(2, Math.max(1.65, (SCREEN_W - 120) / RING));
const OFF_END_SCALE = 0.5;

/** How long the home screen should keep this overlay up. */
export function vegModeFlashMs(_kind: VegModeTransitionKind): number {
  return 2100;
}

function pulseToOne(duration: number, easing: (t: number) => number) {
  const show = () => withTiming(0, { duration: 1 });
  const step = () => withTiming(1, { duration, easing });
  return withSequence(show(), step(), show(), step(), show(), step());
}

function Ripple({ progress, delayScale = 1 }: { progress: SharedValue<number>; delayScale?: number }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: (1 - t) * 0.7,
      transform: [{ scale: (0.28 + t * 3.4) * delayScale }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

function RippleBurst() {
  const a = useSharedValue(1);
  const b = useSharedValue(1);
  const c = useSharedValue(1);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    a.value = pulseToOne(PULSE_MS, ease);
    b.value = withDelay(90, pulseToOne(PULSE_MS, ease));
    c.value = withDelay(180, pulseToOne(PULSE_MS, ease));
  }, [a, b, c]);

  return (
    <View style={styles.rippleHost} pointerEvents="none">
      <Ripple progress={c} />
      <Ripple progress={b} />
      <Ripple progress={a} />
    </View>
  );
}

function VegOnSplash() {
  const scope = useDietaryPreferenceStore((s) => s.storeScope);
  const badge = useSharedValue(0.72);
  const copy = useSharedValue(0);

  useEffect(() => {
    badge.value = withSpring(1, { damping: 12, stiffness: 220, mass: 0.7 });
    copy.value = withDelay(120, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [badge, copy]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, (badge.value - 0.72) / 0.28),
    transform: [{ scale: badge.value }],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: (1 - copy.value) * 8 }],
  }));

  const subtitle =
    scope === "pure_veg_only"
      ? "Pure Veg restaurants only"
      : "Explore veg dishes from all restaurants";

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.center}>
        <RippleBurst />
        <Animated.View style={[styles.badge, badgeStyle]}>
          <AppText style={styles.badgeLine} bold>
            100%
          </AppText>
          <AppText style={styles.badgeLine} bold>
            VEG
          </AppText>
        </Animated.View>
      </View>
      <Animated.View style={copyStyle}>
        <AppText style={styles.subtitle} bold>
          {subtitle}
        </AppText>
      </Animated.View>
    </View>
  );
}

function InwardRing({ progress, startScale }: { progress: SharedValue<number>; startScale: number }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    const scale = startScale - t * (startScale - OFF_END_SCALE);
    return {
      opacity: (1 - t) * 0.65,
      transform: [{ scale }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, styles.ringOff, style]} />;
}

function InwardBurst() {
  const a = useSharedValue(1);
  const b = useSharedValue(1);

  useEffect(() => {
    const ease = Easing.in(Easing.cubic);
    a.value = pulseToOne(PULSE_MS, ease);
    b.value = withDelay(110, pulseToOne(PULSE_MS, ease));
  }, [a, b]);

  return (
    <View style={styles.rippleHost} pointerEvents="none">
      <InwardRing progress={a} startScale={OFF_START_SCALE} />
      <InwardRing progress={b} startScale={OFF_START_SCALE * 0.78} />
    </View>
  );
}

function VegOffSplash() {
  return (
    <View style={styles.root} pointerEvents="none">
      <View style={styles.offStage}>
        <InwardBurst />
        <View style={styles.offCopy}>
          <AppText style={styles.offTitle} bold>
            Switching off
          </AppText>
          <AppText style={styles.offTitle} bold>
            Veg Mode for you
          </AppText>
        </View>
      </View>
    </View>
  );
}

/** Full-screen veg-mode flash — badge pop plus expanding rings. */
export function VegModeTransitionOverlay({ kind }: Props) {
  if (!kind) return null;
  return kind === "on" ? <VegOnSplash /> : <VegOffSplash />;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  center: {
    width: RING,
    height: RING,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  rippleHost: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: RING_COLOR,
  },
  ringOff: {
    borderWidth: 1,
    borderColor: "#F87171",
  },
  offStage: {
    width: "100%",
    height: RING,
    alignItems: "center",
    justifyContent: "center",
  },
  offCopy: {
    alignItems: "center",
  },
  badge: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLine: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.4,
    lineHeight: 24,
    textAlign: "center",
  },
  subtitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 22,
  },
  offTitle: {
    color: "#DC2626",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 26,
    marginTop: 2,
  },
});
