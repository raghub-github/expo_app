import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LEDGER_CARD_RADIUS, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  label: string;
  onPress: () => void;
};

export function LedgerPeriodSelector({ label, onPress }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.innerRow}>
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
          <Ionicons name="chevron-down" size={18} color={LEDGER_TEAL} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 16,
  },
  pill: {
    flexShrink: 0,
    maxWidth: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: LEDGER_CARD_RADIUS,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.94,
    backgroundColor: "#F8FAFC",
  },
  innerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    gap: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 0,
    includeFontPadding: false,
  },
});
