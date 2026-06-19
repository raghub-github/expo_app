import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  label: string;
  onPress: () => void;
  compact?: boolean;
};

export function LedgerPeriodSelector({ label, onPress, compact = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        compact && styles.pillCompact,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={compact ? 16 : 18} color={LEDGER_TEAL} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pressed: {
    opacity: 0.92,
    backgroundColor: "#F9FAFB",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginRight: 4,
    includeFontPadding: false,
  },
  labelCompact: {
    fontSize: 13,
    fontWeight: "600",
  },
});
