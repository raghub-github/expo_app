import { useCallback, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import {
  prepReadyCountdownLabel,
  prepReadyTimeRemainingRatio,
  type PrepCountdownOrder,
} from "@/lib/order-prep-time";

type Props = {
  order: PrepCountdownOrder;
  nowMs: number;
  onPress: () => void;
  disabled?: boolean;
  labelPrefix?: string;
  fullWidth?: boolean;
  theme?: "light" | "dark";
};

export function MarkAsReadyCountdownButton({
  order,
  nowMs,
  onPress,
  disabled,
  labelPrefix = "Order Ready",
  fullWidth = true,
  theme = "dark",
}: Props) {
  const { label } = prepReadyCountdownLabel(order, nowMs, {
    prefix: labelPrefix,
    expiredLabel: labelPrefix,
  });
  const fillPct = Math.max(0, Math.min(100, prepReadyTimeRemainingRatio(order, nowMs) * 100));
  const isDark = theme === "dark";
  const [pressed, setPressed] = useState(false);

  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const lockRef = useRef(false);

  const handlePress = useCallback(() => {
    if (disabled || lockRef.current) return;
    lockRef.current = true;
    onPressRef.current();
    setTimeout(() => {
      lockRef.current = false;
    }, 450);
  }, [disabled]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      delayPressIn={0}
      disabled={!!disabled}
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.btn,
        isDark ? styles.btnDark : styles.btnLight,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          isDark ? styles.fillDark : styles.fillLight,
          { width: `${fillPct}%` },
        ]}
      />
      {isDark ? <View pointerEvents="none" style={styles.fillSheen} /> : null}
      <Text pointerEvents="none" style={isDark ? styles.labelDark : styles.labelLight}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  btnLight: {
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#E8E8E8",
  },
  btnDark: {
    borderWidth: 1,
    borderColor: "rgba(154, 52, 18, 0.25)",
    backgroundColor: "#1E293B",
  },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.88 },
  fillLight: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
  },
  fillDark: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#EA580C",
  },
  fillSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  labelLight: {
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  labelDark: {
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
