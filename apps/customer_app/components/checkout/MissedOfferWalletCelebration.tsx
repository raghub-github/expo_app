/**
 * Celebration overlay when user unlocks a missed offer via GatiCash at checkout.
 */

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";

const BRAND = GatiMitraColors.splashMint;
const BRAND_DARK = "#0F766E";

const CONFETTI_COLORS = ["#22C55E", "#3B82F6", "#FBBF24", "#F97316", "#A855F7", "#EC4899", BRAND, "#FFFFFF"];
const CONFETTI_COUNT = 36;

type Props = {
  visible: boolean;
  offerTitle: string;
  offerSavingsInr: number;
  walletAddInr: number;
  onDismiss: () => void;
};

function formatInr(value: number): string {
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

function ConfettiParticle({
  index,
  screenW,
  screenH,
}: {
  index: number;
  screenW: number;
  screenH: number;
}) {
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const startX = useMemo(
    () => (index / CONFETTI_COUNT) * screenW + (index % 7) * 10 - 24,
    [index, screenW]
  );
  const startY = useMemo(() => 20 + (index % 9) * 22, [index]);
  const isSquare = index % 3 === 0;
  const size = 5 + (index % 4);

  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    const delay = (index % 10) * 35;
    const drift = ((index % 9) - 4) * 32;
    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(screenH * 0.62, { duration: 1500 }),
        withTiming(screenH * 0.78, { duration: 450 })
      )
    );
    translateX.value = withDelay(delay, withTiming(drift, { duration: 1700 }));
    rotate.value = withDelay(delay, withTiming(360 * (index % 2 === 0 ? 1 : -1), { duration: 1700 }));
    opacity.value = withDelay(delay + 950, withTiming(0, { duration: 650 }));
  }, [index, screenH, translateY, translateX, opacity, rotate]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: startX,
          top: startY,
          width: size,
          height: isSquare ? size : size * 1.55,
          borderRadius: isSquare ? 2 : size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function SuccessHero() {
  const ringScale = useSharedValue(0.88);
  const ringOpacity = useSharedValue(0.55);
  const iconScale = useSharedValue(0.6);

  useEffect(() => {
    iconScale.value = withDelay(80, withSpring(1, { damping: 9, stiffness: 140 }));
    ringScale.value = withDelay(
      120,
      withRepeat(
        withSequence(withTiming(1.12, { duration: 900 }), withTiming(0.92, { duration: 900 })),
        -1,
        true
      )
    );
    ringOpacity.value = withDelay(
      120,
      withRepeat(
        withSequence(withTiming(0.18, { duration: 900 }), withTiming(0.42, { duration: 900 })),
        -1,
        true
      )
    );
  }, [iconScale, ringScale, ringOpacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <View style={styles.heroWrap}>
      <Animated.View style={[styles.heroRing, ringStyle]} />
      <Animated.View style={[styles.heroRingInner, ringStyle]} />
      <Animated.View style={iconStyle}>
        <LinearGradient colors={[BRAND, BRAND_DARK]} style={styles.heroCircle}>
          <Ionicons name="checkmark" size={42} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function RewardChip({
  icon,
  label,
  value,
  accent,
  delay,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(320)} style={[styles.chip, { borderColor: accent }]}>
      <View style={[styles.chipIconWrap, { backgroundColor: `${accent}18` }]}>{icon}</View>
      <CheckoutText style={styles.chipLabel}>{label}</CheckoutText>
      <CheckoutText style={[styles.chipValue, { color: accent }]}>{value}</CheckoutText>
    </Animated.View>
  );
}

export function MissedOfferWalletCelebration({
  visible,
  offerTitle,
  offerSavingsInr,
  walletAddInr,
  onDismiss,
}: Props) {
  const { width, height } = useWindowDimensions();
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onDismissRef.current(), 3000);
    return () => clearTimeout(timer);
  }, [visible]);

  const title = offerTitle.trim() || "Offer";
  const savings = formatInr(offerSavingsInr);
  const wallet = formatInr(walletAddInr);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss offer celebration"
        />

        {visible ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
              <ConfettiParticle key={i} index={i} screenW={width} screenH={height} />
            ))}
          </View>
        ) : null}

        <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
          <SuccessHero />

          <Animated.View entering={FadeInDown.delay(100).duration(300)}>
            <CheckoutText style={styles.congrats}>CONGRATULATIONS!</CheckoutText>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(320)} style={styles.titlePill}>
            <MaterialCommunityIcons name="tag-check" size={16} color={BRAND_DARK} />
            <CheckoutText style={styles.titlePillText} numberOfLines={2}>
              {title} unlocked
            </CheckoutText>
          </Animated.View>

          <View style={styles.chipsRow}>
            <RewardChip
              delay={220}
              icon={<MaterialCommunityIcons name="sale" size={18} color="#2563EB" />}
              label="You save"
              value={`₹${savings}`}
              accent="#2563EB"
            />
            <RewardChip
              delay={280}
              icon={<MaterialCommunityIcons name="wallet" size={18} color={BRAND_DARK} />}
              label="GatiCash"
              value={`+₹${wallet}`}
              accent={BRAND_DARK}
            />
          </View>

          <Animated.View entering={FadeIn.delay(340).duration(280)}>
            <CheckoutText style={styles.footerNote}>
              ₹{wallet} credited to wallet after you place this order
            </CheckoutText>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(8, 15, 30, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 22,
    alignItems: "center",
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  heroWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: BRAND,
  },
  heroRingInner: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#99F6E4",
  },
  heroCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  congrats: {
    fontSize: 21,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.8,
    textAlign: "center",
    marginBottom: 10,
  },
  titlePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDFA",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#99F6E4",
    marginBottom: 18,
    maxWidth: "100%",
  },
  titlePillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    flexShrink: 1,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  chip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  chipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  footerNote: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 4,
  },
});
