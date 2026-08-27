import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchMarketInsights,
  type MarketMatchScope,
  type MerchantMarketInsights,
} from "@/services/marketApi";
import {
  buildCompetitorLeaderboard,
  type CompetitorLeaderboardRow,
} from "@/lib/competitorLeaderboard";

const TOP_N = 10;

function MatchScopeToggle({
  scope,
  onChange,
}: {
  scope: MarketMatchScope;
  onChange: (s: MarketMatchScope) => void;
}) {
  return (
    <View style={styles.scopeRow}>
      {(["city", "locality"] as const).map((s) => {
        const active = scope === s;
        return (
          <Pressable
            key={s}
            onPress={() => onChange(s)}
            style={[styles.scopeBtn, active && styles.scopeBtnActive]}
          >
            <Text style={[styles.scopeBtnText, active && styles.scopeBtnTextActive]}>
              {s === "city" ? "City" : "Locality"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TrendPill({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) {
    return <Text style={styles.trendNeutral}>—</Text>;
  }
  const up = delta > 0;
  const pct = delta * 5;
  return (
    <View style={[styles.trendPill, up ? styles.trendUp : styles.trendDown]}>
      <Ionicons name={up ? "arrow-up" : "arrow-down"} size={10} color={up ? "#047857" : "#B91C1C"} />
      <Text style={[styles.trendText, up ? styles.trendTextUp : styles.trendTextDown]}>
        {pct > 0 ? "+" : ""}
        {pct}%
      </Text>
    </View>
  );
}

function CompetitorRowView({ c }: { c: CompetitorLeaderboardRow }) {
  if (c.is_own) {
    return (
      <View style={[styles.row, styles.ownRow]}>
        <View style={styles.ownLeft}>
          <Text style={styles.ownRank}>{c.display_rank}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.ownName} numberOfLines={1}>
              {c.name}
            </Text>
            <Text style={styles.ownSub}>Your store</Text>
          </View>
        </View>
        <Text style={styles.ownAffinity}>{c.affinity_pct.toFixed(1)}%</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.name} numberOfLines={2}>
        <Text style={styles.rank}>{c.display_rank} </Text>
        {c.name}
      </Text>
      <View style={styles.metrics}>
        <Text style={styles.affinity}>{c.affinity_pct.toFixed(1)}%</Text>
        <TrendPill delta={c.rank_delta} />
      </View>
    </View>
  );
}

export function MerchantMarketInsightsPanel({ storeId }: { storeId: number | null }) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [matchScope, setMatchScope] = useState<MarketMatchScope>("city");
  const [insights, setInsights] = useState<MerchantMarketInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicStoreId = selectedStore?.store_id ?? "";

  const load = useCallback(async () => {
    if (storeId == null || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMarketInsights(storeId, token, matchScope);
      setInsights(data);
    } catch (e) {
      setError((e as Error).message);
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, token, matchScope]);

  useEffect(() => {
    void load();
  }, [load]);

  const leaderboard = useMemo(() => {
    if (!insights) return [];
    return buildCompetitorLeaderboard({
      competitors: insights.competitors ?? [],
      storeId: publicStoreId || String(storeId ?? ""),
      ownName: insights.store_name || selectedStore?.store_name || "Your store",
      ownLogoUrl: insights.store_logo_url,
      ownAffinityPct: Number(insights.your_affinity_pct) || 0,
    }).slice(0, TOP_N);
  }, [insights, publicStoreId, storeId, selectedStore?.store_name]);

  const hasPeers = leaderboard.some((r) => !r.is_own);

  if (storeId == null) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="people" size={18} color="#7C3AED" />
          <Text style={styles.title}>Competitors</Text>
          <Ionicons name="information-circle-outline" size={16} color="#94A3B8" />
        </View>
        <MatchScopeToggle scope={matchScope} onChange={setMatchScope} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={GatiMitraMerchant.primary} />
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !hasPeers ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyHint}>
            {matchScope === "locality"
              ? "No competitors in your pincode yet."
              : "No competitors in your city yet."}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {leaderboard.map((c) => (
            <CompetitorRowView key={c.id} c={c} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: H_PADDING,
    marginTop: 12,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  scopeRow: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#F8FAFC",
    padding: 2,
  },
  scopeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  scopeBtnActive: { backgroundColor: GatiMitraMerchant.cardBg },
  scopeBtnText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  scopeBtnTextActive: { color: "#6D28D9" },
  loader: { marginVertical: 24 },
  errorText: { color: "#B91C1C", textAlign: "center", padding: 16, fontSize: 13 },
  emptyWrap: {
    minHeight: 200,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  emptyHint: {
    textAlign: "center",
    color: GatiMitraMerchant.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  list: { borderTopWidth: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
    gap: 8,
  },
  ownRow: {
    backgroundColor: "#059669",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0,
    marginVertical: 6,
    overflow: "hidden",
  },
  ownLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  ownRank: {
    fontSize: 11,
    fontWeight: "800",
    color: "#047857",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ownName: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  ownSub: { fontSize: 10, fontWeight: "600", color: "#D1FAE5", marginTop: 1 },
  ownAffinity: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  rank: { fontSize: 11, fontWeight: "700", color: "#B45309" },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  metrics: { flexDirection: "row", alignItems: "center", gap: 8 },
  affinity: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  trendPill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  trendUp: { backgroundColor: "#ECFDF5" },
  trendDown: { backgroundColor: "#FEF2F2" },
  trendText: { fontSize: 11, fontWeight: "700", marginLeft: 2 },
  trendTextUp: { color: "#047857" },
  trendTextDown: { color: "#B91C1C" },
  trendNeutral: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
});
