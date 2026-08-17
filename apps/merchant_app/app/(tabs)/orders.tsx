/**
 * Orders Management — real-time operational board for GatiMitra Partner.
 * - Horizontal status nav: Preparing | Ready | Picked Up | Completed | Scheduled
 * - Swipe left/right on the list to switch tabs.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  View,
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
  Alert,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useNowMs } from "@/hooks/useNowMs";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useMerchantNavigate } from "@/lib/merchantNavigation";
import { useProfileNav } from "@/context/ProfileNavContext";
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
import { OrdersStageEmptyState } from "@/components/order/OrdersStageEmptyState";
import type { OrderStageEmptyKey } from "@/lib/orderStageAssets";
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
import {
  claimHorizontalGesture,
  horizontalGestureClaimed,
  releaseHorizontalGesture,
} from "@/lib/horizontalGestureLock";
import { openOrderDetailOnce } from "@/lib/openOrderDetailOnce";
import { useStoreStatus } from "@/context/StoreStatusContext";
import {
  clearVisibleRiderTrackingOrderIds,
  setVisibleRiderTrackingOrderIds,
} from "@/lib/riderTrackingVisibility";

export type OrdersListMode = "live" | "history";

const SEARCH_BG = "#F1F5F9";
const TAB_TEXT_COLOR = GatiMitraMerchant.textSecondary;
const STATUS_GREEN = "#22C55E";
const STATUS_RED = "#EF4444";
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_LABEL_TEXT = "#FFFFFF";
type LiveFilterKey = "preparing" | "ready" | "picked_up" | "completed" | "rto" | "scheduled";

function liveFilterToEmptyStage(key: LiveFilterKey): OrderStageEmptyKey {
  return key;
}
type FilterKey = LiveFilterKey | "all";

const STATUS_TABS: { key: LiveFilterKey; label: string }[] = [
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Picked Up" },
  { key: "completed", label: "Completed" },
];

const RTO_TAB: { key: LiveFilterKey; label: string } = { key: "rto", label: "RTO" };
const SCHEDULED_TAB: { key: LiveFilterKey; label: string } = { key: "scheduled", label: "Scheduled" };

const DEFAULT_LIVE_TAB: LiveFilterKey = "preparing";

/** Tab order used for swipe navigation (left = previous, right = next). */
const SWIPE_TAB_ORDER: LiveFilterKey[] = [
  ...STATUS_TABS.map((t) => t.key),
  RTO_TAB.key,
  SCHEDULED_TAB.key,
];

const SWIPE_THRESHOLD = 56;
/** Flick past this (px/s) and the stage switches even on a short drag. */
const SWIPE_VELOCITY = 550;
/** List body tracks the finger — chrome (search / tabs) stays fixed outside this transform. */
const SWIPE_DRAG_DAMPING = 0.85;

function tabPillActiveStyle(isActive: boolean) {
  return isActive ? styles.tabPillActive : null;
}

function isTerminalCompletedStatus(status: OrderStage): boolean {
  return status === "delivered" || status === "rejected";
}

function TabPillLabel({ label, count, active }: { label: string; count: number; active: boolean }) {
  return (
    <View style={styles.tabLabelRow}>
      <Text
        style={[styles.tabLabel, active && styles.tabLabelActivePill]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.tabCount, active && styles.tabLabelActivePill]}
        numberOfLines={1}
      >
        {count}
      </Text>
    </View>
  );
}

function isScheduledOrder(order: OrderRecord): boolean {
  return Boolean(order.isScheduledOrder);
}

function isOpenScheduledOrder(order: OrderRecord): boolean {
  return (
    isScheduledOrder(order) &&
    order.status !== "delivered" &&
    order.status !== "rejected" &&
    order.status !== "rto"
  );
}

