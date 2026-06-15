import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { RiderLedgerSummary } from "@/src/services/api/riderApi";
import { formatLedgerAmount } from "@/src/components/ledger/ledgerDisplay";
import { LEDGER_CARD_RADIUS, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  summary: RiderLedgerSummary;
  onViewMonthlySummary?: () => void;
};

function MetricColumn({
  label,
  value,
  valueColor,
  dotColor,
}: {
  label: string;
  value: string;
  valueColor: string;
  dotColor: string;
}) {
  return (
    <View style={styles.metricCol}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
      <View style={[styles.metricDot, { backgroundColor: dotColor }]} />
    </View>
  );
}

export function LedgerMonthlySummaryCard({ summary, onViewMonthlySummary }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="calendar-outline" size={18} color="#374151" />
          <Text style={styles.headerTitle}>{summary.monthLabel}</Text>
        </View>
        {onViewMonthlySummary ? (
          <Pressable onPress={onViewMonthlySummary} hitSlop={8}>
            <Text style={styles.viewLink}>
              {t("ledger.viewMonthlySummary", "View Monthly Summary")} ›
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.metricsRow}>
        <MetricColumn
          label={t("ledger.totalEarnings", "Total Earnings")}
          value={`₹${formatLedgerAmount(summary.totalEarnings)}`}
          valueColor="#16A34A"
          dotColor="#22C55E"
        />
        <View style={styles.metricDivider} />
        <MetricColumn
          label={t("ledger.totalWithdrawals", "Total Withdrawals")}
          value={`₹${formatLedgerAmount(summary.totalWithdrawals)}`}
          valueColor="#DC2626"
          dotColor="#EF4444"
        />
        <View style={styles.metricDivider} />
        <MetricColumn
          label={t("ledger.pendingSettlement", "Pending Settlement")}
          value={`₹${formatLedgerAmount(summary.pendingSettlement)}`}
          valueColor="#EA580C"
          dotColor="#F97316"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: LEDGER_CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  headerTitle: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flexShrink: 1,
  },
  viewLink: {
    fontSize: 12,
    fontWeight: "600",
    color: LEDGER_TEAL,
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  metricCol: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#E5E7EB",
    marginHorizontal: 4,
  },
});
