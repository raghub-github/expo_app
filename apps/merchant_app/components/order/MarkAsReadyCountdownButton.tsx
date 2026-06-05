import { Pressable, StyleSheet, Text, View } from "react-native";
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
  const fillRatio = prepReadyTimeRemainingRatio(order, nowMs);
  const fillPct = `${Math.round(fillRatio * 100)}%`;
  const isDark = theme === "dark";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        isDark ? styles.btnDark : styles.btnLight,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View
        style={[
          isDark ? styles.fillDark : styles.fillLight,
          { width: fillPct },
        ]}
      />
      <Text style={isDark ? styles.labelDark : styles.labelLight}>{label}</Text>
    </Pressable>
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
    borderColor: "#9A3412",
    backgroundColor: "#1E293B",
  },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.92 },
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
