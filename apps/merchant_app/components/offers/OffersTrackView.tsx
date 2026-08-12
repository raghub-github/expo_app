import { useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Offer } from "@/services/offersApi";
import { OfferStorePickSheet } from "@/components/offers/OfferStorePickSheet";
import { aggregateOffersPerformance, formatOfferInr } from "@/lib/offers/offer-analytics";
import {
  countOffersForTrackFilter,
  offerMatchesTrackFilter,
  type OfferTrackFilter,
} from "@/lib/offers/offer-lifecycle";
import { OfferTrackCard } from "./OfferTrackCard";
import { OFFERS_UI, offersSharedStyles } from "./offers-theme";
import type { ChildStore } from "@/context/AuthContext";
import { AppAssetImage } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";
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
  stores: ChildStore[];
  trackStoreFilter: number | "all";
  onTrackStoreFilterChange: (filter: number | "all") => void;
  storeNameById: Map<number, string>;
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
  stores,
  trackStoreFilter,
  onTrackStoreFilterChange,
  storeNameById,
  trackFilter,
  onTrackFilterChange,
  onRefresh,
  onCreatePress,
  onOpenInsights,
  onEdit,
  onToggle,
  onDelete,
}: Props) {
  const [storeSheetVisible, setStoreSheetVisible] = useState(false);
  const filtered = useMemo(
    () => offers.filter((o) => offerMatchesTrackFilter(o, trackFilter)),
    [offers, trackFilter]
  );
  const overall = useMemo(() => aggregateOffersPerformance(offers), [offers]);
  const pillCounts = useMemo(
    () => ({
      all: countOffersForTrackFilter(offers, "all"),
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

  const storeFilterLabel =
    trackStoreFilter === "all"
      ? `All restaurants (${stores.length})`
      : storeNameById.get(trackStoreFilter) ?? storeName ?? "Restaurant";

  const performanceBlock = (
    <>
      {stores.length > 1 ? (
        <Pressable
          onPress={() => setStoreSheetVisible(true)}
          style={({ pressed }) => [styles.storePicker, pressed && { opacity: 0.92 }]}
        >
          <View style={styles.storePickerIcon}>
            <Ionicons name="storefront-outline" size={18} color={GatiMitraMerchant.textPrimary} />
          </View>
          <Text style={styles.storePickerText} numberOfLines={1}>
            {storeFilterLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color={GatiMitraMerchant.textSecondary} />
        </Pressable>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Overall performance</Text>
        <Text style={styles.sectionSub}>
          {offers.length} campaign{offers.length === 1 ? "" : "s"}
          {trackStoreFilter === "all" && stores.length > 1 ? " · all outlets" : ""}
        </Text>
      </View>

      <View style={[offersSharedStyles.card, styles.perfCard]}>
        <View style={styles.perfHeader}>
          <View style={styles.perfHeaderIcon}>
            <Ionicons name="stats-chart" size={18} color={GatiMitraMerchant.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateMain}>
              {trackStoreFilter === "all" ? "All campaigns" : storeFilterLabel}
            </Text>
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
    </>
  );

  if (offers.length === 0) {
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
          {performanceBlock}
          <View style={styles.emptyInline}>
            <View style={styles.emptyHaloSm}>
              <AppAssetImage
                assetKey={MX.offers.emptyRunning}
                style={styles.emptyArtSm}
                resizeMode="contain"
                accessibilityLabel="No running offers"
              />
            </View>
            <Text style={styles.filterEmptyTitle}>There are no offers yet</Text>
            <Text style={styles.filterEmptySub}>Create a promo to start tracking performance here.</Text>
            <Pressable onPress={onCreatePress} style={styles.filterCta}>
              <Text style={styles.filterCtaText}>Create offer</Text>
            </Pressable>
          </View>
        </ScrollView>
        <OfferStorePickSheet
          visible={storeSheetVisible}
          stores={stores}
          initialStoreId={trackStoreFilter === "all" ? null : trackStoreFilter}
          title="View offers for"
          proceedLabel="Apply"
          showAllRestaurants
          onClose={() => setStoreSheetVisible(false)}
          onPickAll={() => onTrackStoreFilterChange("all")}
          onProceed={(store) => onTrackStoreFilterChange(store.id)}
        />
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
        {performanceBlock}

        <View style={[styles.sectionHead, styles.campaignSectionHead]}>
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
                storeName={
                  o.store_id != null
                    ? storeNameById.get(o.store_id) ?? storeName
                    : storeName
                }
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

      <OfferStorePickSheet
        visible={storeSheetVisible}
        stores={stores}
        initialStoreId={trackStoreFilter === "all" ? null : trackStoreFilter}
        title="View offers for"
        proceedLabel="Apply"
        showAllRestaurants
        onClose={() => setStoreSheetVisible(false)}
        onPickAll={() => onTrackStoreFilterChange("all")}
        onProceed={(store) => onTrackStoreFilterChange(store.id)}
      />
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
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 4,
  },
  campaignSectionHead: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: OFFERS_UI.text,
  },
  sectionSub: { fontSize: 12, color: OFFERS_UI.textFaint, fontWeight: "500" },
  storePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: H_PADDING,
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
  },
  storePickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  storePickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: OFFERS_UI.text,
  },
  perfCard: { padding: 0, overflow: "hidden", marginBottom: 4 },
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
  emptyInline: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: OFFERS_UI.cardBorder,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    gap: 8,
  },
  emptyHaloSm: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyArtSm: { width: 72, height: 72 },
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
