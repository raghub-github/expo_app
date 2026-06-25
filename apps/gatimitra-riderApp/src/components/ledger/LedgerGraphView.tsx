import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import type { RiderLedgerGraphData } from "@/src/services/api/riderApi";
import { formatLedgerAmount } from "@/src/components/ledger/ledgerDisplay";
import { LEDGER_CARD_RADIUS, LEDGER_TEAL } from "@/src/components/ledger/ledgerUiTokens";

type Props = {
  data: RiderLedgerGraphData;
  loading?: boolean;
};

const CHART_HEIGHT = 92;

export function LedgerGraphView({ data, loading = false }: Props) {
  const bars = useMemo(() => {
    const maxAmount = Math.max(...data.dailyBars.map((bar) => bar.amount), 0);
    return data.dailyBars.map((bar) => ({
      ...bar,
      barHeight:
        maxAmount <= 0 ? 8 : Math.max(8, Math.round((bar.amount / maxAmount) * CHART_HEIGHT)),
    }));
  }, [data.dailyBars]);

  if (loading && data.dailyBars.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={LEDGER_TEAL} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.rangeTitle}>{data.rangeLabel}</Text>
          <View style={styles.totalEarningBox}>
            <Text style={styles.totalEarningLabel}>Total Earning</Text>
            <Text style={styles.totalEarningValue}>
              ₹{formatLedgerAmount(data.totalEarning)}
            </Text>
          </View>
        </View>

        <View style={styles.chartWrap}>
          {bars.map((bar) => (
            <View key={bar.date} style={styles.barCol}>
              <Text style={styles.amountText}>₹{Math.round(bar.amount)}</Text>
              <View style={[styles.bar, { height: bar.barHeight }]} />
              <Text style={styles.dayText}>{bar.day}</Text>
            </View>
          ))}
          <View style={styles.baseline} />
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{data.orderCount}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statValue}>--:--</Text>
            <Text style={styles.statLabel}>Time on order</Text>
          </View>
        </View>
      </View>

      <BreakdownRow label="Order earning" value={data.orderEarning} />
      <BreakdownRow label="Incentive" value={data.incentive} />
      <BreakdownRow label="Surge" value={data.surge} />
      <BreakdownRow label="Waiting" value={data.waiting} />
    </View>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.breakdownCard}>
      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownValue}>₹{formatLedgerAmount(value)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 2,
  },
  loadingWrap: {
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: LEDGER_CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginTop: 4,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rangeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 0,
    flex: 1,
    marginRight: 10,
  },
  totalEarningBox: {
    alignItems: "flex-end",
  },
  totalEarningLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
  },
  totalEarningValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  chartWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingBottom: 2,
    position: "relative",
  },
  barCol: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    zIndex: 2,
  },
  amountText: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
    minHeight: 14,
    transform: [{ rotate: "-25deg" }],
  },
  bar: {
    width: 14,
    borderRadius: 5,
    backgroundColor: "#111827",
  },
  dayText: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  statsCard: {
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 34,
    fontWeight: "800",
    color: "#111827",
  },
  statLabel: {
    marginTop: 2,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#D1D5DB",
  },
  baseline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    borderStyle: "dashed",
    zIndex: 1,
  },
  breakdownCard: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breakdownLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  breakdownValue: {
    fontSize: 21,
    fontWeight: "800",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
});
