import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { GrowthQuickInsights } from "@/services/growthApi";
import { LiveCountRow, QuickMetricRow } from "@/components/growth/growthMetricUi";
import { GrowthPanelLoader } from "@/components/growth/GrowthPanelLoader";

type Props = {
  data: GrowthQuickInsights | null;
  loading?: boolean;
  periodLabel: string;
  isOnline: boolean;
  onOpenPeriod: () => void;
};

export function GrowthQuickPanel({ data, loading = false, periodLabel, isOnline, onOpenPeriod }: Props) {
  return (
    <>
      <Text style={s.pageTitle}>Quick snapshot</Text>
      <View style={s.toolbar}>
        <Pressable onPress={onOpenPeriod} style={({ pressed }) => [s.periodPill, pressed && s.pressed]}>
          <Text style={s.periodText} numberOfLines={1}>
            {data?.primary_header || periodLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.navy} />
        </Pressable>
        <View style={[s.liveBadge, !isOnline && s.liveBadgeOffline]}>
          <View style={[s.liveDot, !isOnline && s.liveDotOffline]} />
          <Text style={[s.liveText, !isOnline && s.liveTextOffline]}>
            {isOnline ? "Live" : "Offline"}
          </Text>
        </View>
      </View>

      <View style={s.card}>
        {loading ? (
          <GrowthPanelLoader />
        ) : data ? (
          <>
            <Text style={s.compareSub}>{data.compare_header}</Text>
            <Text style={s.sectionTitle}>Sales</Text>
            <QuickMetricRow label="Net sales" metric={data.sales} />
            <QuickMetricRow label="Delivered orders" metric={data.orders} />
            <QuickMetricRow label="Average order value" metric={data.aov} />
            <Text style={s.sectionTitle}>Operations</Text>
            <LiveCountRow label="Active orders" display={data.active_orders.display} />
            <LiveCountRow label="Awaiting acceptance" display={data.pending_acceptance.display} />
            <QuickMetricRow label="Online %" metric={data.online_pct} />
            <Text style={s.sectionTitle}>Quality</Text>
            <QuickMetricRow label="Avg rating" metric={data.rating} />
            <QuickMetricRow label="Complaints" metric={data.complaints} />
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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  periodPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  periodText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  liveBadgeOffline: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.success,
  },
  liveDotOffline: { backgroundColor: GatiMitraMerchant.error },
  liveText: { fontSize: 12, fontWeight: "700", color: "#047857" },
  liveTextOffline: { color: "#B91C1C" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
    marginTop: 10,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  empty: {
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  pressed: { opacity: 0.85 },
});
