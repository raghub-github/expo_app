/**
 * Flow hub — Growth: My Activity (KPIs + bar charts) and Business (insights + sparklines).
 */

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE,
} from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import {
  fetchGrowthSummary,
  fetchGrowthBusinessInsights,
  type GrowthBucket,
  type GrowthPeriod,
  type GrowthSummary,
  type GrowthBusinessInsights,
} from "@/services/growthApi";
import { fetchLivePreviewInsights, type LivePreviewInsights } from "@/services/livePreviewApi";
import { MerchantMarketInsightsPanel } from "@/components/growth/MerchantMarketInsightsPanel";

const FILTER_CHIPS = ["My Activity", "Business", "Quick", "Funnel", "Kitchen"] as const;
const BUSINESS_CHIP = "Business";
const FUNNEL_CHIP = "Funnel";

const CHART_INNER_HEIGHT = 104;
const SPARK_W = 118;
const SPARK_H = 46;

const PERIOD_OPTIONS: { id: GrowthPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "alltime", label: "All time" },
];

function formatCompactINR(rupees: number): string {
  const r = Number(rupees);
  if (!Number.isFinite(r)) return "₹0";
  if (r >= 10000000) return `₹${(r / 10000000).toFixed(2)}Cr`;
  if (r >= 100000) return `₹${(r / 100000).toFixed(2)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(2)}k`;
  return `₹${Math.round(r)}`;
}

function buildYTicks(scaleMax: number): { label: string; value: number }[] {
  const maxV = Math.max(1, scaleMax);
  const n = 5;
  const ticks: { label: string; value: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const v = Math.round((maxV * (n - i)) / n);
    ticks.push({ label: String(v), value: v });
  }
  return ticks;
}

function pctChangeLabel(cur: number, prev: number): { text: string; positive: boolean | null } {
  if (prev === 0) {
    if (cur > 0) return { text: "↑ New", positive: true };
    return { text: "—", positive: null };
  }
  const raw = ((cur - prev) / prev) * 100;
  const p = Math.round(raw);
  if (p === 0) return { text: "0%", positive: null };
  return { text: `${p > 0 ? "↑" : "↓"} ${Math.abs(p)}%`, positive: p > 0 };
}

