import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRiderOrderHistory,
  type RiderOrderHistoryFilter,
} from "@/src/hooks/useOrders";
import { openOrderHistoryDetail } from "@/src/lib/order-history-nav";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { colors } from "@/src/theme";
import { formatDistanceKm } from "@/src/lib/incoming-order-display";
import {
  formatRideHistoryListDate,
  orderHistoryCategoryLabel,
  orderHistoryCategoryVisual,
  orderHistoryTitle,
  orderMatchesHistorySearch,
  rideHistoryDropLabel,
  rideHistoryEarningPlusLabel,
  rideHistoryOrderId,
  rideHistoryPickupLabel,
  rideHistoryStatusLabel,
} from "@/src/lib/rider-ride-history-display";
import {
  OrderHistoryDateRangeSheet,
  formatDateRangeChip,
  isOrderInDateRange,
} from "@/src/components/profile/OrderHistoryDateRangeSheet";

const GREEN = colors.success[600];
const FILTER_GREEN = "#16A34A";
const PAGE_BG = "#F1F5F9";
const CARD_BG = "#FFFFFF";
const HEADER_BG = "#FFFFFF";

type IonName = ComponentProps<typeof Ionicons>["name"];
type StatusFilter = "all" | "completed" | "cancelled";
type SortOrder = "latest" | "oldest";
type FilterChipId = RiderOrderHistoryFilter | "completed" | "cancelled";
type FilterChipDef = {
  id: FilterChipId;
  labelKey: string;
  fallback: string;
  icon: IonName;
  color: string;
  activeBg: string;
};

const CATEGORY_FILTERS: FilterChipDef[] = [
  { id: "all", labelKey: "profile.myOrders.filterAll", fallback: "All", icon: "grid", color: FILTER_GREEN, activeBg: FILTER_GREEN },
  { id: "food", labelKey: "profile.myRides.filterFood", fallback: "Food", icon: "restaurant", color: "#EA580C", activeBg: "#EA580C" },
  { id: "parcel", labelKey: "profile.myRides.filterParcel", fallback: "Parcel", icon: "cube", color: "#2563EB", activeBg: "#2563EB" },
  { id: "ride", labelKey: "profile.myRides.filterRide", fallback: "Ride", icon: "car", color: "#9333EA", activeBg: "#9333EA" },
];

const STATUS_FILTERS: FilterChipDef[] = [
  { id: "completed", labelKey: "profile.myRides.statusCompleted", fallback: "Completed", icon: "checkmark-circle", color: GREEN, activeBg: GREEN },
  { id: "cancelled", labelKey: "profile.myRides.statusCancelled", fallback: "Cancelled", icon: "close-circle", color: "#DC2626", activeBg: "#DC2626" },
];

function getCategoryAccent(chip: FilterChipDef): string {
  return chip.id === "all" ? FILTER_GREEN : chip.color;
}

function FilterCategoryTile({
  chip,
  selected,
  onPress,
}: {
  chip: FilterChipDef;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const accent = getCategoryAccent(chip);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.catTile,
        selected && [styles.catTileSelected, { borderColor: accent }],
        pressed && styles.catTilePressed,
      ]}
    >
      <View
        style={[
          styles.catIconBox,
          selected
            ? { backgroundColor: accent }
            : { backgroundColor: `${accent}18` },
        ]}
      >
        <Ionicons
          name={chip.icon}
          size={22}
          color={selected ? "#FFFFFF" : accent}
        />
      </View>
      <Text
        style={[
          styles.catTileLabel,
          selected ? { color: accent, fontWeight: "800" } : styles.catTileLabelIdle,
        ]}
        numberOfLines={1}
      >
        {t(chip.labelKey, chip.fallback)}
      </Text>
      {selected ? <View style={[styles.catTileDot, { backgroundColor: accent }]} /> : null}
    </Pressable>
  );
}

function FilterStatusChip({
  chip,
  selected,
  onPress,
}: {
  chip: FilterChipDef;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const isCompleted = chip.id === "completed";
  const accent = isCompleted ? FILTER_GREEN : "#DC2626";
  const idleBg = isCompleted ? "#ECFDF5" : "#FEF2F2";
  const idleBorder = isCompleted ? "#BBF7D0" : "#FECACA";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusChip,
        selected
          ? { backgroundColor: accent, borderColor: accent }
          : { backgroundColor: idleBg, borderColor: idleBorder },
        pressed && styles.statusChipPressed,
      ]}
    >
      <View
        style={[
          styles.statusIconWrap,
          selected
            ? { backgroundColor: "rgba(255,255,255,0.22)" }
            : { backgroundColor: isCompleted ? "#DCFCE7" : "#FEE2E2" },
        ]}
      >
        <Ionicons
          name={chip.icon}
          size={18}
          color={selected ? "#FFFFFF" : accent}
        />
      </View>
      <Text
        style={[
          styles.statusChipLabel,
          { color: selected ? "#FFFFFF" : accent },
        ]}
        numberOfLines={1}
      >
        {t(chip.labelKey, chip.fallback)}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
      ) : null}
    </Pressable>
  );
}

