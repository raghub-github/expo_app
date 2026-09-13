/**
 * Celebration modal after working location is updated successfully.
 * Confetti / crackers burst — same idea as customer checkout coupon celebration.
 */
import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useWorkingLocationSuccessStore } from "@/src/stores/workingLocationSuccessStore";
import { RiderFonts } from "@/src/theme/fonts";

const PRIMARY = "#15803D";
const CONFETTI_COLORS = [
  "#15803D",
  "#22C55E",
  "#FBBF24",
  "#F97316",
  "#EF4444",
  "#3B82F6",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
];
const CONFETTI_COUNT = 48;

function ConfettiParticle({
  index,
  screenW,
  screenH,
}: {
  index: number;
  screenW: number;
  screenH: number;
}) {
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length]!;
  const isSquare = index % 3 === 0;
  const size = 5 + (index % 5);
  // Burst from near center (cracker), then fall.
  const originX = screenW / 2 + ((index % 11) - 5) * 10;
  const originY = screenH * 0.38 + ((index % 5) - 2) * 6;
  const burstX = useMemo(() => ((index % 17) - 8) * (18 + (index % 4) * 4), [index]);
  const burstUp = useMemo(() => -(80 + (index % 9) * 18), [index]);

  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0.4);

  useEffect(() => {
    const delay = (index % 10) * 28;
    scale.value = withDelay(delay, withTiming(1, { duration: 180 }));
    translateX.value = withDelay(delay, withTiming(burstX, { duration: 900 }));
    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(burstUp, { duration: 420 }),
        withTiming(screenH * 0.55, { duration: 1400 }),
      ),
    );
    rotate.value = withDelay(
      delay,
      withTiming(360 * (index % 2 === 0 ? 1 : -1), { duration: 1800 }),
    );
    opacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(1000, withTiming(0, { duration: 700 })),
      ),
    );
  }, [burstUp, burstX, index, opacity, rotate, scale, screenH, translateX, translateY]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: originX,
          top: originY,
          width: size,
          height: isSquare ? size : size * 1.7,
          borderRadius: isSquare ? 2 : size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function CrackersOverlay({ visible }: { visible: boolean }) {
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

export function WorkingLocationSuccessModal() {
  const visible = useWorkingLocationSuccessStore((s) => s.visible);
  const addressLine = useWorkingLocationSuccessStore((s) => s.addressLine);
  const hide = useWorkingLocationSuccessStore((s) => s.hide);
  const hideRef = useRef(hide);
  hideRef.current = hide;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => hideRef.current(), 3200);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={hide}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={hide}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <CrackersOverlay visible={visible} />
        <Animated.View entering={FadeInDown.duration(280).springify()} style={styles.card}>
          <Animated.View entering={FadeIn.delay(80).duration(220)} style={styles.iconWrap}>
            <Ionicons name="checkmark-circle" size={52} color={PRIMARY} />
          </Animated.View>
          <Text style={styles.title}>Successfully updated</Text>
          <Text style={styles.message}>
            Your working location has been updated
            {addressLine ? ` to ${addressLine}` : ""}.
          </Text>
          {addressLine ? (
            <View style={styles.addressChip}>
              <Ionicons name="navigate-outline" size={16} color={PRIMARY} />
              <Text style={styles.addressChipText} numberOfLines={2}>
                {addressLine}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={hide}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <Text style={styles.btnText}>Great!</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 14,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(21, 128, 61, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 24,
    lineHeight: 30,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 14,
  },
  addressChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  addressChipText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    color: "#14532D",
  },
  btn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    borderWidth: 1.5,
    borderColor: "#14532D",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