function SearchBar({
  onDebouncedChange,
  filterCount,
  onFilterPress,
  showFilter,
}: {
  onDebouncedChange: (value: string) => void;
  filterCount: number;
  onFilterPress: () => void;
  showFilter?: boolean;
}) {
  const [value, setValue] = useState("");
  const debounced = useDebouncedValue(value, 250);

  useEffect(() => {
    onDebouncedChange(debounced);
  }, [debounced, onDebouncedChange]);

  return (
    <View style={styles.searchRow}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={GatiMitraMerchant.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order id"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={value}
          onChangeText={setValue}
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
  const rtoCount = counts.rto ?? 0;
  const scheduledActive = activeKey === SCHEDULED_TAB.key;
  const rtoActive = activeKey === RTO_TAB.key;

  return (
    // The pill strip scrolls sideways itself, so hold the horizontal gesture
    // while it is touched instead of letting the board switch stages.
    <View
      style={styles.tabsOuter}
      onTouchStart={claimHorizontalGesture}
      onTouchEnd={releaseHorizontalGesture}
      onTouchCancel={releaseHorizontalGesture}
    >
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
              <TabPillLabel label={tab.label} count={count} active={isActive} />
            </Pressable>
          );
        })}

        <Pressable
          key={RTO_TAB.key}
          onPress={() => onChange(RTO_TAB.key)}
          onLayout={handleLayout(RTO_TAB.key)}
          style={({ pressed }) => [
            styles.tabPill,
            tabPillActiveStyle(rtoActive),
            pressed && styles.tabItemPressed,
            GatiMitraMerchant.cursorPointer,
          ]}
        >
          <TabPillLabel label={RTO_TAB.label} count={rtoCount} active={rtoActive} />
        </Pressable>

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
          <TabPillLabel label={SCHEDULED_TAB.label} count={scheduledCount} active={scheduledActive} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function resolveInitialFilterKey(tabParam: string, _orders: OrderRecord[]): LiveFilterKey {
  if (tabParam === "active" || tabParam === "new" || tabParam === "created" || tabParam === "all") {
    return DEFAULT_LIVE_TAB;
  }
  if (tabParam === "delivered" || tabParam === "rejected") return "completed";
  if (tabParam === "rto") return "rto";
  if (SWIPE_TAB_ORDER.includes(tabParam as LiveFilterKey)) {
    return tabParam as LiveFilterKey;
  }
  // Always open on Preparing unless a route `tab` param says otherwise.
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
  const { push: navPush, pathname } = useMerchantNavigate();
  const { setReturnRoute } = useProfileNav();
  const params = useLocalSearchParams<{ tab?: string }>();
  const scrollBottomPadding = isHistory ? 24 : TAB_BAR_SCROLL_CONTENT_PADDING;
  const { selectedStore, managedStores } = useSelectedStore();
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
  const nowMs = useNowMs(true, 60_000);
  const [rejectTarget, setRejectTarget] = useState<OrderRecord | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [prepDelayOrder, setPrepDelayOrder] = useState<OrderRecord | null>(null);
  const [prepDelayLoading, setPrepDelayLoading] = useState(false);
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();

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

  /** `next` advances toward Scheduled, `previous` moves back toward Preparing. */
  const shiftTabBySwipe = useCallback(
    (direction: "next" | "previous") => {
      if (filterKey === "all") return;
      const idx = SWIPE_TAB_ORDER.indexOf(filterKey);
      if (idx < 0) return;
      const nextIdx = direction === "next" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= SWIPE_TAB_ORDER.length) return;
      handleFilterChange(SWIPE_TAB_ORDER[nextIdx]!);
    },
    [filterKey, handleFilterChange]
  );

  const { width: windowWidth } = useWindowDimensions();
  const dragX = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const pageWidthSV = useSharedValue(Math.max(280, windowWidth));
  const swipeCommitting = useSharedValue(false);

  useEffect(() => {
    pageWidthSV.value = Math.max(280, windowWidth);
  }, [windowWidth, pageWidthSV]);

  /**
   * Sideways pan only on the order list body. Search / banners / status pills
   * stay outside this detector so the top chrome never slides with the finger.
   * Manual activation keeps vertical list scrolling intact.
   */
  const tabSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isHistory)
        .manualActivation(true)
        .onTouchesDown((e) => {
          "worklet";
          const touch = e.changedTouches[0];
          if (!touch) return;
          touchStartX.value = touch.absoluteX;
          touchStartY.value = touch.absoluteY;
          swipeCommitting.value = false;
        })
        .onTouchesMove((e, state) => {
          "worklet";
          const touch = e.changedTouches[0];
          if (!touch) return;
          if (horizontalGestureClaimed.value) {
            state.fail();
            return;
          }
          const dx = touch.absoluteX - touchStartX.value;
          const dy = touch.absoluteY - touchStartY.value;
          if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
            state.fail();
            return;
          }
          if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            state.activate();
          }
        })
        .onUpdate((e) => {
          "worklet";
          if (horizontalGestureClaimed.value) return;
          const maxDrag = Math.min(pageWidthSV.value * 0.42, 180);
          const damped = e.translationX * SWIPE_DRAG_DAMPING;
          dragX.value = Math.max(-maxDrag, Math.min(maxDrag, damped));
        })
        .onEnd((e) => {
          "worklet";
          if (horizontalGestureClaimed.value) return;
          const commitNext =
            e.translationX <= -SWIPE_THRESHOLD || e.velocityX <= -SWIPE_VELOCITY;
          const commitPrev =
            e.translationX >= SWIPE_THRESHOLD || e.velocityX >= SWIPE_VELOCITY;
          if (commitNext || commitPrev) {
            // Switch tab immediately — no exit/enter off-screen hop (that left a blank gap).
            swipeCommitting.value = true;
            runOnJS(shiftTabBySwipe)(commitNext ? "next" : "previous");
            dragX.value = withTiming(0, { duration: 120 });
            return;
          }
          dragX.value = withTiming(0, { duration: 160 });
        })
        .onFinalize(() => {
          "worklet";
          if (!swipeCommitting.value) {
            dragX.value = withTiming(0, { duration: 160 });
          }
        }),
    [dragX, isHistory, pageWidthSV, shiftTabBySwipe, swipeCommitting, touchStartX, touchStartY]
  );

  const swipeAreaStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }));

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

      if (filterKey === "rto") {
        return (
          matchesSearch &&
          matchesSheet &&
          matchesTime &&
          o.status === "rto"
        );
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
      rto: 0,
      scheduled: 0,
    };
    for (const o of liveBoardOrders) {
      if (isOpenScheduledOrder(o)) {
        base.scheduled! += 1;
        continue;
      }
      if (o.status === "rto") {
        base.rto! += 1;
      } else if (isTerminalCompletedStatus(o.status)) {
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
        void transitionOrder(order.id, "preparing").catch(() => {
          /* error surfaced via OrdersContext */
        });
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
          void transitionOrder(orderSnap.id, "rejected", { rejectedReason: reason }).catch(
            () => {}
          )
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
      const pipeline = (order.pipelineStatus ?? "").toUpperCase();
      if (
        order.status === "preparing" ||
        pipeline === "ACCEPTED" ||
        pipeline === "PREPARING"
      ) {
        void transitionOrder(order.id, "ready").catch(() => {});
        return;
      }
      if (order.status === "ready" || pipeline === "READY_FOR_PICKUP") {
        void transitionOrder(order.id, "picked_up").catch(() => {});
        return;
      }
      if (
        (order.status === "picked_up" || pipeline === "OUT_FOR_DELIVERY") &&
        canMerchantMarkDelivered(order)
      ) {
        void transitionOrder(order.id, "delivered").catch(() => {});
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
      openOrderDetailOnce(router, id, { fromPath: pathname, currentPath: pathname, setReturnRoute });
    },
    [router, pathname, setReturnRoute]
  );

  const handleOpenReview = useCallback(
    (order: OrderRecord) => {
      if (order.status !== "delivered" || !order.storeRating) return;
      const id = String(order.id ?? "").trim();
      if (!id || id.startsWith("core-")) return;
      const returnTo =
        filterKey === "completed" ? "/(tabs)/orders?tab=completed" : pathname;
      navPush(`/order-review/${id}`, returnTo);
    },
    [filterKey, navPush, pathname]
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

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 35,
    minimumViewTime: 250,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: OrderRecord }> }) => {
      const ids: number[] = [];
      for (const row of viewableItems) {
        const n = parseInt(String(row.item.id), 10);
        if (Number.isFinite(n) && n > 0) ids.push(n);
      }
      setVisibleRiderTrackingOrderIds(ids);
    }
  ).current;

  useFocusEffect(
    useCallback(() => {
      return () => clearVisibleRiderTrackingOrderIds();
    }, [])
  );

  const renderOrder = ({ item }: { item: OrderRecord }) => {
    const orderStoreName =
      item.merchantStoreName?.trim() ||
      (item.merchantStoreId != null
        ? managedStores.find((s) => s.id === item.merchantStoreId)?.store_name
        : null) ||
      selectedStore?.store_name;
    if (isHistory || filterKey === "completed" || filterKey === "rto") {
      if (isOrderWithinLast24Hours(item)) {
        return (
          <RecentCompletedOrderCard
            order={item}
            rejectedReason={item.rejectedReason}
            storeName={orderStoreName}
            onPress={() => handleViewDetail(item)}
            onReviewPress={() => handleOpenReview(item)}
          />
        );
      }
      return (
        <TerminalOrderCard
          order={item}
          rejectedReason={item.rejectedReason}
          storeName={orderStoreName}
          onPress={() => handleViewDetail(item)}
          onReviewPress={() => handleOpenReview(item)}
        />
      );
    }
    return (
      <LiveOrderCard
        order={item}
        acceptanceWindowMinutes={acceptanceWindowMinutes}
        storeName={orderStoreName}
        onAccept={() => handleAccept(item)}
        onReject={() => handleReject(item)}
        onAdvance={() => handleAdvance(item)}
        onNeedMoreTime={() => handleNeedMoreTime(item)}
        onViewDetail={() => handleViewDetail(item)}
        onReviewPress={() => handleOpenReview(item)}
      />
    );
  };

  const activeFilterCount = countActiveFilters(sheetFilters);

  const listHeader = isHistory ? (
    <>
      <SearchBar
        onDebouncedChange={setSearch}
        filterCount={activeFilterCount}
        onFilterPress={() => setFilterSheetOpen(true)}
        showFilter
      />
      <OrderDateRangeBar range={dateRange} onPress={() => setDateSheetOpen(true)} />
    </>
  ) : null;

  const liveFixedChrome = !isHistory ? (
    <View style={styles.fixedChrome}>
      <SearchBar
        onDebouncedChange={setSearch}
        filterCount={activeFilterCount}
        onFilterPress={() => setFilterSheetOpen(true)}
        showFilter
      />
      <PastOrdersBanner onPress={() => navPush("/order-history")} />
      <StoreClosedActiveOrdersNotice visible={!isOnline && hasActiveOrders} />
      <StatusTabs
        activeKey={filterKey as LiveFilterKey}
        counts={liveCounts}
        onChange={handleFilterChange}
      />
    </View>
  ) : null;

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

  const listShowsStageEmpty =
    !isHistory &&
    !search.trim() &&
    filteredOrders.length === 0 &&
    !(loading && orders.length === 0);

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
      {liveFixedChrome}
      <GestureDetector gesture={tabSwipeGesture}>
        <Animated.View
          style={[
            styles.listSwipeArea,
            !isHistory ? swipeAreaStyle : null,
          ]}
        >
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            renderItem={renderOrder}
            ListHeaderComponent={listHeader}
            contentContainerStyle={[
              styles.listContent,
              !isHistory ? styles.listContentUnderChrome : null,
              listShowsStageEmpty ? styles.listContentStageEmpty : null,
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
              loading && orders.length === 0 ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator
                    size="large"
                    color={GatiMitraMerchant.primary}
                  />
                  <Text style={styles.loadingText}>Loading orders…</Text>
                </View>
              ) : (
                (() => {
                  const emptyStage =
                    !isHistory && filterKey !== "all" ? liveFilterToEmptyStage(filterKey) : null;
                  if (emptyStage && !search.trim()) {
                    const stageMessage =
                      filterKey === "completed"
                        ? "No completed orders in the last 24 hours"
                        : filterKey === "rto"
                          ? "No RTO orders in the last 24 hours"
                          : filterKey === "scheduled"
                            ? "No scheduled orders right now"
                            : undefined;
                    return (
                      <OrdersStageEmptyState stage={emptyStage} message={stageMessage} />
                    );
                  }
                  return (
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
                        : `No orders in ${filterKey.replace("_", " ")}`}
                  </Text>
                </View>
                  );
                })()
              )
            }
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            windowSize={5}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}
            extraData={filterKey}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        </Animated.View>
      </GestureDetector>
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
  fixedChrome: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    zIndex: 2,
  },
  listSwipeArea: {
    flex: 1,
    overflow: "hidden",
  },
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
  },
  listContentUnderChrome: {
    paddingTop: 8,
  },
  listContentStageEmpty: {
    flexGrow: 1,
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
    borderWidth: 1,
    borderColor: "#BFDBFE",
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
    borderRadius: 12,
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
    minHeight: 33.5,
    paddingHorizontal: 12,
    paddingVertical: 6.5,
    borderRadius: 10,
    // Kept on every pill (transparent when idle) so selecting one does not
    // resize it and push the label off-centre.
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillActive: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.navy,
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 10,
  },
  tabPillScheduled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: TAB_TEXT_COLOR,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  tabCount: {
    fontSize: 13,
    fontWeight: "700",
    color: TAB_TEXT_COLOR,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  tabLabelActivePill: {
    color: "#FFFFFF",
  },
  emptyWrap: {
    paddingTop: 120,
    paddingBottom: 48,
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

