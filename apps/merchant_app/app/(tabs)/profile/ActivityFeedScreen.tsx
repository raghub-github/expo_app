import { useEffect, useState, useCallback, useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, TAB_BAR_SCROLL_CONTENT_PADDING } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { fetchActivityFeed, type ActivityFeedItem } from "@/services/activityFeedApi";

const SECTION_ICONS: Record<string, string> = {
  bank_account: "card-outline",
  offer: "pricetag-outline",
  menu_item: "restaurant-outline",
  combo: "layers-outline",
  addon: "options-outline",
  customization: "construct-outline",
  category: "folder-outline",
  store_settings: "settings-outline",
  variant: "git-branch-outline",
};

const SECTION_COLORS: Record<string, string> = {
  bank_account: "#3b82f6",
  offer: "#f97316",
  menu_item: "#16a34a",
  combo: "#8b5cf6",
  addon: "#06b6d4",
  customization: "#ec4899",
  category: "#6366f1",
  store_settings: "#64748b",
  variant: "#a855f7",
};

const SOURCE_LABELS: Record<string, string> = {
  merchant_app: "App",
  partnersite: "Partner Site",
  dashboard: "Dashboard",
};

const ACTOR_LABELS: Record<string, string> = {
  merchant: "Merchant",
  agent: "Agent",
  system: "System",
};

const SECTION_FILTERS = [
  "all",
  "bank_account",
  "offer",
  "menu_item",
  "combo",
  "addon",
  "variant",
  "customization",
  "category",
  "combo_component",
] as const;

const SECTION_LABELS: Record<string, string> = {
  all: "All",
  bank_account: "Bank",
  offer: "Offers",
  menu_item: "Menu Items",
  combo: "Combos",
  addon: "Addons",
  variant: "Variants",
  customization: "Customizations",
  category: "Categories",
  combo_component: "Combo Items",
};

const SOURCE_FILTERS = ["all", "merchant_app", "partnersite", "dashboard"] as const;
const SOURCE_FILTER_LABELS: Record<string, string> = {
  all: "All Sources",
  merchant_app: "App",
  partnersite: "Partner Site",
  dashboard: "Dashboard",
};

