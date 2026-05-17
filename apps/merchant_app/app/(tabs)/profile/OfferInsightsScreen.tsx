import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { fetchOfferInsights, listOffers } from "@/services/offersApi";
import {
  buildPresetRange,
  formatDateBarLabel,
  formatIstDayMonthYear,
  type OrderDateRange,
} from "@/lib/orderDateRange";
import {
  emptyOfferInsightsSnapshot,
  mapOfferInsightsFromApi,
  offerOverlapsRange,
  type OfferInsightsSnapshot,
} from "@/lib/offers/offer-insights-build";
import { formatOfferInr } from "@/lib/offers/offer-analytics";
import { OrderDateRangeSheet } from "@/components/order/OrderDateRangeSheet";
import { InsightCard } from "@/components/offers/InsightCard";
import { SimpleLineChart } from "@/components/offers/charts/SimpleLineChart";
import { SimpleDonutChart } from "@/components/offers/charts/SimpleDonutChart";

function MetricCell({
  label,
  value,
  hint,
  borderRight,
  borderBottom,
}: {
  label: string;
  value: string;
  hint?: string;
  borderRight?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <View
      style={[
        styles.metricCell,
        borderRight && styles.metricBorderRight,
        borderBottom && styles.metricBorderBottom,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

export default function OfferInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;
  const [range, setRange] = useState<OrderDateRange>(() => {
    const r = buildPresetRange("last_30_days");
    const sixMoStart = new Date();
    sixMoStart.setMonth(sixMoStart.getMonth() - 5);
    sixMoStart.setDate(1);
    return {
      preset: "custom",
      startMs: sixMoStart.getTime(),
      endMs: r.endMs,
    };
  });
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offers, setOffers] = useState<Awaited<ReturnType<typeof listOffers>>>([]);
  const [insights, setInsights] = useState<OfferInsightsSnapshot>(() => emptyOfferInsightsSnapshot());
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (silent?: boolean) => {
      if (!storeId || !token) return;
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const [list, apiInsights] = await Promise.all([
          listOffers(storeId, token),
          fetchOfferInsights(storeId, token, { startMs: range.startMs, endMs: range.endMs }),
        ]);
        setOffers(list);
        const offerCount = list.filter((o) => offerOverlapsRange(o, range.startMs, range.endMs)).length;
        setInsights(mapOfferInsightsFromApi(apiInsights, offerCount));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load insights");
        setInsights(emptyOfferInsightsSnapshot());
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [storeId, token, range.startMs, range.endMs]
  );

  useEffect(() => {
    load();
  }, [load]);

  const monthLabels = insights.monthly.map((m) => m.label);
  const offerGrossSeries = insights.monthly.map((m) => m.gross);
  const totalGrossSeries = insights.monthly.map((m) => m.storeGross);
  const discountSeries = insights.monthly.map((m) => m.discount);
  const effSeries = insights.monthly.map((m) => m.effPct);
  const ordersSeries = insights.monthly.map((m) => m.orders);
  const totalOrdersSeries = insights.monthly.map((m) => m.storeOrders);
  const hasMonthlyChart = monthLabels.length > 0 && insights.monthly.some((m) => m.storeGross > 0 || m.gross > 0);

  const dateBarLabel =
    range.preset === "custom"
      ? `Custom · ${formatIstDayMonthYear(new Date(range.startMs))} - ${formatIstDayMonthYear(new Date(range.endMs))}`
      : formatDateBarLabel(range);

  const customerTotal =
    insights.customers.newOrders + insights.customers.repeatOrders + insights.customers.lapsedOrders;

  if (!storeId || !token) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Sign in and select a store.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setDateSheetOpen(true)}
          style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="calendar-outline" size={18} color={GatiMitraMerchant.textSecondary} />
          <Text style={styles.dateBtnText} numberOfLines={1}>
            {dateBarLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.textTertiary} />
        </Pressable>
      </View>

      {loadError && !loading ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load(true);
                setRefreshing(false);
              }}
              tintColor={GatiMitraMerchant.primary}
            />
          }
        >
          <InsightCard title="Offers" subtitle={`${insights.offerCount} campaigns in range`}>
            <View style={styles.metricsGrid}>
              <MetricCell
                label="Gross sales from offers"
                value={formatOfferInr(insights.gross)}
                hint={
                  insights.grossPctOfStore != null
                    ? `${insights.grossPctOfStore}% of total gross sales`
                    : undefined
                }
                borderRight
                borderBottom
              />
              <MetricCell
                label="Discount given"
                value={formatOfferInr(insights.discount)}
                hint={
                  insights.orders > 0
                    ? `${formatOfferInr(insights.discountPerOrder)} discount per order`
                    : undefined
                }
                borderBottom
              />
              <MetricCell
                label="Orders from offers"
                value={String(insights.orders)}
                hint={
                  insights.ordersPctOfStore != null
                    ? `${insights.ordersPctOfStore}% of total orders`
                    : undefined
                }
                borderRight
              />
              <MetricCell
                label="Effective discount"
                value={`${insights.effPct}%`}
                hint="Discount given ÷ Gross sales from offers"
              />
            </View>
          </InsightCard>

          <InsightCard title="Gross sales from offers">
            <View style={styles.dualStat}>
              <View>
                <Text style={styles.dualLabel}>Total gross sales</Text>
                <Text style={styles.dualValue}>{formatOfferInr(insights.totalStoreGross)}</Text>
              </View>
              <View>
                <Text style={styles.dualLabel}>Gross sales from offers</Text>
                <Text style={styles.dualValue}>{formatOfferInr(insights.gross)}</Text>
              </View>
            </View>
            {hasMonthlyChart ? (
              <SimpleLineChart
                labels={monthLabels}
                series={[
                  {
                    key: "total",
                    label: "Total gross sales",
                    color: GatiMitraMerchant.primary,
                    values: totalGrossSeries,
                    fill: true,
                  },
                  {
                    key: "offers",
                    label: "Gross sales from offers",
                    color: GatiMitraMerchant.navy,
                    values: offerGrossSeries,
                    dashed: true,
                  },
                ]}
                formatValue={(n) => formatOfferInr(n)}
              />
            ) : (
              <Text style={styles.noChart}>No order data for this range.</Text>
            )}
          </InsightCard>

          <InsightCard title="Customer type breakup">
            {customerTotal > 0 ? (
              <SimpleDonutChart
                segments={[
                  {
                    key: "new",
                    label: "New customers",
                    value: insights.customers.newOrders,
                    color: "#E2E8F0",
                    sublabel: "No orders in last 90 days",
                  },
                  {
                    key: "repeat",
                    label: "Repeat customers",
                    value: insights.customers.repeatOrders,
                    color: "#F472B6",
                    sublabel: "Ordered in last 60 days",
                  },
                  {
                    key: "lapsed",
                    label: "Lapsed customers",
                    value: insights.customers.lapsedOrders,
                    color: "#60A5FA",
                    sublabel: "Last order 60–90 days ago",
                  },
                ]}
                centerLabel="Orders from offers"
                centerValue={String(insights.orders)}
              />
            ) : (
              <Text style={styles.noChart}>No orders from offers in this period.</Text>
            )}
          </InsightCard>

          <InsightCard title="Gross sales & discount">
            <View style={styles.dualStat}>
              <View>
                <Text style={styles.dualLabel}>Discount given</Text>
                <Text style={styles.dualValue}>{formatOfferInr(insights.discount)}</Text>
              </View>
              <View>
                <Text style={styles.dualLabel}>Gross sales from offers</Text>
                <Text style={styles.dualValue}>{formatOfferInr(insights.gross)}</Text>
              </View>
            </View>
            {hasMonthlyChart && insights.gross > 0 ? (
              <SimpleLineChart
                labels={monthLabels}
                series={[
                  { key: "gross", label: "Gross sales from offers", color: GatiMitraMerchant.primary, values: offerGrossSeries, fill: true },
                  { key: "disc", label: "Discount given", color: "#F59E0B", values: discountSeries, dashed: true },
                ]}
                formatValue={(n) => formatOfferInr(n)}
              />
            ) : insights.gross <= 0 ? (
              <Text style={styles.noChart}>No offer sales in this period.</Text>
            ) : null}
          </InsightCard>

          <InsightCard title="Effective discount">
            <Text style={styles.bigMetric}>{insights.effPct}%</Text>
            {hasMonthlyChart && insights.gross > 0 ? (
              <SimpleLineChart
                labels={monthLabels}
                series={[
                  {
                    key: "eff",
                    label: "Effective discount",
                    color: GatiMitraMerchant.primary,
                    values: effSeries,
                    fill: true,
                  },
                ]}
                formatValue={(n) => `${Math.round(n * 10) / 10}%`}
              />
            ) : null}
          </InsightCard>

          <InsightCard title="Orders from offers">
            <View style={styles.dualStat}>
              <View>
                <Text style={styles.dualLabel}>Orders from offers</Text>
                <Text style={styles.dualValue}>{insights.orders}</Text>
              </View>
              <View>
                <Text style={styles.dualLabel}>Total orders</Text>
                <Text style={styles.dualValue}>{insights.totalStoreOrders.toLocaleString("en-IN")}</Text>
              </View>
            </View>
            {hasMonthlyChart ? (
              <SimpleLineChart
                labels={monthLabels}
                series={[
                  { key: "offerOrd", label: "Orders from offers", color: GatiMitraMerchant.primary, values: ordersSeries, fill: true },
                  { key: "totalOrd", label: "Total orders", color: GatiMitraMerchant.navy, values: totalOrdersSeries, dashed: true },
                ]}
              />
            ) : (
              <Text style={styles.noChart}>No orders in this period.</Text>
            )}
          </InsightCard>

          <InsightCard title="Discount type breakup">
            {insights.discountTypes.length > 0 ? (
              <>
                <SimpleDonutChart
                  segments={insights.discountTypes.map((d) => ({
                    key: d.id,
                    label: d.label,
                    value: d.gross,
                    color: d.color,
                  }))}
                  centerLabel="Gross sales from offers"
                  centerValue={formatOfferInr(insights.gross)}
                />
                <View style={styles.typeList}>
                  {insights.discountTypes.map((d) => (
                    <View key={d.id} style={styles.typeRow}>
                      <View style={[styles.typeDot, { backgroundColor: d.color }]} />
                      <Text style={styles.typeLabel}>{d.label}</Text>
                      <Text style={styles.typeVal}>{formatOfferInr(d.gross)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.noChart}>No offer orders by type in this period.</Text>
            )}
          </InsightCard>

          <View style={styles.helpSection}>
            <Text style={styles.helpTitle}>How can we help you?</Text>
            <View style={styles.helpCard}>
              {[
                { label: "Manage offers", route: "/(tabs)/profile/offers" as const },
                { label: "Order history", route: "/(tabs)/profile/order-history" as const },
                { label: "Help centre", route: "/(tabs)/profile/help" as const },
              ].map((item, i, arr) => (
                <Pressable
                  key={item.label}
                  onPress={() => router.push(item.route)}
                  style={({ pressed }) => [
                    styles.helpRow,
                    i < arr.length - 1 && styles.helpRowBorder,
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.helpRowText}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      <OrderDateRangeSheet
        visible={dateSheetOpen}
        value={range}
        onClose={() => setDateSheetOpen(false)}
        onApply={(r) => {
          setRange(r);
          setDateSheetOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: GatiMitraMerchant.textTertiary },
  errorBanner: {
    marginHorizontal: H_PADDING,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { fontSize: 13, color: "#B91C1C" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    marginBottom: 12,
  },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateBtnText: { flex: 1, fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  metricCell: { width: "50%", padding: 12, backgroundColor: "#fff" },
  metricBorderRight: { borderRightWidth: 1, borderRightColor: GatiMitraMerchant.border },
  metricBorderBottom: { borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.border },
  metricLabel: { fontSize: 12, color: GatiMitraMerchant.textSecondary, lineHeight: 16 },
  metricValue: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginTop: 6 },
  metricHint: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 4, lineHeight: 15 },
  dualStat: { flexDirection: "row", gap: 24, marginBottom: 4 },
  dualLabel: { fontSize: 12, color: GatiMitraMerchant.textTertiary },
  dualValue: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginTop: 4 },
  bigMetric: { fontSize: 28, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 8 },
  noChart: { fontSize: 13, color: GatiMitraMerchant.textTertiary, textAlign: "center", paddingVertical: 20 },
  typeList: { marginTop: 16, gap: 10 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  typeLabel: { flex: 1, fontSize: 13, color: GatiMitraMerchant.textSecondary },
  typeVal: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  helpSection: { paddingHorizontal: H_PADDING, marginTop: 8, marginBottom: 8 },
  helpTitle: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 10 },
  helpCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  helpRowBorder: { borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.border },
  helpRowText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
});
