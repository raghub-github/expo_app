import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LEDGER_PAGE_BG, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

export function LedgerEmptyState() {
  const { t } = useTranslation();

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

      <Text style={styles.title}>{t("ledger.noTransactions", "No transactions yet")}</Text>
      <Text style={styles.message}>
        {t(
          "ledger.emptyDescription",
          "Transactions will appear here once you start earning or receive adjustments.",
        )}
      </Text>

      <View style={styles.tipRow}>
        <View style={styles.tipIcon}>
          <Ionicons name="bulb-outline" size={18} color={LEDGER_TEAL} />
        </View>
        <Text style={styles.tipText}>
          <Text style={styles.tipLabel}>{t("ledger.tipLabel", "Tip:")} </Text>
          {t(
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
    marginBottom: 20,
    paddingHorizontal: 8,
    maxWidth: 320,
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
