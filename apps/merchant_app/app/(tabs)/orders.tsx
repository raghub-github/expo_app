/**
 * Orders Management — real-time operational board for GatiMitra Partner.
 * - Horizontal status nav: All | Created | Preparing | Ready | Picked Up | Delivered | Rejected | RTO
 * - Smart order cards with delivery type, OTP, timers, and slider-confirm actions.
 * - Supports multi-category stores and multiple delivery types while staying fast and clear.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Animated,
  LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING,
  CARD_RADIUS,
} from "@/constants/theme";
import {
  useOrders,
  type OrderRecord,
  type OrderStage,
  type OrderCounts,
} from "@/hooks/useOrders";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { TerminalOrderCard } from "@/components/order/TerminalOrderCard";
import { LiveOrderCard } from "@/components/order/LiveOrderCard";
import { OrdersFilterSheet } from "@/components/order/OrdersFilterSheet";
import {
  EMPTY_ORDERS_FILTERS,
  countActiveFilters,
  orderMatchesSheetFilters,
  type OrdersFilters,
} from "@/components/order/ordersFilterTypes";
import { RejectOrderSheet } from "@/components/order/RejectOrderSheet";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import { PastOrdersBanner } from "@/components/order/PastOrdersBanner";
import {
  OrderDateRangeBar,
  OrderDateRangeSheet,
} from "@/components/order/OrderDateRangeSheet";
import {
  DEFAULT_HISTORY_DATE_RANGE,
  isWithinLast24Hours,
  orderInDateRange,
  type OrderDateRange,
} from "@/lib/orderDateRange";

export type OrdersListMode = "live" | "history";

const SEARCH_BG = "#F1F5F9";
const TAB_TEXT_COLOR = GatiMitraMerchant.textSecondary;
const TAB_ACTIVE_COLOR = GatiMitraMerchant.primary;
const STATUS_GREEN = "#22C55E";
const STATUS_RED = "#EF4444";
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_LABEL_TEXT = "#FFFFFF";
type FilterKey = "all" | OrderStage;

const STATUS_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "created", label: "Created" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Picked Up" },
  { key: "delivered", label: "Delivered" },
  { key: "rejected", label: "Rejected" },
  { key: "rto", label: "RTO" },
];

function SearchBar({
  value,
  onChangeText,
  filterCount,
  onFilterPress,
  showFilter,
}: {
  value: string;
  onChangeText: (value: string) => void;
  filterCount: number;
  onFilterPress: () => void;
  showFilter?: boolean;
}) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={GatiMitraMerchant.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order id"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={value}
          onChangeText={onChangeText}
          returnKeyType="search"
        />
      </View>
      {showFilter ? (
        <Pressable
          onPress={onFilterPress}
          style={({ pressed }) => [
            styles.filterBtn,
            pressed && styles.pressed,
            filterCount > 0 && styles.filterBtnActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Filters"
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={filterCount > 0 ? GatiMitraMerchant.primary : GatiMitraMerchant.textPrimary}
          />
          {filterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount > 9 ? "9+" : filterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

type TabLayout = { x: number; width: number };

function StatusTabs({
  activeKey,
  counts,
  onChange,
}: {
  activeKey: FilterKey;
  counts: { [K in FilterKey]?: number };
  onChange: (key: FilterKey) => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const layouts = useRef<Record<FilterKey, TabLayout>>({} as any);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;

  const animateToKey = useCallback(
    (key: FilterKey) => {
      const layout = layouts.current[key];
      if (!layout) return;
      Animated.spring(indicatorX, {
        toValue: layout.x,
        useNativeDriver: false,
        bounciness: 8,
      }).start();
      Animated.spring(indicatorW, {
        toValue: layout.width,
        useNativeDriver: false,
        bounciness: 8,
      }).start();
      scrollRef.current?.scrollTo({
        x: Math.max(0, layout.x - 40),
        animated: true,
      });
    },
    [indicatorX, indicatorW]
  );

  useEffect(() => {
    animateToKey(activeKey);
  }, [activeKey, animateToKey]);

  const handleLayout =
    (key: FilterKey) =>
    (e: LayoutChangeEvent): void => {
      const { x, width } = e.nativeEvent.layout;
      layouts.current[key] = { x, width };
      if (key === activeKey) {
        indicatorX.setValue(x);
        indicatorW.setValue(width);
      }
    };

  return (
    <View style={styles.tabsOuter}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {STATUS_TABS.map((tab) => {
          const isActive = tab.key === activeKey;
          const count = counts[tab.key] ?? 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              onLayout={handleLayout(tab.key)}
              style={({ pressed }) => [
                styles.tabItem,
                pressed && styles.tabItemPressed,
                GatiMitraMerchant.cursorPointer,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                ]}
                numberOfLines={1}
              >
                {tab.label} ({count})
              </Text>
            </Pressable>
          );
        })}
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              transform: [{ translateX: indicatorX }],
              width: indicatorW,
            },
          ]}
        />
      </ScrollView>
    </View>
  );
}

function isTerminalStatus(status: OrderStage): boolean {
  return status === "rejected" || status === "rto" || status === "delivered";
}

/** Past orders shown on history page only. */
function isHistoryTerminalOrder(order: OrderRecord): boolean {
  return isTerminalStatus(order.status);
}

