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
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  /** Current amount counting toward min (entered amount or available balance). */
  current: number;
  minAmount: number;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Ready label when threshold met. */
  labelReady?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Fill / active color */
  color?: string;
};

function formatInrShort(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("en-IN")
    : rounded.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compare rupees in paise to avoid float edge cases (e.g. 299.999). */
function meetsMin(current: number, minAmount: number): boolean {
  return Math.round(current * 100) >= Math.round(minAmount * 100);
}

/**
 * Withdraw CTA with left→right progress fill toward the min threshold.
 * Inactive until current >= min; when met, solid full color (no overlay).
 */
export function WithdrawProgressButton({
  current,
  minAmount,
  onPress,
  disabled = false,
  loading = false,
  labelReady = "Withdraw",
  compact = false,
  style,
  color = GatiMitraMerchant.navy,
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
      : compact
        ? `Min ₹${formatInrShort(min)}`
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
        compact && styles.btnCompact,
        { backgroundColor: met ? color : "#CBD5E1" },
        pressed && met && !loading && styles.pressed,
        style,
      ]}
    >
      {/* Progress fill only while below min — full solid when threshold met */}
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
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    paddingHorizontal: 14,
  },
  btnCompact: {
    marginTop: 0,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  text: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    zIndex: 1,
  },
  textCompact: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.92,
  },
});
