import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { RiderLedgerEntry } from "@/src/services/api/riderApi";
import {
  formatLedgerAmount,
  formatLedgerDateTime,
  ledgerEarningBanner,
  ledgerOrderIdLine,
  ledgerStatusLabel,
  ledgerTransactionTitle,
  ledgerVisualConfig,
  type LedgerVisualConfig,
} from "@/src/components/ledger/ledgerDisplay";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

function LedgerEntryIcon({ visual }: { visual: LedgerVisualConfig }) {
  if (visual.iconSet === "material") {
    return (
      <MaterialCommunityIcons
        name={visual.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]}
        size={20}
        color={visual.iconColor}
      />
    );
  }
  return (
    <Ionicons
      name={visual.icon as React.ComponentProps<typeof Ionicons>["name"]}
      size={20}
      color={visual.iconColor}
    />
  );
}

type Props = {
  entry: RiderLedgerEntry;
  showDivider?: boolean;
};

export function LedgerTransactionRow({ entry, showDivider = false }: Props) {
  const { t } = useTranslation();
  const isCredit = entry.flow === "credit";
  const visual = ledgerVisualConfig(entry);
  const title = ledgerTransactionTitle(entry, t);
  const earningBanner = ledgerEarningBanner(entry, t);
  const orderIdLine = ledgerOrderIdLine(entry, t);
  const status = ledgerStatusLabel(entry, t);

  return (
    <View style={[styles.row, showDivider && styles.rowDivider]}>
      <View style={[styles.iconWrap, { backgroundColor: visual.iconBg }]}>
        <LedgerEntryIcon visual={visual} />
      </View>

      <View style={styles.mainCol}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {earningBanner ? (
          <Text style={styles.earningBanner} numberOfLines={3}>
            {earningBanner}
          </Text>
        ) : null}
        {orderIdLine ? (
          <Text style={styles.orderIdLine} numberOfLines={1}>
            {orderIdLine}
          </Text>
        ) : null}
      </View>

      <View style={styles.amountCol}>
        <View style={[styles.statusPill, { backgroundColor: visual.statusBg }]}>
          <Text style={[styles.statusText, { color: visual.statusColor }]}>{status}</Text>
        </View>
        <Text style={[styles.amount, isCredit ? styles.amountCredit : styles.amountDebit]}>
          {isCredit ? "+" : "−"} ₹{formatLedgerAmount(entry.amount)}
        </Text>
        <Text style={styles.date}>{formatLedgerDateTime(entry.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 3,
  },
  earningBanner: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 2,
  },
  orderIdLine: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  amountCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 96,
    paddingTop: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  amount: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    marginBottom: 4,
  },
  amountCredit: {
    color: "#16A34A",
  },
  amountDebit: {
    color: "#DC2626",
  },
  date: {
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
    textAlign: "right",
  },
});
