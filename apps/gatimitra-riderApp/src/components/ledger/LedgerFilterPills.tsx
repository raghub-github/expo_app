import React from "react";
import { ScrollView, Pressable, Text, StyleSheet } from "react-native";
import type { RiderLedgerSegment } from "@/src/services/api/riderApi";
import { LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Segment = { id: RiderLedgerSegment; label: string };

type Props = {
  segments: Segment[];
  selected: RiderLedgerSegment;
  onSelect: (id: RiderLedgerSegment) => void;
};

export function LedgerFilterPills({ segments, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {segments.map((seg) => {
        const active = selected === seg.id;
        return (
          <Pressable
            key={seg.id}
            onPress={() => onSelect(seg.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{seg.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
    paddingBottom: 2,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  chipActive: {
    backgroundColor: LEDGER_TEAL,
    borderColor: LEDGER_TEAL,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
});
