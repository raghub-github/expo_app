/**
 * Orders Management — real-time operational board for GatiMitra Partner.
 * - Horizontal status nav: Preparing | Ready | Picked Up | Completed | Scheduled
 * - Swipe left/right on the list to switch tabs.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  type TextStyle,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  LayoutChangeEvent,
  FlatList,
  PanResponder,
  Alert,
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
import { RecentCompletedOrderCard } from "@/components/order/RecentCompletedOrderCard";
import { LiveOrderCard, canMerchantMarkDelivered } from "@/components/order/LiveOrderCard";
import { isOrderWithinLast24Hours } from "@/lib/orderRecency";
import { OrdersFilterSheet } from "@/components/order/OrdersFilterSheet";
import {
  EMPTY_ORDERS_FILTERS,
  countActiveFilters,
  orderMatchesSheetFilters,
  type OrdersFilters,
} from "@/components/order/ordersFilterTypes";
import { RejectOrderSheet } from "@/components/order/RejectOrderSheet";
import { MerchantPrepDelaySheet } from "@/components/order/MerchantPrepDelaySheet";
import { RejectFollowUpHost, useRejectFollowUp } from "@/components/order/RejectFollowUpHost";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import { rejectReasonNeedsFollowUp } from "@/lib/merchantCancellationReasons";
import { PastOrdersBanner } from "@/components/order/PastOrdersBanner";
import { StoreClosedActiveOrdersNotice } from "@/components/order/StoreClosedActiveOrdersNotice";
import {
  OrderDateRangeBar,
  OrderDateRangeSheet,
} from "@/components/order/OrderDateRangeSheet";
import {
  DEFAULT_HISTORY_DATE_RANGE,
  isVisibleOnLiveOrdersBoard,
  orderInDateRange,
  type OrderDateRange,
} from "@/lib/orderDateRange";
import { isActiveMerchantOrderStage } from "@/lib/merchantActiveOrders";
import { useStoreStatus } from "@/context/StoreStatusContext";

export type OrdersListMode = "live" | "history";

const SEARCH_BG = "#F1F5F9";
const TAB_TEXT_COLOR = GatiMitraMerchant.textSecondary;
const STATUS_GREEN = "#22C55E";
const STATUS_RED = "#EF4444";
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_LABEL_TEXT = "#FFFFFF";
type LiveFilterKey = "preparing" | "ready" | "picked_up" | "completed" | "scheduled";
type FilterKey = LiveFilterKey | "all";

const STATUS_TABS: { key: LiveFilterKey; label: string }[] = [
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Picked Up" },
  { key: "completed", label: "Completed" },
];

const SCHEDULED_TAB: { key: LiveFilterKey; label: string } = { key: "scheduled", label: "Scheduled" };

const DEFAULT_LIVE_TAB: LiveFilterKey = "preparing";

/** Tab order used for swipe navigation (left = previous, right = next). */
const SWIPE_TAB_ORDER: LiveFilterKey[] = [
  ...STATUS_TABS.map((t) => t.key),
  SCHEDULED_TAB.key,
];

const SWIPE_THRESHOLD = 48;

function tabPillActiveStyle(isActive: boolean) {
  return isActive ? styles.tabPillActive : null;
}

function isTerminalCompletedStatus(status: OrderStage): boolean {
  return status === "delivered" || status === "rejected" || status === "rto";
}

function isScheduledOrder(order: OrderRecord): boolean {
  return Boolean(order.isScheduledOrder);
}

