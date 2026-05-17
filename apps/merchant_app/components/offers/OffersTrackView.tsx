import { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Offer } from "@/services/offersApi";
import { aggregateOffersPerformance, formatOfferInr } from "@/lib/offers/offer-analytics";
import {
  countOffersForTrackFilter,
  offerMatchesTrackFilter,
  type OfferTrackFilter,
} from "@/lib/offers/offer-lifecycle";
import { OfferTrackCard } from "./OfferTrackCard";
import { OFFERS_UI, offersSharedStyles } from "./offers-theme";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

type TrackPill = { id: OfferTrackFilter; label: string };

const TRACK_PILLS: TrackPill[] = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Stopped" },
  { id: "scheduled", label: "Scheduled" },
];

type Props = {
  offers: Offer[];
  loading: boolean;
  refreshing: boolean;
  storeName: string | null;
  trackFilter: OfferTrackFilter;
  onTrackFilterChange: (f: OfferTrackFilter) => void;
  onRefresh: () => void;
  onCreatePress: () => void;
  onOpenInsights: () => void;
  onEdit: (o: Offer) => void;
  onToggle: (o: Offer) => void;
  onDelete: (o: Offer) => void;
};

function PerformanceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.perfRow}>
      <Text style={styles.perfLabel}>{label}</Text>
      <Text style={styles.perfValue}>{value}</Text>
    </View>
  );
}