function OrderHistoryFilterBar({
  category,
  statusFilter,
  onCategoryFilter,
  onStatusFilter,
}: {
  category: RiderOrderHistoryFilter;
  statusFilter: StatusFilter;
  onCategoryFilter: (id: RiderOrderHistoryFilter) => void;
  onStatusFilter: (id: Exclude<StatusFilter, "all">) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.filterSection}>
      <View style={styles.filterSectionHead}>
        <View style={styles.filterHeadIcon}>
          <Ionicons name="layers-outline" size={16} color={FILTER_GREEN} />
        </View>
        <View style={styles.filterHeadText}>
          <Text style={styles.filterSectionTitle}>
            {t("profile.myOrders.filterBy", "Filter orders")}
          </Text>
          <Text style={styles.filterSectionSub}>
            {t("profile.myOrders.filterBySub", "Category & delivery status")}
          </Text>
        </View>
      </View>

      <View style={styles.categoryRow}>
        {CATEGORY_FILTERS.map((chip) => (
          <FilterCategoryTile
            key={chip.id}
            chip={chip}
            selected={statusFilter === "all" && category === chip.id}
            onPress={() => onCategoryFilter(chip.id)}
          />
        ))}
      </View>

      <View style={styles.filterDividerRow}>
        <View style={styles.filterDividerLine} />
        <Text style={styles.filterDividerLabel}>
          {t("profile.myOrders.statusLabel", "Status")}
        </Text>
        <View style={styles.filterDividerLine} />
      </View>

      <View style={styles.statusRow}>
        {STATUS_FILTERS.map((chip) => (
          <FilterStatusChip
            key={chip.id}
            chip={chip}
            selected={statusFilter === chip.id}
            onPress={() => onStatusFilter(chip.id as Exclude<StatusFilter, "all">)}
          />
        ))}
      </View>
    </View>
  );
}

