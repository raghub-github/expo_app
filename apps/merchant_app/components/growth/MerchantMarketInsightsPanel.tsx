import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import {
  fetchMarketInsights,
  type CompetitorRow,
  type MarketMatchScope,
} from "@/services/marketApi";

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

function CompetitorRowView({ c }: { c: CompetitorRow }) {
  return (
    <View style={styles.row}>
      <Text style={styles.name} numberOfLines={2}>
        <Text style={styles.rank}>#{c.rank} </Text>
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
  const [matchScope, setMatchScope] = useState<MarketMatchScope>("city");
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (storeId == null || !token) return;
    setLoading(true);
    setError(null);
    try {
      const insights = await fetchMarketInsights(storeId, token, matchScope);
      setCompetitors((insights.competitors ?? []).slice(0, TOP_N));
    } catch (e) {
      setError((e as Error).message);
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, token, matchScope]);

  useEffect(() => {
    void load();
  }, [load]);

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
      ) : competitors.length === 0 ? (
        <View style={styles.emptyWrap}>
        <Text style={styles.emptyHint}>
          {matchScope === "locality"
            ? "No competitors in your pincode yet."
            : "No competitors in your city yet."}
        </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {competitors.map((c) => (
            <CompetitorRowView key={c.competitor_store_id} c={c} />
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
  scopeBtnActive: { backgroundColor: GatiMitraMerchant.surface },
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
  rank: { fontSize: 10, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
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