function isOpenScheduledOrder(order: OrderRecord): boolean {
  return isScheduledOrder(order) && !isTerminalCompletedStatus(order.status);
}

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
  activeKey: LiveFilterKey;
  counts: Partial<Record<LiveFilterKey, number>>;
  onChange: (key: LiveFilterKey) => void;
}) {
  const scrollRef = useRef<ScrollView | null>(null);
  const layouts = useRef<Partial<Record<LiveFilterKey, TabLayout>>>({});

  const scrollToKey = useCallback((key: LiveFilterKey) => {
    const layout = layouts.current[key];
    if (!layout) return;
    scrollRef.current?.scrollTo({
      x: Math.max(0, layout.x - 40),
      animated: true,
    });
  }, []);

  useEffect(() => {
    scrollToKey(activeKey);
  }, [activeKey, scrollToKey]);

  const handleLayout =
    (key: LiveFilterKey) =>
    (e: LayoutChangeEvent): void => {
      const { x, width } = e.nativeEvent.layout;
      layouts.current[key] = { x, width };
    };

  const scheduledCount = counts.scheduled ?? 0;
  const scheduledActive = activeKey === SCHEDULED_TAB.key;

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
                styles.tabPill,
                tabPillActiveStyle(isActive),
                pressed && styles.tabItemPressed,
                GatiMitraMerchant.cursorPointer,
              ]}
            >
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActivePill]}
                numberOfLines={1}
              >
                {tab.label} ({count})
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => onChange(SCHEDULED_TAB.key)}
          onLayout={handleLayout(SCHEDULED_TAB.key)}
          style={({ pressed }) => [
            styles.tabPill,
            styles.tabPillScheduled,
            tabPillActiveStyle(scheduledActive),
            pressed && styles.tabItemPressed,
            GatiMitraMerchant.cursorPointer,
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={14}
            color={scheduledActive ? "#FFFFFF" : GatiMitraMerchant.textSecondary}
          />
          <Text
            style={[styles.tabLabel, scheduledActive && styles.tabLabelActivePill]}
            numberOfLines={1}
          >
            {SCHEDULED_TAB.label} ({scheduledCount})
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function resolveInitialFilterKey(tabParam: string, orders: OrderRecord[]): LiveFilterKey {
  if (tabParam === "active" || tabParam === "new" || tabParam === "created" || tabParam === "all") {
    return DEFAULT_LIVE_TAB;
  }
  if (tabParam === "delivered" || tabParam === "rejected" || tabParam === "rto") return "completed";
  if (SWIPE_TAB_ORDER.includes(tabParam as LiveFilterKey)) {
    return tabParam as LiveFilterKey;
  }
  for (const key of SWIPE_TAB_ORDER) {
    if (key === "scheduled") {
      if (orders.some((o) => isOpenScheduledOrder(o))) return key;
      continue;
    }
    if (key === "completed") {
      if (orders.some((o) => isTerminalCompletedStatus(o.status) && !isOpenScheduledOrder(o))) {
        return key;
      }
      continue;
    }
    if (orders.some((o) => o.status === key && !isOpenScheduledOrder(o))) return key;
  }
  return DEFAULT_LIVE_TAB;
}

function isTerminalStatus(status: OrderStage): boolean {
  return isTerminalCompletedStatus(status);
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
  const { isOnline } = useStoreStatus();

  const { orders, loading, error, refetch, transitionOrder, extendPrepDelay, acceptanceWindowMinutes } = useOrders();

  const [search, setSearch] = useState("");
  const [sheetFilters, setSheetFilters] = useState<OrdersFilters>(EMPTY_ORDERS_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateRange, setDateRange] = useState<OrderDateRange>(DEFAULT_HISTORY_DATE_RANGE);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const initialTabParam = typeof params.tab === "string" ? params.tab.toLowerCase() : "";
  const [filterKey, setFilterKey] = useState<FilterKey>(
    isHistory ? "all" : resolveInitialFilterKey(initialTabParam, [])
  );
  const userSelectedTabRef = useRef(false);
  const lastAppliedRouteTabRef = useRef("");
  const filterKeyBootstrapped = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [rejectTarget, setRejectTarget] = useState<OrderRecord | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [prepDelayOrder, setPrepDelayOrder] = useState<OrderRecord | null>(null);
  const [prepDelayLoading, setPrepDelayLoading] = useState(false);
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isHistory || loading) return;

    if (initialTabParam) {
      if (lastAppliedRouteTabRef.current !== initialTabParam) {
        lastAppliedRouteTabRef.current = initialTabParam;
        userSelectedTabRef.current = false;
        setFilterKey(resolveInitialFilterKey(initialTabParam, orders));
      }
      return;
    }

    lastAppliedRouteTabRef.current = "";
    if (userSelectedTabRef.current || filterKeyBootstrapped.current) return;
    filterKeyBootstrapped.current = true;
    setFilterKey(resolveInitialFilterKey("", orders));
  }, [isHistory, loading, initialTabParam, orders]);

  const handleFilterChange = useCallback((key: LiveFilterKey) => {
    userSelectedTabRef.current = true;
    setFilterKey(key);
  }, []);

  const shiftTabBySwipe = useCallback(
    (direction: "left" | "right") => {
      if (filterKey === "all") return;
      const idx = SWIPE_TAB_ORDER.indexOf(filterKey);
      if (idx < 0) return;
      const nextIdx = direction === "right" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= SWIPE_TAB_ORDER.length) return;
      handleFilterChange(SWIPE_TAB_ORDER[nextIdx]!);
    },
    [filterKey, handleFilterChange]
  );

  const tabSwipePanHandlers = useMemo(() => {
    if (isHistory) return {};
    return PanResponder.create({
      // Never steal the initial touch — let cards/buttons receive presses.
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx >= SWIPE_THRESHOLD) {
          shiftTabBySwipe("right");
        } else if (g.dx <= -SWIPE_THRESHOLD) {
          shiftTabBySwipe("left");
        }
      },
    }).panHandlers;
  }, [isHistory, shiftTabBySwipe]);

  const liveBoardOrders = useMemo(
    () => orders.filter((o) => isVisibleOnLiveOrdersBoard(o, nowMs)),
    [orders, nowMs]
  );

  const hasActiveOrders = useMemo(
    () => liveBoardOrders.some((o) => isActiveMerchantOrderStage(o.status)),
    [liveBoardOrders]
  );

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

      const matchesSheet = orderMatchesSheetFilters(o, sheetFilters);
      const matchesTime = isVisibleOnLiveOrdersBoard(o, nowMs);

      if (filterKey === "scheduled") {
        return matchesSearch && matchesSheet && isOpenScheduledOrder(o);
      }

      if (filterKey === "completed") {
        return (
          matchesSearch &&
          matchesSheet &&
          matchesTime &&
          isTerminalCompletedStatus(o.status)
        );
      }

      if (isOpenScheduledOrder(o)) return false;

      const matchesStatus = o.status === filterKey;
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
    const base: Partial<Record<LiveFilterKey, number>> = {
      preparing: 0,
      ready: 0,
      picked_up: 0,
      completed: 0,
      scheduled: 0,
    };
    for (const o of liveBoardOrders) {
      if (isOpenScheduledOrder(o)) {
        base.scheduled! += 1;
        continue;
      }
      if (isTerminalCompletedStatus(o.status)) {
        base.completed! += 1;
      } else if (o.status === "preparing" || o.status === "ready" || o.status === "picked_up") {
        base[o.status]! += 1;
      }
    }
    return base;
  }, [liveBoardOrders]);

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
      const orderSnap = rejectTarget;
      if (rejectReasonNeedsFollowUp(reason)) {
        setRejectTarget(null);
        beginFollowUp(reason, orderSnap.lineItems, () =>
          transitionOrder(orderSnap.id, "rejected", { rejectedReason: reason })
        );
        return;
      }
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
    [rejectTarget, transitionOrder, beginFollowUp]
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
      const id = String(order.id ?? "").trim();
      if (!id || id.startsWith("core-")) {
        Alert.alert(
          "Order details unavailable",
          "This order cannot be opened in the app yet."
        );
        return;
      }
      router.push({ pathname: "/order/[id]", params: { id } });
    },
    [router]
  );

  const handleNeedMoreTime = useCallback((order: OrderRecord) => {
    setPrepDelayOrder(order);
  }, []);

  const confirmPrepDelay = useCallback(
    async (minutes: number) => {
      if (!prepDelayOrder) return;
      setPrepDelayLoading(true);
      try {
        await extendPrepDelay(prepDelayOrder.id, minutes);
        setPrepDelayOrder(null);
      } catch {
        /* error surfaced via OrdersContext */
      } finally {
        setPrepDelayLoading(false);
      }
    },
    [prepDelayOrder, extendPrepDelay]
  );

  const renderOrder = ({ item }: { item: OrderRecord }) => {
    if (isHistory || filterKey === "completed") {
      if (isOrderWithinLast24Hours(item)) {
        return (
          <RecentCompletedOrderCard
            order={item}
            rejectedReason={item.rejectedReason}
            storeName={selectedStore?.store_name}
            onPress={() => handleViewDetail(item)}
          />
        );
      }
      return (
        <TerminalOrderCard
          order={item}
          rejectedReason={item.rejectedReason}
          storeName={selectedStore?.store_name}
          onPress={() => handleViewDetail(item)}
        />
      );
    }
    return (
      <LiveOrderCard
        order={item}
        nowMs={nowMs}
        acceptanceWindowMinutes={acceptanceWindowMinutes}
        storeName={selectedStore?.store_name}
        onAccept={() => handleAccept(item)}
        onReject={() => handleReject(item)}
        onAdvance={() => handleAdvance(item)}
        onNeedMoreTime={() => handleNeedMoreTime(item)}
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
      <StoreClosedActiveOrdersNotice visible={!isOnline && hasActiveOrders} />
      <StatusTabs
        activeKey={filterKey as LiveFilterKey}
        counts={liveCounts}
        onChange={handleFilterChange}
      />
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
      <RejectFollowUpHost
        followUp={followUp}
        onDismiss={dismissFollowUp}
        setFollowUp={setFollowUp}
      />
      <MerchantPrepDelaySheet
        visible={prepDelayOrder != null}
        loading={prepDelayLoading}
        onClose={() => !prepDelayLoading && setPrepDelayOrder(null)}
        onSelectMinutes={(mins) => void confirmPrepDelay(mins)}
      />
      <View style={styles.listSwipeArea} {...tabSwipePanHandlers}>
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
                        : filterKey === "scheduled"
                          ? "No scheduled orders right now"
                          : filterKey === "completed"
                            ? "No completed orders in the last 24 hours"
                            : isActiveMerchantOrderStage(filterKey)
                              ? `No ${filterKey.replace("_", " ")} orders`
                              : `No orders in ${filterKey.replace("_", " ")}`}
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
  listSwipeArea: {
    flex: 1,
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
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : {}),
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
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as unknown as TextStyle) : {}),
  },
  tabsOuter: {
    marginBottom: 10,
  },
  tabsRow: {
    paddingHorizontal: 0,
    paddingBottom: 4,
    gap: 8,
    alignItems: "center",
  },
  tabPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  tabPillActive: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.navy,
    backgroundColor: GatiMitraMerchant.navy,
  },
  tabPillScheduled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 2,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TAB_TEXT_COLOR,
  },
  tabLabelActivePill: {
    color: "#FFFFFF",
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

