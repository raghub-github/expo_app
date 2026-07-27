import { useEffect, useState, useCallback } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, FlatList, ScrollView, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
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

const SECTION_FILTERS = ["all", "bank_account", "offer", "menu_item", "combo", "addon", "variant", "customization", "category", "combo_component"] as const;
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

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function ActivityCard({ item }: { item: ActivityFeedItem }) {
  const icon = SECTION_ICONS[item.section] ?? "ellipse-outline";
  const color = SECTION_COLORS[item.section] ?? "#64748b";

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.iconCircle, { backgroundColor: color + "18" }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.sourceBadge, { backgroundColor: item.actor_type === "agent" ? "#fef3c7" : "#e0f2fe" }]}>
              <Text style={[styles.sourceBadgeText, { color: item.actor_type === "agent" ? "#92400e" : "#0369a1" }]}>
                {ACTOR_LABELS[item.actor_type] ?? item.actor_type}
              </Text>
            </View>
            <View style={styles.sourceDot} />
            <Text style={styles.sourceText}>{SOURCE_LABELS[item.source] ?? item.source}</Text>
            {item.actor_name && (
              <>
                <View style={styles.sourceDot} />
                <Text style={styles.actorText} numberOfLines={1}>{item.actor_name}</Text>
              </>
            )}
          </View>
        </View>
        <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
      </View>
    </View>
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

  const load = useCallback(async (isRefresh = false) => {
    if (!storeId || !token) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const list = await fetchActivityFeed(storeId, token, {
        limit: 100,
        section: sectionFilter !== "all" ? sectionFilter : undefined,
        source: sourceFilter !== "all" ? sourceFilter : undefined,
        actor_type: actorFilter !== "all" ? actorFilter : undefined,
      });
      setActivities(list);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, token, sectionFilter, sourceFilter, actorFilter]);

  useEffect(() => { load(); }, [load]);

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
      <View style={styles.header}>
        <Text style={styles.title}>Recent Activity</Text>
        <Text style={styles.subtitle}>Track all changes across app, partner site, and dashboard.</Text>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Section</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {SECTION_FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setSectionFilter(f)} style={[styles.filterChip, sectionFilter === f && styles.filterChipActive]}>
              <Text style={[styles.filterText, sectionFilter === f && styles.filterTextActive]}>{SECTION_LABELS[f] ?? f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Source</Text>
        <View style={styles.filterRow}>
          {SOURCE_FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setSourceFilter(f)} style={[styles.filterChip, sourceFilter === f && styles.filterChipActive]}>
              <Text style={[styles.filterText, sourceFilter === f && styles.filterTextActive]}>{SOURCE_FILTER_LABELS[f] ?? f}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Done by</Text>
        <View style={styles.filterRow}>
          {ACTOR_FILTERS.map((f) => (
            <Pressable key={f} onPress={() => setActorFilter(f)} style={[styles.filterChip, actorFilter === f && styles.filterChipActive]}>
              <Text style={[styles.filterText, actorFilter === f && styles.filterTextActive]}>{ACTOR_FILTER_LABELS[f] ?? f}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading && activities.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="time-outline" size={40} color={GatiMitraMerchant.textTertiary} />
          <Text style={styles.emptyText}>No activity yet.</Text>
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ActivityCard item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GatiMitraMerchant.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  header: { paddingHorizontal: H_PADDING, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  subtitle: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  filterSection: { paddingHorizontal: H_PADDING, paddingBottom: 6 },
  filterLabel: { fontSize: 10, fontWeight: "700", color: GatiMitraMerchant.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  filterScroll: { flexGrow: 0 },
  filterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  filterChipActive: { backgroundColor: GatiMitraMerchant.primary, borderColor: GatiMitraMerchant.primary },
  filterText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  filterTextActive: { color: "#fff" },
  list: { paddingHorizontal: H_PADDING, paddingBottom: 30 },
  card: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 12, borderWidth: 1, borderColor: GatiMitraMerchant.border, marginBottom: 8, ...GatiMitraMerchant.shadowSm },
  cardRow: { flexDirection: "row", gap: 10 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardContent: { flex: 1, gap: 4 },
  cardSummary: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary, lineHeight: 18 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  sourceBadgeText: { fontSize: 10, fontWeight: "700" },
  sourceDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#d1d5db" },
  sourceText: { fontSize: 10, color: GatiMitraMerchant.textTertiary, fontWeight: "600" },
  actorText: { fontSize: 10, color: GatiMitraMerchant.textSecondary, fontWeight: "500", maxWidth: 120 },
  timeText: { fontSize: 10, color: GatiMitraMerchant.textTertiary, fontWeight: "600" },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textTertiary, textAlign: "center", marginTop: 10 },
});