const ACTOR_FILTERS = ["all", "merchant", "agent"] as const;
const ACTOR_FILTER_LABELS: Record<string, string> = {
  all: "Everyone",
  merchant: "Merchant",
  agent: "Agent",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PILL_RADIUS = 8;
const PILL_ACTIVE_BG = GatiMitraMerchant.navy;

function parseActivityDate(dateStr: string): Date | null {
  if (!dateStr?.trim()) return null;
  let raw = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(raw)) {
    raw = raw.replace(" ", "T");
  }
  const attempts = [raw, `${raw}Z`];
  for (const candidate of attempts) {
    const d = new Date(candidate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function formatActivityWhen(dateStr: string): string {
  const d = parseActivityDate(dateStr);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(d);
}

function formatActivityRelative(dateStr: string): string {
  const d = parseActivityDate(dateStr);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatActivityWhen(dateStr);
}

function ActivityCard({ item }: { item: ActivityFeedItem }) {
  const icon = SECTION_ICONS[item.section] ?? "ellipse-outline";
  const color = SECTION_COLORS[item.section] ?? "#64748b";
  const when = formatActivityWhen(item.created_at);
  const relative = formatActivityRelative(item.created_at);

  return (
    <View style={styles.card}>
      <View style={[styles.iconCircle, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={color} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardSummary} numberOfLines={3}>
            {item.summary}
          </Text>
          {relative ? (
            <Text style={styles.relativeText} numberOfLines={1}>
              {relative}
            </Text>
          ) : null}
        </View>
        {when ? (
          <View style={styles.dateRow}>
            <Ionicons name="time-outline" size={12} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.dateText}>{when}</Text>
          </View>
        ) : null}
        <View style={styles.cardMeta}>
          <View
            style={[
              styles.sourceBadge,
              { backgroundColor: item.actor_type === "agent" ? "#fef3c7" : "#e0f2fe" },
            ]}
          >
            <Text
              style={[
                styles.sourceBadgeText,
                { color: item.actor_type === "agent" ? "#92400e" : "#0369a1" },
              ]}
            >
              {ACTOR_LABELS[item.actor_type] ?? item.actor_type}
            </Text>
          </View>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.sourceText}>{SOURCE_LABELS[item.source] ?? item.source}</Text>
          {item.actor_name ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.actorText} numberOfLines={1}>
                {item.actor_name}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function ActivityFeedScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [showAllTime, setShowAllTime] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!storeId || !token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const sinceIso = !showAllTime
          ? new Date(Date.now() - SEVEN_DAYS_MS).toISOString()
          : undefined;
        const list = await fetchActivityFeed(storeId, token, {
          limit: showAllTime ? 200 : 100,
          section: sectionFilter !== "all" ? sectionFilter : undefined,
          source: sourceFilter !== "all" ? sourceFilter : undefined,
          actor_type: actorFilter !== "all" ? actorFilter : undefined,
          since: sinceIso,
        });
        setActivities(list);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [storeId, token, sectionFilter, sourceFilter, actorFilter, showAllTime]
  );

  useEffect(() => {
    load();
  }, [load]);

  const hasExtraFilters =
    sectionFilter !== "all" || sourceFilter !== "all" || actorFilter !== "all";

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.pillsBleed}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillsScrollView}
            contentContainerStyle={styles.pillsRow}
          >
            <Pressable
              onPress={() => setShowAllTime(false)}
              style={[styles.pill, !showAllTime && styles.pillActive]}
            >
              <Text style={[styles.pillText, !showAllTime && styles.pillTextActive]}>
                Last 7 days
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAllTime(true)}
              style={[styles.pill, showAllTime && styles.pillActive]}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={showAllTime ? "#fff" : GatiMitraMerchant.navy}
              />
              <Text style={[styles.pillText, showAllTime && styles.pillTextActive]}>
                All history
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFiltersOpen((v) => !v)}
              style={[styles.pill, filtersOpen && styles.pillActive, hasExtraFilters && !filtersOpen && styles.pillHasFilters]}
            >
              <Ionicons
                name="options-outline"
                size={13}
                color={filtersOpen || hasExtraFilters ? "#fff" : GatiMitraMerchant.navy}
              />
              <Text style={[styles.pillText, (filtersOpen || hasExtraFilters) && styles.pillTextActive]}>
                Filters
              </Text>
              {hasExtraFilters && !filtersOpen ? <View style={styles.filtersDot} /> : null}
              <Ionicons
                name={filtersOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={filtersOpen || hasExtraFilters ? "#fff" : GatiMitraMerchant.textSecondary}
              />
            </Pressable>
          </ScrollView>
        </View>

        {filtersOpen ? (
          <View style={styles.filtersPanel}>
            <Text style={styles.filterLabel}>Section</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              {SECTION_FILTERS.map((f) => (
                <FilterChip
                  key={f}
                  label={SECTION_LABELS[f] ?? f}
                  active={sectionFilter === f}
                  onPress={() => setSectionFilter(f)}
                />
              ))}
            </ScrollView>

            <Text style={styles.filterLabel}>Source</Text>
            <View style={styles.filterRow}>
              {SOURCE_FILTERS.map((f) => (
                <FilterChip
                  key={f}
                  label={SOURCE_FILTER_LABELS[f] ?? f}
                  active={sourceFilter === f}
                  onPress={() => setSourceFilter(f)}
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Done by</Text>
            <View style={styles.filterRow}>
              {ACTOR_FILTERS.map((f) => (
                <FilterChip
                  key={f}
                  label={ACTOR_FILTER_LABELS[f] ?? f}
                  active={actorFilter === f}
                  onPress={() => setActorFilter(f)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    ),
    [showAllTime, filtersOpen, hasExtraFilters, sectionFilter, sourceFilter, actorFilter]
  );

  if (!storeId || !token) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.emptyText}>Sign in and select a store.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loading && activities.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={GatiMitraMerchant.navy} />
        </View>
      ) : activities.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={GatiMitraMerchant.navy}
            />
          }
        >
          {listHeader}
          <View style={styles.emptyBlock}>
            <Ionicons name="time-outline" size={40} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyTitle}>
              {showAllTime ? "No activity yet" : "No activity in the last 7 days"}
            </Text>
            <Text style={styles.emptyText}>
              {showAllTime
                ? "Changes to menu, offers, and settings will show up here."
                : "Try viewing all history or adjust filters."}
            </Text>
            {!showAllTime ? (
              <Pressable onPress={() => setShowAllTime(true)} style={styles.emptyAction}>
                <Text style={styles.emptyActionText}>View all history</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ActivityCard item={item} />}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={GatiMitraMerchant.navy}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 48 },
  emptyScroll: {
    flexGrow: 1,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING,
  },
  emptyBlock: { alignItems: "center", paddingHorizontal: 32, paddingTop: 32, paddingBottom: 24 },
  listHeader: {
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  pillsBleed: {
    marginHorizontal: -H_PADDING,
  },
  pillsScrollView: {
    flexGrow: 0,
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: H_PADDING,
  },
  pill: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: PILL_RADIUS,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  pillActive: {
    backgroundColor: PILL_ACTIVE_BG,
    borderColor: PILL_ACTIVE_BG,
    borderRadius: PILL_RADIUS,
  },
  pillHasFilters: {
    backgroundColor: PILL_ACTIVE_BG,
    borderColor: PILL_ACTIVE_BG,
    borderRadius: PILL_RADIUS,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  pillTextActive: {
    color: "#fff",
  },
  filtersDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginLeft: -2,
  },
  filtersPanel: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 12,
    gap: 8,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterScroll: { flexGrow: 0 },
  filterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: PILL_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  filterChipActive: {
    backgroundColor: PILL_ACTIVE_BG,
    borderColor: PILL_ACTIVE_BG,
  },
  filterText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  filterTextActive: { color: "#fff" },
  list: {
    paddingHorizontal: H_PADDING,
    paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 8,
    ...GatiMitraMerchant.shadowSm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBody: { flex: 1, minWidth: 0, gap: 6 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardSummary: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 18,
  },
  relativeText: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
    flexShrink: 0,
    maxWidth: 56,
    textAlign: "right",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
  },
  cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: PILL_RADIUS },
  sourceBadgeText: { fontSize: 10, fontWeight: "700" },
  metaDot: { fontSize: 10, color: GatiMitraMerchant.textTertiary, fontWeight: "700" },
  sourceText: { fontSize: 10, color: GatiMitraMerchant.textTertiary, fontWeight: "600" },
  actorText: {
    fontSize: 10,
    color: GatiMitraMerchant.textSecondary,
    fontWeight: "500",
    flexShrink: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginTop: 10,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  emptyAction: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: PILL_RADIUS,
    backgroundColor: GatiMitraMerchant.navy,
  },
  emptyActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
