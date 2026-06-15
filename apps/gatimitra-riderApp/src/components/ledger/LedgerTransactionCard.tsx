import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import type { RiderLedgerEntry } from "@/src/services/api/riderApi";
import {
  formatLedgerAmount,
  formatLedgerDateTime,
  ledgerTransactionTitle,
} from "@/src/components/ledger/ledgerDisplay";
import { LEDGER_CARD_RADIUS, ledgerSoftShadow } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  entry: RiderLedgerEntry;
};

export function LedgerTransactionCard({ entry }: Props) {
  const { t } = useTranslation();
  const isCredit = entry.flow === "credit";
  const title = ledgerTransactionTitle(entry, t);

  return (
    <View style={[styles.card, ledgerSoftShadow]}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, isCredit ? styles.iconCredit : styles.iconDebit]}>
          <Ionicons
            name={isCredit ? "arrow-down-circle" : "arrow-up-circle"}
            size={22}
            color={isCredit ? colors.success[600] : colors.error[600]}
          />
        </View>
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {entry.description}
          </Text>
        </View>
        <Text style={[styles.amount, isCredit ? styles.amountCredit : styles.amountDebit]}>
          {isCredit ? "+" : "−"} ₹{formatLedgerAmount(entry.amount)}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{t("ledger.created", "Created")}</Text>
        </View>
        <Text style={styles.date}>{formatLedgerDateTime(entry.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: LEDGER_CARD_RADIUS,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCredit: {
    backgroundColor: "#ECFDF5",
  },
  iconDebit: {
    backgroundColor: "#FEF2F2",
  },
  main: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
  },
  amount: {
    fontSize: 17,
    fontWeight: "800",
    flexShrink: 0,
    paddingTop: 2,
  },
  amountCredit: {
    color: colors.success[600],
  },
  amountDebit: {
    color: colors.error[600],
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success[500],
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.success[700],
  },
  date: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
  },
});
