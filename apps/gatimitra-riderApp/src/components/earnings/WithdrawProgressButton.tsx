import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "@/src/theme";

type Props = {
  current: number;
  minAmount: number;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  labelReady?: string;
  style?: StyleProp<ViewStyle>;
  color?: string;
};

function formatInrShort(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-IN")
    : rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function meetsMin(current: number, minAmount: number): boolean {
  return Math.round(current * 100) >= Math.round(minAmount * 100);
}

/** Progress-fill withdraw CTA — solid full color once `current` reaches `minAmount`. */
export function WithdrawProgressButton({
  current,
  minAmount,
  onPress,
  disabled = false,
  loading = false,
  labelReady = "Withdraw",
  style,
  color = colors.primary[500],
}: Props) {
  const min = Math.max(0, minAmount);
  const value = Math.max(0, Number.isFinite(current) ? current : 0);
  const met = min <= 0 || meetsMin(value, min);
  const progress = met || min <= 0 ? 1 : Math.min(1, value / min);
  const shortfall = Math.max(0, Math.round((min - value) * 100) / 100);
  const isDisabled = disabled || loading || !met;

  const label = loading
    ? null
    : met
      ? labelReady
      : shortfall > 0 && shortfall < min
        ? `Min ₹${formatInrShort(min)} · ₹${formatInrShort(shortfall)} more`
        : `Min ₹${formatInrShort(min)}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      accessibilityLabel={typeof label === "string" ? label : labelReady}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: met ? color : "#CBD5E1" },
        pressed && met && !loading && styles.pressed,
        style,
      ]}
    >
      {!met ? (
        <View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: color,
            },
          ]}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: 14,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.92,
  },
});
