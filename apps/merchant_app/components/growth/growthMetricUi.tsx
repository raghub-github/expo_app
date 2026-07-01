import { View, Text, StyleSheet } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";
import type { GrowthQuickMetric } from "@/services/growthApi";

export function PctTrend({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  return (
    <Text
      style={[
        s.trend,
        pct > 0 && s.trendUp,
        pct < 0 && s.trendDown,
        pct === 0 && s.trendNeutral,
      ]}
    >
      {pct > 0 ? "+" : ""}
      {pct}%
    </Text>
  );
}

export function QuickMetricRow({ label, metric }: { label: string; metric: GrowthQuickMetric }) {
  return (
    <View style={[s.row, s.rowDivider]}>
      <Text style={s.label}>{label}</Text>
      <View style={s.valueRow}>
        <Text style={s.value}>{metric.display}</Text>
        <PctTrend pct={metric.pct_change} />
      </View>
    </View>
  );
}

export function LiveCountRow({ label, display }: { label: string; display: string }) {
  return (
    <View style={[s.row, s.rowDivider]}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{display}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  label: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  trend: {
    fontSize: 12,
    fontWeight: "600",
  },
  trendUp: { color: GatiMitraMerchant.success },
  trendDown: { color: GatiMitraMerchant.error },
  trendNeutral: { color: GatiMitraMerchant.textTertiary },
});
