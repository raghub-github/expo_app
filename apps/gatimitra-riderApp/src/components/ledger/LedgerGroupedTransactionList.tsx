import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { RiderLedgerEntry } from "@/src/services/api/riderApi";
import { LedgerTransactionRow } from "@/src/components/ledger/LedgerTransactionRow";
import { LedgerPeriodDropdown } from "@/src/components/ledger/LedgerPeriodDropdown";
import type { RiderLedgerPeriod } from "@/src/services/api/riderApi";
import { LEDGER_CARD_RADIUS } from "@/src/components/ledger/ledgerUiTokens";

type DayGroup = {
  key: string;
  label: string;
  entries: RiderLedgerEntry[];
};

type Props = {
  groups: DayGroup[];
  period: RiderLedgerPeriod;
  onPeriodChange: (period: RiderLedgerPeriod) => void;
};

export function LedgerGroupedTransactionList({
  groups,
  period,
  onPeriodChange,
}: Props) {
  return (
    <View style={styles.root}>
      {groups.map((group, groupIndex) => (
        <View key={group.key} style={styles.dayBlock}>
          <View style={styles.dayHeaderRow}>
            <Text style={styles.dayLabel}>{group.label}</Text>
            {groupIndex === 0 ? (
              <LedgerPeriodDropdown value={period} onChange={onPeriodChange} />
            ) : null}
          </View>
          <View style={styles.card}>
            {group.entries.map((entry, index) => (
              <LedgerTransactionRow
                key={`${entry.id}-${entry.createdAt}`}
                entry={entry}
                showDivider={index > 0}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 14,
  },
  dayBlock: {
    marginBottom: 14,
  },
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
    zIndex: 30,
    overflow: "visible",
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    flex: 1,
    flexShrink: 1,
    marginRight: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: LEDGER_CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
});
