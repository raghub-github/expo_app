import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { LivePreviewInsights } from "@/services/livePreviewApi";
import { PctTrend } from "@/components/growth/growthMetricUi";
import { GrowthPanelLoader } from "@/components/growth/GrowthPanelLoader";

type Props = {
  data: LivePreviewInsights | null;
  loading?: boolean;
  periodLabel: string;
  onOpenPeriod: () => void;
};

function FunnelBar({
  label,
  value,
  display,
  pct,
  widthPct,
}: {
  label: string;
  value: number;
  display: string;
  pct: number | null;
  widthPct: number;
}) {
  return (
    <View style={s.funnelStep}>
      <View style={s.funnelLabelRow}>
        <Text style={s.funnelLabel}>{label}</Text>
        <View style={s.funnelValueRow}>
          <Text style={s.funnelValue}>{display}</Text>
          <PctTrend pct={pct} />
        </View>
      </View>
      <View style={s.funnelTrack}>
        <View style={[s.funnelFill, { width: `${Math.max(8, widthPct)}%` }]} />
      </View>
    </View>
  );
}

function MetricRow({
  label,
  display,
  pct,
}: {
  label: string;
  display: string;
  pct: number | null;
}) {
  return (
    <View style={[s.metricRow, s.rowDivider]}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.metricValueRow}>
        <Text style={s.metricValue}>{display}</Text>
        <PctTrend pct={pct} />
      </View>
    </View>
  );
}

export function GrowthFunnelPanel({ data, loading = false, periodLabel, onOpenPeriod }: Props) {
  const placed = data?.funnel.impressions.value ?? 0;
  const acceptRate = data?.funnel.impressions_to_menu.value ?? 0;
  const prepRate = data?.funnel.menu_to_cart.value ?? 0;
  const deliveryRate = data?.funnel.cart_to_order.value ?? 0;

  return (
    <>
      <Text style={s.pageTitle}>Order funnel</Text>
      <Pressable onPress={onOpenPeriod} style={({ pressed }) => [s.periodPill, pressed && s.pressed]}>
        <Text style={s.periodText} numberOfLines={1}>
          {periodLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.navy} />
      </Pressable>

      <View style={s.card}>
        {loading ? (
          <GrowthPanelLoader />
        ) : data ? (
          <>
            <Text style={s.compareSub}>{data.compare_header}</Text>

            <Text style={s.sectionTitle}>Conversion funnel</Text>
            <FunnelBar
              label="Orders placed"
              value={placed}
              display={data.funnel.impressions.display}
              pct={data.funnel.impressions.pct_change}
              widthPct={placed > 0 ? 100 : 0}
            />
            <FunnelBar
              label="Acceptance rate"
              value={acceptRate}
              display={data.funnel.impressions_to_menu.display}
              pct={data.funnel.impressions_to_menu.pct_change}
              widthPct={acceptRate}
            />
            <FunnelBar
              label="Prep completion rate"
              value={prepRate}
              display={data.funnel.menu_to_cart.display}
              pct={data.funnel.menu_to_cart.pct_change}
              widthPct={prepRate}
            />
            <FunnelBar
              label="Delivery rate"
              value={deliveryRate}
              display={data.funnel.cart_to_order.display}
              pct={data.funnel.cart_to_order.pct_change}
              widthPct={deliveryRate}
            />

            <Text style={s.sectionTitle}>Customer segments</Text>
            <MetricRow
              label="New customers"
              display={data.user_segments.new_users.display}
              pct={data.user_segments.new_users.pct_change}
            />
            <MetricRow
              label="Repeat customers"
              display={data.user_segments.repeat_users.display}
              pct={data.user_segments.repeat_users.pct_change}
            />
            <MetricRow
              label="Lapsed customers"
              display={data.user_segments.lapsed_users.display}
              pct={data.user_segments.lapsed_users.pct_change}
            />

            <Text style={s.sectionTitle}>Drop-offs</Text>
            <MetricRow
              label="Rejected orders"
              display={data.bad_orders.rejected.display}
              pct={data.bad_orders.rejected.pct_change}
            />
            <MetricRow
              label="Lost sales"
              display={data.lost_sales.display}
              pct={data.lost_sales.pct_change}
            />
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
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  compareSub: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  funnelStep: { marginBottom: 12 },
  funnelLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  funnelLabel: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    flex: 1,
  },
  funnelValueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  funnelValue: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  funnelTrack: {
    height: 10,
    backgroundColor: "#EEF2F7",
    borderRadius: 5,
    overflow: "hidden",
  },
  funnelFill: {
    height: "100%",
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 5,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  metricLabel: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    flex: 1,
  },
  metricValueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  empty: {
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  pressed: { opacity: 0.85 },
});
