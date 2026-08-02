/**
 * Gmitra-style confetti + success modal when a coupon is applied on checkout.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { formatCheckoutSavingsRupees } from "@/lib/checkoutAppliedSavings";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  FadeIn,
} from "react-native-reanimated";

const CONFETTI_COLORS = [
  "#E23744",
  "#FF6B9D",
  "#8B5CF6",
  "#3B82F6",
  "#22C55E",
  "#FBBF24",
  "#F97316",
  "#14b8a6",
];
const CONFETTI_COUNT = 42;

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
  const startX = useMemo(() => (index / CONFETTI_COUNT) * screenW + (index % 7) * 8 - 20, [index, screenW]);
  const startY = useMemo(() => 40 + (index % 11) * 18, [index]);
  const isSquare = index % 3 === 0;
  const size = 5 + (index % 5);

  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    const delay = (index % 12) * 40;
    const drift = ((index % 9) - 4) * 28;
    translateY.value = withDelay(
      delay,
      withSequence(withTiming(screenH * 0.55, { duration: 1400 }), withTiming(screenH * 0.75, { duration: 500 }))
    );
    translateX.value = withDelay(delay, withTiming(drift, { duration: 1600 }));
    rotate.value = withDelay(delay, withTiming(360 * (index % 2 === 0 ? 1 : -1), { duration: 1600 }));
    opacity.value = withDelay(delay + 900, withTiming(0, { duration: 700 }));
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
          height: isSquare ? size : size * 1.6,
          borderRadius: isSquare ? 2 : size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function CheckoutConfettiOverlay({ visible }: { visible: boolean }) {
  const { width, height } = useWindowDimensions();
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <ConfettiParticle key={i} index={i} screenW={width} screenH={height} />
      ))}
    </View>
  );
}

export type CouponApplyCelebrationProps = {
  visible: boolean;
  couponCode: string;
  savedAmount: number;
  onDismiss: () => void;
};

export function CouponApplyCelebration({
  visible,
  couponCode,
  savedAmount,
  onDismiss,
}: CouponApplyCelebrationProps) {
  const savedLabel =
    savedAmount > 0.005
      ? `You saved ₹${formatCheckoutSavingsRupees(savedAmount)}`
      : "Coupon applied!";

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onDismissRef.current(), 2500);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss coupon celebration"
        />
        <CheckoutConfettiOverlay visible={visible} />
        <Pressable onPress={onDismiss} style={styles.cardPress} accessibilityRole="button">
          <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
            <View style={styles.cardIcon}>
              <CheckoutText style={styles.cardIconPct}>%</CheckoutText>
            </View>
            <CheckoutText style={styles.cardCodeLine} numberOfLines={2}>
              '{couponCode}' applied
            </CheckoutText>
            <CheckoutText style={styles.cardSaved}>{savedLabel}</CheckoutText>
            <CheckoutText style={styles.ctaText}>Woohoo! Thanks</CheckoutText>
          </Animated.View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  cardPress: {
    width: "100%",
    maxWidth: 320,
    zIndex: 10,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardIconPct: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
  },
  cardCodeLine: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 8,
  },
  cardSaved: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#E23744",
    paddingVertical: 8,
  },
});