function OrderHistoryCard({
  order,
  onPress,
}: {
  order: RiderOrderSummary;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const visual = orderHistoryCategoryVisual(order.category);
  const catLabel = orderHistoryCategoryLabel(order.category, t);
  const statusLabel = rideHistoryStatusLabel(order.status, t);
  const distance = formatDistanceKm(order.distanceKm ?? order.tripDistanceKm);
  const isCompleted = order.status === "delivered";
  const isCancelled = order.status === "cancelled";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.orderCard, pressed && styles.orderCardPressed]}
      accessibilityRole="button"
      accessibilityLabel={t("profile.myOrders.viewDetails", "View details")}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.categoryIconBox, { backgroundColor: visual.iconBg }]}>
          <Ionicons name={visual.icon} size={24} color={visual.iconColor} />
        </View>

        <View style={styles.cardMainCol}>
          <View style={styles.badgeRow}>
            <View style={[styles.catTag, { backgroundColor: `${visual.accent}14` }]}>
              <Text style={[styles.catTagText, { color: visual.accent }]}>{catLabel}</Text>
            </View>
            {isCompleted ? (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={13} color={GREEN} />
                <Text style={styles.completedBadgeText}>{statusLabel}</Text>
              </View>
            ) : isCancelled ? (
              <View style={styles.cancelledBadge}>
                <Ionicons name="close-circle" size={13} color="#DC2626" />
                <Text style={styles.cancelledBadgeText}>{statusLabel}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {orderHistoryTitle(order)}
          </Text>
          <Text style={styles.cardMeta}>{rideHistoryOrderId(order)}</Text>
          <Text style={styles.cardMeta}>{formatRideHistoryListDate(order.createdAt)}</Text>
        </View>

        <View style={styles.earnCol}>
          <Text style={styles.earnPlus}>{rideHistoryEarningPlusLabel(order)}</Text>
          <Text style={styles.earnCaption}>{t("profile.myOrders.earned", "Earned")}</Text>
          {distance !== "—" ? (
            <View style={styles.distBadge}>
              <Ionicons name="location-outline" size={11} color="#64748B" />
              <Text style={styles.distText}>{distance}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.routeBox}>
        <View style={styles.routeTimeline}>
          <View style={styles.routeTimelineTrack}>
            <View style={[styles.routeTimelineDot, { backgroundColor: "#EA580C" }]} />
            <View style={styles.routeTimelineLine} />
            <View style={[styles.routeTimelineDot, { backgroundColor: GREEN }]} />
          </View>
          <View style={styles.routeStops}>
            <View style={styles.routeStop}>
              <Text style={styles.routeLabelPickup}>PICKUP</Text>
              <Text style={styles.routeAddr} numberOfLines={3}>
                {rideHistoryPickupLabel(order)}
              </Text>
            </View>
            <View style={styles.routeStopSpacer} />
            <View style={styles.routeStop}>
              <Text style={styles.routeLabelDrop}>DROP</Text>
              <Text style={styles.routeAddr} numberOfLines={3}>
                {rideHistoryDropLabel(order)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.viewDetails}>{t("profile.myOrders.viewDetails", "View details")}</Text>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

export function MyRidesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const searchRef = useRef<TextInput>(null);
  const [category, setCategory] = useState<RiderOrderHistoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [searchFocused, setSearchFocused] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showDateSheet, setShowDateSheet] = useState(false);

  const hasDateFilter = dateFrom != null || dateTo != null;

  const { data, isLoading, isFetching, error, refetch } = useRiderOrderHistory(category);

  const onCategoryFilter = useCallback((id: RiderOrderHistoryFilter) => {
    setCategory(id);
    setStatusFilter("all");
  }, []);

  const onStatusFilter = useCallback((id: StatusFilter) => {
    setStatusFilter((prev) => (prev === id ? "all" : id));
  }, []);

  const orders = useMemo(() => {
    let list = data?.orders ?? [];
    if (statusFilter === "completed") {
      list = list.filter((o) => o.status === "delivered");
    } else if (statusFilter === "cancelled") {
      list = list.filter((o) => o.status === "cancelled");
    }
    if (searchQuery.trim()) {
      list = list.filter((o) => orderMatchesHistorySearch(o, searchQuery));
    }
    if (hasDateFilter) {
      list = list.filter((o) => isOrderInDateRange(o.createdAt, dateFrom, dateTo));
    }
    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === "latest" ? tb - ta : ta - tb;
    });
  }, [data?.orders, statusFilter, searchQuery, sortOrder, dateFrom, dateTo, hasDateFilter]);

  const onCalendarPress = useCallback(() => {
    setShowDateSheet(true);
  }, []);

  const clearDateFilter = useCallback(() => {
    setDateFrom(null);
    setDateTo(null);
  }, []);

  const onDateRangeApply = useCallback((from: Date | null, to: Date | null) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const openDetail = useCallback(
    (order: RiderOrderSummary) => {
      openOrderHistoryDetail(order, queryClient);
    },
    [queryClient]
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.toolbarCard}>
          <View
            style={[
              styles.searchBox,
              styles.searchSortHalf,
              searchFocused && styles.searchBoxFocused,
            ]}
          >
            <View style={styles.searchIconWrap}>
              <Ionicons name="search" size={17} color="#64748B" />
            </View>
            <TextInput
              ref={searchRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("profile.myOrders.searchShort", "Search ID...")}
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setSortOrder((s) => (s === "latest" ? "oldest" : "latest"))}
            style={[styles.sortRowBtn, styles.searchSortHalf]}
          >
            <View style={styles.sortIconWrap}>
              <Ionicons name="swap-vertical" size={16} color="#475569" />
            </View>
            <Text style={styles.sortRowBtnText} numberOfLines={1}>
              {sortOrder === "latest"
                ? t("profile.myOrders.sortLatest", "Latest First")
                : t("profile.myOrders.sortOldest", "Oldest First")}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#64748B" />
          </Pressable>
        </View>

        {hasDateFilter ? (
          <Pressable onPress={clearDateFilter} style={styles.dateFilterChip}>
            <Ionicons name="calendar" size={14} color={FILTER_GREEN} />
            <Text style={styles.dateFilterChipText}>
              {formatDateRangeChip(dateFrom, dateTo)}
            </Text>
            <Ionicons name="close-circle" size={16} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>
    ),
    [
      clearDateFilter,
      dateFrom,
      dateTo,
      hasDateFilter,
      searchFocused,
      searchQuery,
      sortOrder,
      t,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: RiderOrderSummary }) => (
      <OrderHistoryCard order={item} onPress={() => openDetail(item)} />
    ),
    [openDetail]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.pageHeader}>
        <View style={styles.headerAccent} />
        <View style={styles.pageHeaderTopRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle} numberOfLines={1}>
              {t("profile.myOrders.title", "My Orders")}
            </Text>
            <Text style={styles.pageSubtitle} numberOfLines={2}>
              {t("profile.myOrders.subtitle", "View and manage all your completed orders")}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerIconBtn}
              hitSlop={8}
              onPress={() => searchRef.current?.focus()}
            >
              <Ionicons name="search-outline" size={19} color="#374151" />
            </Pressable>
            <Pressable
              style={[
                styles.headerIconBtn,
                hasDateFilter ? styles.headerIconBtnActive : null,
              ]}
              hitSlop={8}
              onPress={onCalendarPress}
            >
              <Ionicons
                name={hasDateFilter ? "calendar" : "calendar-outline"}
                size={19}
                color={hasDateFilter ? FILTER_GREEN : "#374151"}
              />
            </Pressable>
          </View>
        </View>

        <OrderHistoryFilterBar
          category={category}
          statusFilter={statusFilter}
          onCategoryFilter={onCategoryFilter}
          onStatusFilter={onStatusFilter}
        />
      </View>

      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => `${item.category}-${item.id}`}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.listContent, orders.length === 0 && styles.listEmpty]}
          style={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => refetch()}
              tintColor={GREEN}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.cardSpacer} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>
                {t("profile.myOrders.emptyTitle", "No orders found")}
              </Text>
              <Text style={styles.emptySub}>
                {error
                  ? t("profile.myRides.error", "Could not load orders. Pull to refresh.")
                  : t("profile.myOrders.emptySub", "Try another filter or search term.")}
              </Text>
            </View>
          }
        />
      )}

      <OrderHistoryDateRangeSheet
        visible={showDateSheet}
        onClose={() => setShowDateSheet(false)}
        initialFrom={dateFrom}
        initialTo={dateTo}
        onApply={onDateRangeApply}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pageHeader: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  headerAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: FILTER_GREEN,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pageHeaderTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
    marginTop: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    marginTop: 2,
  },
  backBtnPressed: { opacity: 0.75 },
  titleBlock: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", gap: 8, flexShrink: 0, marginTop: 2 },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 18,
  },
  filterSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8EDF3",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.07,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  filterSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  filterHeadIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  filterHeadText: { flex: 1 },
  filterSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  filterSectionSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  catTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#EEF2F6",
    backgroundColor: "#FAFBFC",
    minWidth: 0,
  },
  catTileSelected: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  catTilePressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  catIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  catTileLabel: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  catTileLabelIdle: {
    color: "#475569",
  },
  catTileDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
  },
  filterDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 14,
  },
  filterDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E8EDF3",
  },
  filterDividerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: "row",
    gap: 10,
  },
  statusChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    minWidth: 0,
  },
  statusChipPressed: { opacity: 0.92 },
  statusIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statusChipLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  list: { flex: 1 },
  listHeader: {
    paddingTop: 14,
    paddingBottom: 6,
  },
  toolbarCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  searchSortHalf: {
    flex: 1,
    minWidth: 0,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 8,
    minHeight: 46,
  },
  searchIconWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBoxFocused: {
    borderColor: FILTER_GREEN,
    backgroundColor: "#FFFFFF",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    paddingVertical: 8,
  },
  sortRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 6,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sortIconWrap: {
    width: 24,
    alignItems: "center",
  },
  sortRowBtnText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
  headerIconBtnActive: {
    borderColor: "#86EFAC",
    backgroundColor: "#ECFDF5",
  },
  dateFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  dateFilterChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listEmpty: { flexGrow: 1 },
  cardSpacer: { height: 12 },
  orderCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  orderCardPressed: { opacity: 0.96 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    paddingBottom: 10,
    gap: 12,
  },
  categoryIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardMainCol: {
    flex: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  catTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  catTagText: { fontSize: 11, fontWeight: "800" },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  completedBadgeText: { fontSize: 11, fontWeight: "700", color: GREEN },
  cancelledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
  },
  cancelledBadgeText: { fontSize: 11, fontWeight: "700", color: "#DC2626" },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 22,
    marginBottom: 3,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94A3B8",
    marginBottom: 2,
  },
  earnCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: 88,
    paddingTop: 2,
  },
  earnPlus: { fontSize: 16, fontWeight: "800", color: GREEN, textAlign: "right" },
  earnCaption: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginTop: 2,
    marginBottom: 6,
    textAlign: "right",
  },
  distBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  distText: { fontSize: 11, fontWeight: "600", color: "#64748B" },
  routeBox: {
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  routeTimeline: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  routeTimelineTrack: {
    width: 16,
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 4,
  },
  routeTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeTimelineLine: {
    flex: 1,
    width: 2,
    minHeight: 24,
    backgroundColor: "#CBD5E1",
    marginVertical: 4,
  },
  routeStops: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
  },
  routeStop: { flexShrink: 0 },
  routeStopSpacer: { height: 8 },
  routeLabelPickup: {
    fontSize: 10,
    fontWeight: "800",
    color: "#EA580C",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  routeLabelDrop: {
    fontSize: 10,
    fontWeight: "800",
    color: GREEN,
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  routeAddr: {
    fontSize: 13,
    fontWeight: "500",
    color: "#334155",
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF2F6",
    backgroundColor: "#FAFBFC",
  },
  viewDetails: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
  empty: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 8,
  },
  emptySub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
});
