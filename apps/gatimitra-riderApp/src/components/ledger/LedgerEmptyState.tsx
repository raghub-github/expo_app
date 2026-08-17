import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LEDGER_PAGE_BG, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  walletBalance?: number;
  period?: "this_month" | "last_month" | "all";
  onViewAllPeriod?: () => void;
};

export function LedgerEmptyState({
  walletBalance = 0,
  period = "this_month",
  onViewAllPeriod,
}: Props) {
  const { t } = useTranslation();
  const negativeWallet = walletBalance < 0;
  const periodScoped = period !== "all";

  return (
    <View style={styles.root}>
      <View style={styles.illustrationWrap}>
        <View style={styles.illustrationBg}>
          <View style={styles.docCard}>
            <View style={styles.docLineWide} />
            <View style={styles.docLine} />
            <View style={styles.docLine} />
            <View style={[styles.docLine, styles.docLineShort]} />
          </View>
          <View style={styles.searchBubble}>
            <Ionicons name="search" size={28} color={LEDGER_TEAL} />
          </View>
          <View style={[styles.sparkle, styles.sparkleTop]} />
          <View style={[styles.sparkle, styles.sparkleRight]} />
        </View>
      </View>

      <Text style={styles.title}>
        {negativeWallet
          ? t("ledger.noRowsThisPeriod", "No transactions in this period")
          : t("ledger.noTransactions", "No transactions yet")}
      </Text>
      <Text style={styles.message}>
        {negativeWallet
          ? t(
              "ledger.emptyNegativeWallet",
              "Your wallet balance is ₹{{amount}}. The list below only shows entries for the selected period — open All time, or pay dues from Earnings / the home Pay button.",
              {
                amount: Math.abs(walletBalance).toLocaleString("en-IN", {
                  maximumFractionDigits: 2,
                }),
              },
            )
          : t(
              "ledger.emptyDescription",
              "Transactions will appear here once you start earning or receive adjustments.",
            )}
      </Text>

      {negativeWallet && periodScoped && onViewAllPeriod ? (
        <TouchableOpacity style={styles.ctaBtn} onPress={onViewAllPeriod} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>
            {t("ledger.viewAllTransactions", "View all transactions")}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.tipRow}>
        <View style={styles.tipIcon}>
          <Ionicons name="bulb-outline" size={18} color={LEDGER_TEAL} />
        </View>
        <Text style={styles.tipText}>
          <Text style={styles.tipLabel}>{t("ledger.tipLabel", "Tip:")} </Text>
          {negativeWallet
            ? t(
                "ledger.tipNegativeWallet",
                "Subscription / penalty dues update wallet balance immediately; ledger rows appear after the debit is recorded. Try period filter: All.",
              )
            : t(
                "ledger.tipBody",
                "Transactions may take up to 24 hours to reflect in your ledger.",
              )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    paddingTop: 48,
    paddingBottom: 24,
    paddingHorizontal: 4,
    backgroundColor: LEDGER_PAGE_BG,
  },
  illustrationWrap: {
    marginBottom: 22,
  },
  illustrationBg: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: "#F0FDFA",
    borderWidth: 2,
    borderColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  docCard: {
    width: 56,
    height: 68,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#99F6E4",
    padding: 10,
    gap: 6,
    transform: [{ rotate: "-8deg" }],
  },
  docLineWide: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#99F6E4",
    width: "100%",
  },
  docLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CCFBF1",
    width: "100%",
  },
  docLineShort: {
    width: "70%",
  },
  searchBubble: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#5EEAD4",
    alignItems: "center",
    justifyContent: "center",
  },
  sparkle: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#5EEAD4",
  },
  sparkleTop: {
    top: 18,
    right: 28,
  },
  sparkleRight: {
    top: 36,
    left: 20,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
    maxWidth: 320,
  },
  ctaBtn: {
    backgroundColor: LEDGER_TEAL,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginBottom: 20,
  },
  ctaBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    maxWidth: 340,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#CBD5E1",
  },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tipLabel: {
    fontWeight: "800",
    color: LEDGER_TEAL,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
  },
});