function historyOrderTimeIso(order: OrderRecord): string {
  if (
    (order.status === "rejected" || order.status === "rto") &&
    order.cancelledAt
  ) {
    return order.cancelledAt;
  }
  return order.createdAt;
}

export function OrdersListScreen({ mode }: { mode: OrdersListMode }) {
  const isHistory = mode === "history";
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const scrollBottomPadding = isHistory ? 24 : TAB_BAR_SCROLL_CONTENT_PADDING;
  const { selectedStore } = useSelectedStore();

  const { orders, loading, error, refetch, transitionOrder } = useOrders();

  const [search, setSearch] = useState("");
  const [sheetFilters, setSheetFilters] = useState<OrdersFilters>(EMPTY_ORDERS_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateRange, setDateRange] = useState<OrderDateRange>(DEFAULT_HISTORY_DATE_RANGE);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const initialTabParam = typeof params.tab === "string" ? params.tab.toLowerCase() : "";
  const [filterKey, setFilterKey] = useState<FilterKey>(
    isHistory ? "all" : initialTabParam === "active" ? "preparing" : "created"
  );
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [rejectTarget, setRejectTarget] = useState<OrderRecord | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const filteredOrders = useMemo(() => {
    const list = orders.filter((o) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        (o.formattedOrderId ?? "").toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q);

      if (isHistory) {
        if (!isHistoryTerminalOrder(o)) return false;
        if (!orderInDateRange(historyOrderTimeIso(o), dateRange)) return false;
        if (!orderMatchesSheetFilters(o, sheetFilters)) return false;
        return matchesSearch;
      }

      const matchesStatus = filterKey === "all" ? true : o.status === filterKey;
      const matchesSheet = orderMatchesSheetFilters(o, sheetFilters);
      const matchesTime = isWithinLast24Hours(o.createdAt, nowMs);
      return matchesSearch && matchesStatus && matchesSheet && matchesTime;
    });

    if (isHistory) {
      return [...list].sort(
        (a, b) =>
          new Date(historyOrderTimeIso(b)).getTime() -
          new Date(historyOrderTimeIso(a)).getTime()
      );
    }
    return list;
  }, [orders, search, filterKey, sheetFilters, isHistory, dateRange, nowMs]);

  const liveCounts = useMemo(() => {
    const live = orders.filter((o) => isWithinLast24Hours(o.createdAt, nowMs));
    const base = {
      all: live.length,
      created: 0,
      preparing: 0,
      ready: 0,
      picked_up: 0,
      delivered: 0,
      rejected: 0,
      rto: 0,
    } as OrderCounts;
    for (const o of live) base[o.status] += 1;
    return base;
  }, [orders, nowMs]);

  const handleAccept = useCallback(
    (order: OrderRecord) => {
      if (order.status === "created") {
        transitionOrder(order.id, "preparing");
      }
    },
    [transitionOrder]
  );

  const handleReject = useCallback((order: OrderRecord) => {
    if (order.status === "created") {
      setRejectTarget(order);
    }
  }, []);

  const confirmReject = useCallback(
    async (reason: MerchantCancellationReason) => {
      if (!rejectTarget) return;
      setRejectLoading(true);
      try {
        await transitionOrder(rejectTarget.id, "rejected", { rejectedReason: reason });
        setRejectTarget(null);
      } catch {
        /* error surfaced via useOrders */
      } finally {
        setRejectLoading(false);
      }
    },
    [rejectTarget, transitionOrder]
  );

  const handleAdvance = useCallback(
    (order: OrderRecord) => {
      switch (order.status) {
        case "preparing":
          transitionOrder(order.id, "ready");
          break;
        case "ready":
          transitionOrder(order.id, "picked_up");
          break;
        case "picked_up":
          if (canMerchantMarkDelivered(order)) {
            transitionOrder(order.id, "delivered");
          }
          break;
        default:
          break;
      }
    },
    [transitionOrder]
  );

  const handleViewDetail = useCallback(
    (order: OrderRecord) => {
      router.push(`/order/${order.id}` as any);
    },
    [router]
  );

  const renderOrder = ({ item }: { item: OrderRecord }) => {
    if (isHistory) {
      return (
        <TerminalOrderCard
          order={item}
          formattedOrderId={item.formattedOrderId}
          rejectedReason={item.rejectedReason}
          onPress={() => handleViewDetail(item)}
        />
      );
    }
    return (
      <LiveOrderCard
        order={item}
        nowMs={nowMs}
        onAccept={() => handleAccept(item)}
        onReject={() => handleReject(item)}
        onAdvance={() => handleAdvance(item)}
        onViewDetail={() => handleViewDetail(item)}
      />
    );
  };

  const activeFilterCount = countActiveFilters(sheetFilters);

  const listHeader = isHistory ? (
    <>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        filterCount={activeFilterCount}
        onFilterPress={() => setFilterSheetOpen(true)}
        showFilter
      />
      <OrderDateRangeBar range={dateRange} onPress={() => setDateSheetOpen(true)} />
    </>
  ) : (
    <>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        filterCount={activeFilterCount}
        onFilterPress={() => setFilterSheetOpen(true)}
        showFilter
      />
      <PastOrdersBanner onPress={() => router.push("/order-history" as any)} />
      <StatusTabs activeKey={filterKey} counts={liveCounts} onChange={setFilterKey} />
    </>
  );

  if (error && !loading && orders.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons
          name="cloud-offline-outline"
          size={48}
          color={GatiMitraMerchant.textTertiary}
        />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          onPress={refetch}
          style={({ pressed }) => [
            styles.retryBtn,
            pressed && styles.pressed,
            GatiMitraMerchant.cursorPointer,
          ]}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OrdersFilterSheet
        visible={filterSheetOpen}
        value={sheetFilters}
        onClose={() => setFilterSheetOpen(false)}
        onApply={setSheetFilters}
      />
      {isHistory ? (
        <OrderDateRangeSheet
          visible={dateSheetOpen}
          value={dateRange}
          onClose={() => setDateSheetOpen(false)}
          onApply={setDateRange}
        />
      ) : null}
      <RejectOrderSheet
        visible={rejectTarget != null}
        formattedOrderId={rejectTarget?.formattedOrderId}
        fallbackOrderId={
          rejectTarget
            ? Number(rejectTarget.id) || rejectTarget.ordersCoreId
            : 0
        }
        loading={rejectLoading}
        onClose={() => !rejectLoading && setRejectTarget(null)}
        onConfirm={confirmReject}
      />
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: scrollBottomPadding },
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[GatiMitraMerchant.primary]}
            tintColor={GatiMitraMerchant.primary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator
                size="large"
                color={GatiMitraMerchant.primary}
              />
              <Text style={styles.loadingText}>Loading orders…</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="receipt-outline"
                size={40}
                color={GatiMitraMerchant.textTertiary}
              />
              <Text style={styles.emptyText}>
                {search.trim()
                  ? "No orders match your search"
                  : isHistory
                    ? activeFilterCount > 0
                      ? "No orders match your filters in this date range"
                      : "No completed, rejected, or RTO orders in this date range"
                    : filterKey === "all"
                      ? "No orders in the last 24 hours"
                      : `No orders in ${filterKey.replace("_", " ")} (last 24h)`}
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

export default function OrdersTabScreen() {
  return <OrdersListScreen mode="live" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
  },
  separator: {
    height: 14,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.primary,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.8,
  },
  historySearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SEARCH_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    gap: 10,
    marginBottom: 10,
  },
  historySearchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SEARCH_BG,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    gap: 10,
    minWidth: 0,
  },
  filterBtn: {
    width: 40,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  filterBtnActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF5",
  },
  filterBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  tabsOuter: {
    marginBottom: 10,
  },
  tabsRow: {
    paddingHorizontal: 0,
    paddingBottom: 2,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: TAB_TEXT_COLOR,
  },
  tabLabelActive: {
    color: TAB_ACTIVE_COLOR,
  },
  tabIndicator: {
    position: "absolute",
    height: 2,
    backgroundColor: TAB_ACTIVE_COLOR,
    bottom: 0,
    borderRadius: 1,
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
  },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexShrink: 1,
    paddingRight: 8,
  },
  cardHeaderRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  orderIdText: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  dotSeparator: {
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "400",
  },
  customerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
  },
  customerName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: STATUS_GREEN,
    minWidth: 0,
  },
  timeSince: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
  deliveryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  deliveryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  moreBtn: {
    marginTop: 4,
  },
  itemsSection: {
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "500",
  },
  moreItemsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  moreItemsText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  moreItemsTotal: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  totalChevron: {
    marginLeft: 4,
  },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginRight: 8,
  },
  otpBoxes: {
    flexDirection: "row",
    gap: 4,
  },
  otpBox: {
    width: 24,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  otpDigit: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  createdActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
  },
  createdAcceptWrap: {
    flex: 0.7,
  },
  rejectBtn: {
    flex: 0.3,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STATUS_RED,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: STATUS_RED,
  },
  sliderOnlyRow: {
    marginTop: 10,
  },
  sliderTrack: {
    height: 44,
    borderRadius: 999,
    justifyContent: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  sliderTrackDisabled: {
    backgroundColor: SLIDER_DISABLED_BG,
  },
  sliderLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: SLIDER_LABEL_TEXT,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  sliderLabelDisabled: {
    opacity: 0.8,
  },
  sliderKnob: {
    width: 40,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});