export function OffersTrackView({
  offers,
  loading,
  refreshing,
  storeName,
  trackFilter,
  onTrackFilterChange,
  onRefresh,
  onCreatePress,
  onOpenInsights,
  onEdit,
  onToggle,
  onDelete,
}: Props) {
  const filtered = useMemo(
    () => offers.filter((o) => offerMatchesTrackFilter(o, trackFilter)),
    [offers, trackFilter]
  );
  const overall = useMemo(() => aggregateOffersPerformance(offers), [offers]);
  const pillCounts = useMemo(
    () => ({
      active: countOffersForTrackFilter(offers, "active"),
      inactive: countOffersForTrackFilter(offers, "inactive"),
      scheduled: countOffersForTrackFilter(offers, "scheduled"),
    }),
    [offers]
  );

  if (loading && offers.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingHint}>Loading your offers…</Text>
      </View>
    );
  }

  if (offers.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIcon}>
          <Ionicons name="pricetag-outline" size={36} color={GatiMitraMerchant.primary} />
        </View>
        <Text style={styles.emptyTitle}>No offers yet</Text>
        <Text style={styles.emptySub}>
          Run your first campaign to bring more orders to {storeName ?? "your store"}.
        </Text>
        <Pressable onPress={onCreatePress} style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.9 }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.emptyBtnText}>Create first offer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={offersSharedStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GatiMitraMerchant.primary}
            colors={[GatiMitraMerchant.primary]}
          />
        }
      >
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Overall performance</Text>
          <Text style={styles.sectionSub}>{offers.length} campaign{offers.length === 1 ? "" : "s"} total</Text>
        </View>

        <View style={[offersSharedStyles.card, styles.perfCard]}>
          <View style={styles.perfHeader}>
            <View style={styles.perfHeaderIcon}>
              <Ionicons name="stats-chart" size={18} color={GatiMitraMerchant.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateMain}>All campaigns</Text>
              <Text style={styles.dateSub}>Lifetime metrics from your offers</Text>
            </View>
          </View>

          <PerformanceRow label="Gross sales from offers" value={formatOfferInr(overall.gross)} />
          <PerformanceRow label="Orders from offers" value={String(overall.orders)} />
          <PerformanceRow label="Discount given" value={formatOfferInr(overall.discount)} />
          <PerformanceRow label="Effective discount" value={`${overall.effPct}%`} />

          <Pressable
            onPress={onOpenInsights}
            style={({ pressed }) => [styles.detailPerfBtn, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.detailPerfText}>Detailed performance</Text>
            <Ionicons name="arrow-forward" size={16} color={GatiMitraMerchant.primary} />
          </Pressable>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Campaign performance</Text>
          <Text style={styles.sectionSub}>
            {filtered.length} shown · {pillCounts.active} live now
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
          style={styles.pillsWrap}
        >
          {TRACK_PILLS.map((pill) => {
            const selected = trackFilter === pill.id;
            const count = pillCounts[pill.id];
            return (
              <Pressable
                key={pill.id}
                onPress={() => onTrackFilterChange(pill.id)}
                style={[styles.pill, selected && styles.pillActive]}
              >
                <Text style={[styles.pillText, selected && styles.pillTextActive]}>{pill.label}</Text>
                <View style={[styles.pillCount, selected && styles.pillCountActive]}>
                  <Text style={[styles.pillCountText, selected && styles.pillCountTextActive]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={styles.filterEmpty}>
            <Ionicons name="filter-outline" size={28} color={OFFERS_UI.textFaint} />
            <Text style={styles.filterEmptyTitle}>No {trackFilter === "inactive" ? "stopped" : trackFilter} offers</Text>
            <Text style={styles.filterEmptySub}>Try another filter or create a new campaign.</Text>
            <Pressable onPress={onCreatePress} style={styles.filterCta}>
              <Text style={styles.filterCtaText}>Create offer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((o) => (
              <OfferTrackCard
                key={o.offer_id || String(o.id)}
                offer={o}
                storeName={storeName}
                onEdit={() => onEdit(o)}
                onToggle={() => onToggle(o)}
                onDelete={() => onDelete(o)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={onCreatePress}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }] }]}
        accessibilityLabel="Create new offer"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  loadingHint: { fontSize: 13, color: OFFERS_UI.textMuted },
  sectionHead: {
    paddingHorizontal: H_PADDING,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: OFFERS_UI.text,
  },
  sectionSub: { fontSize: 12, color: OFFERS_UI.textFaint, fontWeight: "500" },
  perfCard: { padding: 0, overflow: "hidden" },
  perfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 12,
    backgroundColor: OFFERS_UI.accentSoft,
    borderBottomWidth: 1,
    borderBottomColor: OFFERS_UI.cardBorder,
  },
  perfHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dateMain: { fontSize: 16, fontWeight: "800", color: OFFERS_UI.text },
  dateSub: { fontSize: 12, color: OFFERS_UI.textMuted, marginTop: 2 },
  perfRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: OFFERS_UI.metricDivider,
  },
  perfLabel: { fontSize: 14, color: OFFERS_UI.textMuted, flex: 1, paddingRight: 12 },
  perfValue: { fontSize: 15, fontWeight: "800", color: OFFERS_UI.text },
  detailPerfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
  },
  detailPerfText: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.primary },
  pillsWrap: { marginBottom: 14 },
  pillsScroll: { paddingHorizontal: H_PADDING, gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: OFFERS_UI.pillInactiveBg,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
  },
  pillActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  pillText: { fontSize: 14, fontWeight: "600", color: OFFERS_UI.pillInactiveText },
  pillTextActive: { color: "#fff", fontWeight: "700" },
  pillCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pillCountActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  pillCountText: { fontSize: 11, fontWeight: "800", color: OFFERS_UI.textMuted },
  pillCountTextActive: { color: "#fff" },
  list: { paddingHorizontal: H_PADDING },
  filterEmpty: {
    marginHorizontal: H_PADDING,
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: OFFERS_UI.cardBorder,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    gap: 8,
  },
  filterEmptyTitle: { fontSize: 15, fontWeight: "700", color: OFFERS_UI.text, marginTop: 4 },
  filterEmptySub: { fontSize: 13, color: OFFERS_UI.textMuted, textAlign: "center" },
  filterCta: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
  },
  filterCtaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: H_PADDING, paddingBottom: 80 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: OFFERS_UI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: OFFERS_UI.text },
  emptySub: {
    fontSize: 14,
    color: OFFERS_UI.textMuted,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    maxWidth: 300,
    lineHeight: 21,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GatiMitraMerchant.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  fab: {
    position: "absolute",
    right: H_PADDING,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    ...GatiMitraMerchant.shadowSm,
  },
});
