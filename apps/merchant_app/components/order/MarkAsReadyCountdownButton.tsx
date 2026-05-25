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
};

export function MarkAsReadyCountdownButton({
  order,
  nowMs,
  onPress,
  disabled,
  labelPrefix = "Order Ready",
  fullWidth = true,
}: Props) {
  const { label } = prepReadyCountdownLabel(order, nowMs, {
    prefix: labelPrefix,
    expiredLabel: labelPrefix,
  });
  const fillRatio = prepReadyTimeRemainingRatio(order, nowMs);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.fill, { width: `${Math.round(fillRatio * 100)}%` }]} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#E8E8E8",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.92 },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
  },
  label: {
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
});
