import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { GrowthKitchenInsights } from "@/services/growthApi";
import { GrowthPanelLoader } from "@/components/growth/GrowthPanelLoader";

type Props = {
  data: GrowthKitchenInsights | null;
  loading?: boolean;
  periodLabel: string;
  onOpenPeriod: () => void;
};

function KitchenBarChart({
  buckets,
}: {
  buckets: { label: string; orders_count: number; late_count: number }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.orders_count));
  return (
    <View style={s.chartWrap}>
      <View style={s.chartBars}>
        {buckets.map((b) => {
          const h = Math.max(4, (b.orders_count / max) * 72);
          const lateH = b.orders_count > 0 ? (b.late_count / b.orders_count) * h : 0;
          return (
            <View key={b.label} style={s.barCol}>
              <View style={[s.barTrack, { height: 76 }]}>
                <View style={[s.barOnTime, { height: Math.max(0, h - lateH) }]} />
                {lateH > 0 ? <View style={[s.barLate, { height: lateH }]} /> : null}
              </View>
              <Text style={s.barLabel} numberOfLines={1}>
                {b.label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: GatiMitraMerchant.navy }]} />
          <Text style={s.legendText}>Prepared on time</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendSwatch, { backgroundColor: GatiMitraMerchant.error }]} />
          <Text style={s.legendText}>Late</Text>
        </View>
      </View>
      <Text style={s.chartCaption}>Orders prepared by time slot in the selected range.</Text>
    </View>
  );
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

export function GrowthKitchenPanel({ data, loading = false, periodLabel, onOpenPeriod }: Props) {
  const reliabilityPct =
    data != null ? `${Math.round(data.prep_reliability_score * 100)}%` : "—";

  return (
    <>
      <Text style={s.pageTitle}>Kitchen performance</Text>
      <Pressable onPress={onOpenPeriod} style={({ pressed }) => [s.periodPill, pressed && s.pressed]}>
        <Text style={s.periodText} numberOfLines={1}>
          {data?.primary_header || periodLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.navy} />
      </Pressable>

      <View style={s.card}>
        {loading ? (
          <GrowthPanelLoader />
        ) : data ? (
          <>
            <View style={s.liveRow}>
              <View style={s.liveChip}>
                <Text style={s.liveChipLabel}>Preparing now</Text>
                <Text style={s.liveChipValue}>{data.currently_preparing}</Text>
              </View>
              <View style={s.liveChip}>
                <Text style={s.liveChipLabel}>Ready for pickup</Text>
                <Text style={s.liveChipValue}>{data.currently_ready}</Text>
              </View>
            </View>

            <View style={s.statGrid}>
              <StatCell
                label="Configured prep"
                value={`${data.configured_prep_minutes} min`}
              />
              <StatCell
                label="Actual avg prep"
                value={
                  data.avg_prep_actual_minutes != null
                    ? `${data.avg_prep_actual_minutes} min`
                    : "—"
                }
                sub={`${data.prep_samples_count} samples`}
              />
              <StatCell label="Late rate" value={`${data.late_rate_pct}%`} />
              <StatCell label="Reliability" value={reliabilityPct} />
            </View>

            <View style={s.summaryRow}>
              <Text style={s.summaryText}>
                {data.orders_prepared} prepared · {data.orders_late} late
                {data.avg_late_minutes > 0 ? ` · avg ${data.avg_late_minutes} min late` : ""}
              </Text>
            </View>

            {data.buckets.length > 0 ? (
              <KitchenBarChart buckets={data.buckets} />
            ) : null}
          </>
        ) : (
          <Text style={s.empty}>Could not load data</Text>
        )}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  pageTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  periodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  periodText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
    maxWidth: 260,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 16,
  },
  liveRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  liveChip: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: 10,
    padding: 12,
  },
  liveChipLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 4,
  },
  liveChipValue: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  statCell: {
    width: "47%",
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: 10,
    padding: 12,
  },
  statLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  statSub: {
    fontSize: 10,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  summaryRow: { marginBottom: 12 },
  summaryText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  chartWrap: { marginTop: 4 },
  chartBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 4,
    minHeight: 96,
  },
  barCol: { flex: 1, alignItems: "center" },
  barTrack: {
    width: "100%",
    maxWidth: 28,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barOnTime: {
    width: "100%",
    backgroundColor: GatiMitraMerchant.navy,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLate: {
    width: "100%",
    backgroundColor: GatiMitraMerchant.error,
  },
  barLabel: {
    fontSize: 9,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 4,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11, color: GatiMitraMerchant.textSecondary },
  chartCaption: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 8,
  },
  empty: {
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  pressed: { opacity: 0.85 },
});