function formatUpdatedAgo(elapsedMs: number): string {
  const s = Math.floor(elapsedMs / 1000);
  if (s < 8) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function bucketAov(sales: number, orders: number): number {
  if (orders <= 0) return 0;
  return sales / orders;
}

/** Remove float noise and flat segments so empty / all-zero trends draw as a straight horizontal line. */
function flattenSparkSeries(values: number[], len: number): number[] {
  const a = Array.from({ length: len }, (_, i) => values[i] ?? 0);
  if (a.length === 0) return a;
  const minV = Math.min(...a);
  const maxV = Math.max(...a);
  const range = maxV - minV;
  const scaleTol = Math.max(1e-9, 1e-7 * Math.max(1, Math.abs(maxV), Math.abs(minV)));
  if (range <= scaleTol) {
    const v = (minV + maxV) / 2;
    return a.map(() => v);
  }
  return a;
}

function DualSparkline({
  current,
  compare,
  gradientId,
}: {
  current: number[];
  compare: number[];
  gradientId: string;
}) {
  const w = SPARK_W;
  const h = SPARK_H;
  const pad = 3;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const len = Math.max(current.length, compare.length, 2);
  let cur = Array.from({ length: len }, (_, i) => current[i] ?? 0);
  let cmp = Array.from({ length: len }, (_, i) => compare[i] ?? 0);
  cur = flattenSparkSeries(cur, len);
  cmp = flattenSparkSeries(cmp, len);
  const globalMaxRaw = Math.max(0, ...cur, ...cmp);
  if (globalMaxRaw < 1e-9) {
    cur = cur.map(() => 0);
    cmp = cmp.map(() => 0);
  }

  const max = Math.max(1, ...cur, ...cmp);
  const denom = Math.max(1, len - 1);
  const xs = (i: number) => pad + (i / denom) * plotW;
  const yAt = (v: number) => pad + plotH - (v / max) * plotH;

  const linePath = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${yAt(v)}`).join(" ");

  const bottomY = pad + plotH;
  const areaPath =
    len > 0
      ? `M ${xs(0)} ${bottomY} ` + cur.map((v, i) => `L ${xs(i)} ${yAt(v)}`).join(" ") + ` L ${xs(len - 1)} ${bottomY} Z`
      : "";

  return (
    <Svg width={w} height={h} accessibilityRole="image" accessibilityLabel="Trend chart">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GatiMitraMerchant.primary} stopOpacity="0.4" />
          <Stop offset="1" stopColor={GatiMitraMerchant.primary} stopOpacity="0.05" />
        </LinearGradient>
      </Defs>
      {areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      <Path
        d={linePath(cmp)}
        fill="none"
        stroke={GatiMitraMerchant.textTertiary}
        strokeWidth="1.5"
        strokeDasharray="5,5"
      />
      <Path d={linePath(cur)} fill="none" stroke={GatiMitraMerchant.navy} strokeWidth="2" />
    </Svg>
  );
}

function GrowthBarChart({ buckets, caption }: { buckets: GrowthBucket[]; caption: string }) {
  const maxBucket = useMemo(
    () => (buckets.length ? Math.max(...buckets.map((b) => b.orders_count), 1) : 1),
    [buckets]
  );
  const scaleMax = Math.max(50, Math.ceil(maxBucket / 10) * 10);
  const yTicks = useMemo(() => buildYTicks(scaleMax), [scaleMax]);

  if (!buckets.length) {
    return (
      <View style={styles.chartBlock}>
        <Text style={styles.chartCaption}>{caption}</Text>
      </View>
    );
  }

  return (
    <View style={styles.chartBlock}>
      <View style={styles.chartRow}>
        <View style={styles.chartPlot}>
          <View style={styles.barsRow}>
            {buckets.map((b, i, arr) => {
              const count = b.orders_count;
              const barH = Math.max(4, Math.round(Math.min(count / scaleMax, 1) * CHART_INNER_HEIGHT));
              const isLast = i === arr.length - 1;
              return (
                <View key={b.key} style={styles.barSlot}>
                  <View style={[styles.bar, { height: barH }, isLast ? styles.barCurrent : styles.barPast]} />
                </View>
              );
            })}
          </View>
          <View style={styles.chartAxis} />
          <View style={styles.tickRow}>
            {buckets.map((b) => (
              <Text key={`t-${b.key}`} style={styles.tickLabel} numberOfLines={1}>
                {b.label}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.yAxisCol}>
          {yTicks.map((t, yi) => (
            <Text
              key={`y-${yi}`}
              style={[
                styles.yTick,
                {
                  bottom: (t.value / scaleMax) * (CHART_INNER_HEIGHT - 12),
                },
              ]}
            >
              {t.label}
            </Text>
          ))}
        </View>
      </View>
      <Text style={styles.chartCaption}>{caption}</Text>
    </View>
  );
}

export default function GrowthScreen() {
  const scrollBottom = TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE;
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const { isOnline } = useStoreStatus();
  const storeId = selectedStore?.id ?? null;

  const [activeChip, setActiveChip] = useState<string>(FILTER_CHIPS[0]);
  const [period, setPeriod] = useState<GrowthPeriod>("today");
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<GrowthSummary | null>(null);
  const [businessData, setBusinessData] = useState<GrowthBusinessInsights | null>(null);
  const [livePreviewData, setLivePreviewData] = useState<LivePreviewInsights | null>(null);
  const [bizUpdatedAt, setBizUpdatedAt] = useState<number | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!storeId || !token) {
        setActivityData(null);
        setBusinessData(null);
        setLivePreviewData(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        if (activeChip === BUSINESS_CHIP) {
          const res = await fetchGrowthBusinessInsights(storeId, token, period);
          setBusinessData(res);
          setLivePreviewData(null);
          setBizUpdatedAt(Date.now());
        } else if (activeChip === FUNNEL_CHIP) {
          const res = await fetchLivePreviewInsights(storeId, token, period);
          setLivePreviewData(res);
          setBusinessData(null);
        } else {
          const res = await fetchGrowthSummary(storeId, token, period);
          setActivityData(res);
          setLivePreviewData(null);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load");
        if (activeChip === BUSINESS_CHIP) setBusinessData(null);
        else if (activeChip === FUNNEL_CHIP) setLivePreviewData(null);
        else setActivityData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [storeId, token, period, activeChip]
  );

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const timelyBuckets = activityData?.buckets?.length ? activityData.buckets : [];
  const weeklyBuckets = activityData?.weekly_buckets?.length ? activityData.weekly_buckets : [];

  const periodLabel = PERIOD_OPTIONS.find((o) => o.id === period)?.label ?? "Today";
  const isBusiness = activeChip === BUSINESS_CHIP;
  const isFunnel = activeChip === FUNNEL_CHIP;

  function liveMetricRow(label: string, display: string, pct: number | null) {
    return (
      <View key={label} style={[styles.bizMetricRow, styles.bizRowDivider]}>
        <View style={styles.bizMetricLeft}>
          <Text style={styles.bizMetricLabel}>{label}</Text>
          <View style={styles.bizMetricValueRow}>
            <Text style={styles.bizMetricValue}>{display}</Text>
            {pct != null ? (
              <Text
                style={[
                  styles.bizTrend,
                  pct > 0 && styles.bizTrendUp,
                  pct < 0 && styles.bizTrendDown,
                  pct === 0 && styles.bizTrendNeutral,
                ]}
              >
                {pct > 0 ? "+" : ""}
                {pct}%
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const bizSeries = useMemo(() => {
    if (!businessData?.buckets?.length) {
      return {
        salesCur: [] as number[],
        salesCmp: [] as number[],
        ordCur: [] as number[],
        ordCmp: [] as number[],
        aovCur: [] as number[],
        aovCmp: [] as number[],
      };
    }
    const salesCur: number[] = [];
    const salesCmp: number[] = [];
    const ordCur: number[] = [];
    const ordCmp: number[] = [];
    const aovCur: number[] = [];
    const aovCmp: number[] = [];
    for (const b of businessData.buckets) {
      salesCur.push(b.sales);
      salesCmp.push(b.compare_sales);
      ordCur.push(b.orders);
      ordCmp.push(b.compare_orders);
      aovCur.push(bucketAov(b.sales, b.orders));
      aovCmp.push(bucketAov(b.compare_sales, b.compare_orders));
    }
    return { salesCur, salesCmp, ordCur, ordCmp, aovCur, aovCmp };
  }, [businessData]);

  const xTickSample = businessData?.buckets?.length
    ? [0, Math.floor((businessData.buckets.length - 1) / 2), businessData.buckets.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i
      )
    : [];

  const onMailPress = useCallback(() => {
    Linking.openURL("mailto:support@gatimitra.com?subject=Business%20insights").catch(() => {
      Alert.alert("Email", "No mail app available.");
    });
  }, []);

  if (!storeId || !token) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Select a store to see growth</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottom }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={GatiMitraMerchant.primary} />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {FILTER_CHIPS.map((label) => {
          const active = label === activeChip;
          return (
            <Pressable
              key={label}
              onPress={() => setActiveChip(label)}
              style={({ pressed }) => [
                styles.chip,
                active ? styles.chipActive : styles.chipInactive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.chipLabel, active ? styles.chipLabelActive : styles.chipLabelInactive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isBusiness ? (
        <>
          <Text style={styles.bizPageTitle}>Business insights</Text>

          <View style={styles.bizToolbar}>
            <Pressable
              onPress={() => setPeriodMenuOpen(true)}
              style={({ pressed }) => [styles.bizDatePill, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Select comparison period"
            >
              <View style={styles.bizDateTextCol}>
                <Text style={styles.bizDatePrimary} numberOfLines={1}>
                  {businessData?.primary_header || periodLabel}
                </Text>
                <Text style={styles.bizDateSecondary} numberOfLines={2}>
                  {businessData?.compare_header || "Compared against previous period"}
                </Text>
              </View>
              <Ionicons name="calendar-outline" size={18} color={GatiMitraMerchant.navy} />
              <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.navy} />
            </Pressable>
            <Pressable
              onPress={onMailPress}
              style={({ pressed }) => [styles.bizMailBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Share by email"
            >
              <Ionicons name="mail-outline" size={20} color={GatiMitraMerchant.navy} />
            </Pressable>
          </View>

          <View style={[styles.card, styles.bizCard]}>
            {loading && !businessData ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
              </View>
            ) : (
              <>
                <View style={styles.bizCardHeader}>
                  <View>
                    <Text style={styles.bizCardTitle}>Business</Text>
                    <Text style={styles.bizCardSub}>
                      Last updated: {bizUpdatedAt != null ? formatUpdatedAgo(Date.now() - bizUpdatedAt) : "—"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => Alert.alert("Business", "Export and more options coming soon.")}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="More options"
                  >
                    <Ionicons name="ellipsis-vertical" size={20} color={GatiMitraMerchant.textSecondary} />
                  </Pressable>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {businessData ? (
                  <>
                    <View style={[styles.bizMetricRow, styles.bizRowDivider]}>
                      <View style={styles.bizMetricLeft}>
                        <Text style={styles.bizMetricLabel}>Net sales</Text>
                        <View style={styles.bizMetricValueRow}>
                          <Text style={styles.bizMetricValue}>{formatCompactINR(businessData.current.sales)}</Text>
                          {(() => {
                            const ch = pctChangeLabel(businessData.current.sales, businessData.compare.sales);
                            return (
                              <Text
                                style={[
                                  styles.bizTrend,
                                  ch.positive === true && styles.bizTrendUp,
                                  ch.positive === false && styles.bizTrendDown,
                                  ch.positive === null && styles.bizTrendNeutral,
                                ]}
                              >
                                {ch.text}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                      <DualSparkline current={bizSeries.salesCur} compare={bizSeries.salesCmp} gradientId="gBizSales" />
                    </View>

                    <View style={[styles.bizMetricRow, styles.bizRowDivider]}>
                      <View style={styles.bizMetricLeft}>
                        <Text style={styles.bizMetricLabel}>Orders</Text>
                        <View style={styles.bizMetricValueRow}>
                          <Text style={styles.bizMetricValue}>{String(businessData.current.orders)}</Text>
                          {(() => {
                            const ch = pctChangeLabel(businessData.current.orders, businessData.compare.orders);
                            return (
                              <Text
                                style={[
                                  styles.bizTrend,
                                  ch.positive === true && styles.bizTrendUp,
                                  ch.positive === false && styles.bizTrendDown,
                                  ch.positive === null && styles.bizTrendNeutral,
                                ]}
                              >
                                {ch.text}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                      <DualSparkline current={bizSeries.ordCur} compare={bizSeries.ordCmp} gradientId="gBizOrd" />
                    </View>

                    <View style={styles.bizMetricRow}>
                      <View style={styles.bizMetricLeft}>
                        <Text style={styles.bizMetricLabel}>Avg. order value</Text>
                        <View style={styles.bizMetricValueRow}>
                          <Text style={styles.bizMetricValue}>{formatCompactINR(businessData.current.aov)}</Text>
                          {(() => {
                            const ch = pctChangeLabel(businessData.current.aov, businessData.compare.aov);
                            return (
                              <Text
                                style={[
                                  styles.bizTrend,
                                  ch.positive === true && styles.bizTrendUp,
                                  ch.positive === false && styles.bizTrendDown,
                                  ch.positive === null && styles.bizTrendNeutral,
                                ]}
                              >
                                {ch.text}
                              </Text>
                            );
                          })()}
                        </View>
                      </View>
                      <DualSparkline current={bizSeries.aovCur} compare={bizSeries.aovCmp} gradientId="gBizAov" />
                    </View>

                    {xTickSample.length > 0 ? (
                      <View style={styles.bizXAxis}>
                        {xTickSample.map((idx) => (
                          <Text key={`x-${idx}`} style={styles.bizXTick} numberOfLines={1}>
                            {businessData.buckets[idx]?.label ?? ""}
                          </Text>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.bizLegend}>
                      <View style={styles.bizLegendItem}>
                        <View style={styles.bizLegendSolid} />
                        <Text style={styles.bizLegendText}>Selected range</Text>
                      </View>
                      <View style={styles.bizLegendItem}>
                        <Svg width={24} height={4} accessibilityElementsHidden>
                          <Path
                            d="M 0 2 L 24 2"
                            stroke={GatiMitraMerchant.textTertiary}
                            strokeWidth={2}
                            strokeDasharray="4,4"
                            fill="none"
                          />
                        </Svg>
                        <Text style={styles.bizLegendText}>Comparison</Text>
                      </View>
                    </View>
                  </>
                ) : !loading ? (
                  <Text style={styles.emptyText}>No data</Text>
                ) : null}
              </>
            )}
          </View>

          <MerchantMarketInsightsPanel storeId={storeId} />
        </>
      ) : isFunnel ? (
        <>
          <Text style={styles.bizPageTitle}>Live preview</Text>
          <View style={[styles.card, styles.bizCard]}>
            {loading && !livePreviewData ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
              </View>
            ) : livePreviewData ? (
              <>
                <Text style={styles.bizCardSub}>{livePreviewData.compare_header}</Text>
                <Text style={[styles.bizCardTitle, { marginTop: 8 }]}>Sales overview</Text>
                {liveMetricRow("Sales", livePreviewData.sales.sales.display, livePreviewData.sales.sales.pct_change)}
                {liveMetricRow("Delivered orders", livePreviewData.sales.delivered_orders.display, livePreviewData.sales.delivered_orders.pct_change)}
                {liveMetricRow("AOV", livePreviewData.sales.aov.display, livePreviewData.sales.aov.pct_change)}
                <Text style={[styles.bizCardTitle, { marginTop: 12 }]}>Customer experience</Text>
                {liveMetricRow("Ratings", livePreviewData.ratings.display, livePreviewData.ratings.pct_change)}
                {liveMetricRow("Rejected orders", livePreviewData.bad_orders.rejected.display, livePreviewData.bad_orders.rejected.pct_change)}
                {liveMetricRow("Delayed orders", livePreviewData.bad_orders.delayed.display, livePreviewData.bad_orders.delayed.pct_change)}
                {liveMetricRow("Poor rated", livePreviewData.bad_orders.poor_rated.display, livePreviewData.bad_orders.poor_rated.pct_change)}
                {liveMetricRow("Complaints", livePreviewData.complaints.display, livePreviewData.complaints.pct_change)}
                {liveMetricRow("Lost sales", livePreviewData.lost_sales.display, livePreviewData.lost_sales.pct_change)}
                {liveMetricRow("Online %", livePreviewData.online_pct.display, livePreviewData.online_pct.pct_change)}
                <Text style={[styles.bizCardTitle, { marginTop: 12 }]}>Customer funnel</Text>
                {liveMetricRow("Orders placed", livePreviewData.funnel.impressions.display, livePreviewData.funnel.impressions.pct_change)}
                {liveMetricRow("Accepted rate", livePreviewData.funnel.impressions_to_menu.display, livePreviewData.funnel.impressions_to_menu.pct_change)}
                {liveMetricRow("Prep rate", livePreviewData.funnel.menu_to_cart.display, livePreviewData.funnel.menu_to_cart.pct_change)}
                {liveMetricRow("Delivery rate", livePreviewData.funnel.cart_to_order.display, livePreviewData.funnel.cart_to_order.pct_change)}
                {liveMetricRow("New users", livePreviewData.user_segments.new_users.display, livePreviewData.user_segments.new_users.pct_change)}
                {liveMetricRow("Repeat users", livePreviewData.user_segments.repeat_users.display, livePreviewData.user_segments.repeat_users.pct_change)}
                {liveMetricRow("Lapsed users", livePreviewData.user_segments.lapsed_users.display, livePreviewData.user_segments.lapsed_users.pct_change)}
              </>
            ) : (
              <Text style={styles.emptyText}>No data</Text>
            )}
          </View>
          <MerchantMarketInsightsPanel storeId={storeId} />
        </>
      ) : (
        <View style={styles.card}>
          {loading && !activityData ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
            </View>
          ) : (
            <>
              <View style={styles.kpiRow}>
                <View style={styles.kpiLeft}>
                  <View style={styles.kpiCell}>
                    <Text style={styles.kpiLabel}>Total sales</Text>
                    <Text style={styles.kpiValue}>
                      {activityData != null ? formatCompactINR(activityData.total_sales) : "—"}
                    </Text>
                  </View>
                  <View style={styles.kpiCell}>
                    <Text style={styles.kpiLabel}>Total orders</Text>
                    <Text style={styles.kpiValue}>{activityData != null ? String(activityData.total_orders) : "—"}</Text>
                  </View>
                </View>
                <View style={styles.kpiRightCol}>
                  <Pressable
                    onPress={() => setPeriodMenuOpen(true)}
                    style={({ pressed }) => [styles.periodSelect, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Select date range"
                  >
                    <Text style={styles.periodSelectText} numberOfLines={1}>
                      {periodLabel}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.navy} />
                  </Pressable>
                  <View style={[styles.liveBadge, !isOnline && styles.liveBadgeOffline]}>
                    <View style={[styles.liveDot, !isOnline && styles.liveDotOffline]} />
                    <Text style={[styles.liveText, !isOnline && styles.liveTextOffline]}>
                      {isOnline ? "Live" : "Offline"}
                    </Text>
                  </View>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <GrowthBarChart buckets={timelyBuckets} caption="Order trends for the selected range." />
              <View style={styles.chartDivider} />
              <GrowthBarChart
                buckets={weeklyBuckets}
                caption="Visualizes order activity across the selected timeframe."
              />
            </>
          )}
        </View>
      )}

      <Modal visible={periodMenuOpen} transparent animationType="fade" onRequestClose={() => setPeriodMenuOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPeriodMenuOpen(false)}>
          <Pressable style={styles.periodSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.periodSheetTitle}>Date range</Text>
            {PERIOD_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => {
                  setPeriod(opt.id);
                  setPeriodMenuOpen(false);
                }}
                style={({ pressed }) => [styles.periodRow, period === opt.id && styles.periodRowActive, pressed && styles.pressed]}
              >
                <Text style={[styles.periodRowText, period === opt.id && styles.periodRowTextActive]}>{opt.label}</Text>
                {period === opt.id ? (
                  <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />
                ) : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const CHIP_RADIUS = 999;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: H_PADDING,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  emptyText: {
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  loadingBlock: {
    paddingVertical: 32,
    alignItems: "center",
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 14,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: CHIP_RADIUS,
    borderWidth: 1,
  },
  chipInactive: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderColor: GatiMitraMerchant.border,
  },
  chipActive: {
    backgroundColor: GatiMitraMerchant.navy,
    borderColor: GatiMitraMerchant.navy,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  chipLabelInactive: {
    color: GatiMitraMerchant.navy,
  },
  chipLabelActive: {
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 16,
  },
  bizCard: {
    ...GatiMitraMerchant.shadowCard,
  },
  bizPageTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  bizToolbar: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 14,
  },
  bizDatePill: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  bizDateTextCol: {
    flex: 1,
    minWidth: 0,
  },
  bizDatePrimary: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
  },
  bizDateSecondary: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 15,
  },
  bizMailBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  bizCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  bizCardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
  },
  bizCardSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  bizMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 14,
  },
  bizRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: Platform.OS === "ios" ? "dashed" : "solid",
    borderBottomColor: GatiMitraMerchant.divider,
  },
  bizMetricLeft: {
    flex: 1,
    minWidth: 0,
  },
  bizMetricLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  bizMetricValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
  },
  bizMetricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    letterSpacing: -0.4,
  },
  bizTrend: {
    fontSize: 13,
    fontWeight: "800",
  },
  bizTrendUp: {
    color: GatiMitraMerchant.primaryDark,
  },
  bizTrendDown: {
    color: GatiMitraMerchant.error,
  },
  bizTrendNeutral: {
    color: GatiMitraMerchant.textTertiary,
  },
  bizXAxis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingHorizontal: 0,
  },
  bizXTick: {
    fontSize: 9,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    maxWidth: 56,
    textAlign: "center",
  },
  bizLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.divider,
  },
  bizLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bizLegendSolid: {
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.navy,
  },
  bizLegendText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
    gap: 10,
  },
  kpiLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 8,
  },
  kpiRightCol: {
    alignItems: "stretch",
    gap: 8,
    minWidth: 118,
  },
  periodSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  periodSelectText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
  },
  kpiCell: {
    flex: 1,
    minWidth: 0,
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    letterSpacing: -0.5,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(62, 180, 137, 0.16)",
  },
  liveBadgeOffline: {
    backgroundColor: "rgba(148, 163, 184, 0.2)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.primaryDark,
  },
  liveDotOffline: {
    backgroundColor: GatiMitraMerchant.textTertiary,
  },
  liveText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.primaryDark,
  },
  liveTextOffline: {
    color: GatiMitraMerchant.textSecondary,
  },
  chartBlock: {
    marginTop: 4,
  },
  chartDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.divider,
    marginVertical: 18,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  chartPlot: {
    flex: 1,
    minWidth: 0,
  },
  yAxisCol: {
    width: 28,
    height: CHART_INNER_HEIGHT,
    position: "relative",
  },
  yTick: {
    position: "absolute",
    right: 0,
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 12,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: CHART_INNER_HEIGHT,
    gap: 2,
    paddingHorizontal: 0,
  },
  barSlot: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 3,
  },
  barPast: {
    backgroundColor: GatiMitraMerchant.navyLight,
  },
  barCurrent: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  chartAxis: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.border,
    marginTop: 6,
  },
  tickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 2,
  },
  tickLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  chartCaption: {
    marginTop: 12,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: GatiMitraMerchant.error,
    textAlign: "center",
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 58, 95, 0.35)",
    justifyContent: "center",
    padding: 24,
  },
  periodSheet: {
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingVertical: 8,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  periodSheetTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 4,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  periodRowActive: {
    backgroundColor: "rgba(62, 180, 137, 0.08)",
  },
  periodRowText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
  },
  periodRowTextActive: {
    color: GatiMitraMerchant.primaryDark,
  },
});
