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
  PanResponder,
  Vibration,
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
  type DeliveryType,
  type OrderCounts,
} from "@/hooks/useOrders";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { TerminalOrderCard } from "@/components/order/TerminalOrderCard";
import { CustomerStoreOrdinalPill } from "@/components/order/CustomerStoreOrdinalPill";
import { ItemVegMark } from "@/components/order/ItemVegMark";
import { OrdersFilterSheet } from "@/components/order/OrdersFilterSheet";
import {
  EMPTY_ORDERS_FILTERS,
  countActiveFilters,
  orderMatchesSheetFilters,
  type OrdersFilters,
} from "@/components/order/ordersFilterTypes";
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
const STATUS_ORANGE = "#F97316";
// Slider (slide-to-confirm) — different color per stage for quick recognition
const SLIDER_STAGE_COLORS: Record<
  "created" | "preparing" | "ready" | "picked_up",
  { track: string; knob: string }
> = {
  created: { track: "#22C55E", knob: "#16A34A" },      // Green — Accept
  preparing: { track: "#CA8A04", knob: "#A16207" },  // Deep yellow — Mark Ready
  ready: { track: "#0D9488", knob: "#0F766E" },       // Teal — Confirm Pickup
  picked_up: { track: "#7C3AED", knob: "#5B21B6" },  // Violet — Complete Delivery
};
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_LABEL_TEXT = "#FFFFFF"; // High contrast on all stage colors

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

const STATUS_BADGE_COLORS: Record<
  OrderStage,
  { bg: string; color: string; border: string }
> = {
  created: { bg: "#22C55E", color: "#FFFFFF", border: "#16A34A" },
  preparing: { bg: "#16A34A", color: "#FFFFFF", border: "#15803D" },
  ready: { bg: "#0D9488", color: "#FFFFFF", border: "#0F766E" },
  picked_up: { bg: "#2563EB", color: "#FFFFFF", border: "#1D4ED8" },
  delivered: { bg: "#16A34A", color: "#FFFFFF", border: "#15803D" },
  rejected: { bg: "#DC2626", color: "#FFFFFF", border: "#B91C1C" },
  rto: { bg: "#EA580C", color: "#FFFFFF", border: "#C2410C" },
};

function formatTimeSince(createdAt: string, nowMs: number): string {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return "";
  const diff = Math.max(0, nowMs - createdMs);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0 && mins <= 0) return "Just now";
  if (hours <= 0) return `${mins}m ago`;
  return `${hours}h ${mins}m ago`;
}

function formatTimerSince(createdAt: string, nowMs: number): string {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return "00:00";
  const diff = Math.max(0, nowMs - createdMs);
  const totalSeconds = Math.floor(diff / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

function DeliveryBadge({ deliveryType }: { deliveryType: DeliveryType }) {
  let label = "Delivery";
  let bg = "#E5E7EB";
  let color = GatiMitraMerchant.textSecondary;
  if (deliveryType === "GATIMITRA_RIDER") {
    label = "GatiMitra Rider";
    bg = "#DBEAFE";
    color = "#1D4ED8";
  } else if (deliveryType === "SELF_DELIVERY") {
    label = "Self Delivery";
    bg = "#DCFCE7";
    color = STATUS_GREEN;
  } else if (deliveryType === "SELF_PICKUP") {
    label = "Self Pickup";
    bg = "#FEF3C7";
    color = "#92400E";
  }
  return (
    <View style={[styles.deliveryBadge, { backgroundColor: bg }]}>
      <Text style={[styles.deliveryBadgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: OrderStage }) {
  const { bg, color, border } = STATUS_BADGE_COLORS[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.statusBadgeText, { color }]} numberOfLines={1}>
        {status.replace("_", " ").toUpperCase()}
      </Text>
    </View>
  );
}

function OtpPill({
  label,
  code,
}: {
  label: string;
  code: string;
}) {
  const digits = code.split("");
  return (
    <View style={styles.otpRow}>
      <Text style={styles.otpLabel}>{label}</Text>
      <View style={styles.otpBoxes}>
        {digits.map((d, i) => (
          <View key={`${label}-${i}`} style={styles.otpBox}>
            <Text style={styles.otpDigit}>{d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type SliderStage = "created" | "preparing" | "ready" | "picked_up";

type SlideToConfirmProps = {
  label: string;
  onConfirmed: () => void;
  disabled?: boolean;
  stage?: SliderStage;
};

function SlideToConfirm({ label, onConfirmed, disabled, stage = "created" }: SlideToConfirmProps) {
  const trackWidth = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const colors = SLIDER_STAGE_COLORS[stage];

  // Subtle "active" pulse when slider is enabled
  useEffect(() => {
    if (disabled) {
      pulseOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.88,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, pulseOpacity]);

  const reset = useCallback(() => {
    confirmedRef.current = false;
    Animated.timing(translateX, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const handleConfirm = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    Vibration.vibrate(15);
    onConfirmed();
    setTimeout(reset, 260);
  }, [onConfirmed, reset]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled && Math.abs(gesture.dx) > 6,
      onPanResponderMove: (_, gesture) => {
        if (disabled) return;
        const max = Math.max(0, trackWidth.current - 46); // knob ~46
        const next = Math.min(max, Math.max(0, gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        if (disabled) {
          reset();
          return;
        }
        const max = Math.max(0, trackWidth.current - 46);
        const threshold = max * 0.7;
        if (gesture.dx >= threshold) {
          Animated.timing(translateX, {
            toValue: max,
            duration: 140,
            useNativeDriver: true,
          }).start(handleConfirm);
        } else {
          reset();
        }
      },
      onPanResponderTerminate: () => {
        reset();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.sliderTrack,
        !disabled && { backgroundColor: colors.track },
        disabled && styles.sliderTrackDisabled,
        !disabled && { opacity: pulseOpacity },
      ]}
      onLayout={(e) => {
        trackWidth.current = e.nativeEvent.layout.width;
      }}
    >
      <Text
        style={[
          styles.sliderLabel,
          disabled && styles.sliderLabelDisabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Animated.View
        style={[
          styles.sliderKnob,
          !disabled && { backgroundColor: colors.knob },
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

function canMerchantMarkDelivered(order: OrderRecord): boolean {
  if (order.deliveryType === "GATIMITRA_RIDER") return false;
  return true;
}

type OrderCardProps = {
  order: OrderRecord;
  nowMs: number;
  onAccept: () => void;
  onReject: () => void;
  onAdvance: () => void;
  onViewDetail: () => void;
};

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

function OrderCard({
  order,
  nowMs,
  onAccept,
  onReject,
  onAdvance,
  onViewDetail,
}: OrderCardProps) {
  if (isTerminalStatus(order.status)) {
    return (
      <TerminalOrderCard
        order={order}
        formattedOrderId={order.formattedOrderId}
        rejectedReason={order.rejectedReason}
        onPress={onViewDetail}
      />
    );
  }

  const timeSince = formatTimeSince(order.createdAt, nowMs);
  const timer = formatTimerSince(order.createdAt, nowMs);

  // Pickup OTP only after store person marks order as Ready (show in ready & picked_up)
  const showPickupOtp =
    (order.status === "ready" || order.status === "picked_up") &&
    !!order.pickupOtp;
  const showRtoOtp = order.status === "rto" && !!order.rtoOtp;

  const primaryActionLabel = (() => {
    switch (order.status) {
      case "created":
        return `ACCEPT ORDER ${timer}`;
      case "preparing":
        return `MARK READY ${timer}`;
      case "ready":
        return "CONFIRM PICKUP";
      case "picked_up":
        return canMerchantMarkDelivered(order) ? "COMPLETE DELIVERY" : "RIDER WILL COMPLETE";
      default:
        return "";
    }
  })();

  const sliderDisabled =
    order.status === "delivered" ||
    order.status === "rejected" ||
    order.status === "rto" ||
    (order.status === "picked_up" && !canMerchantMarkDelivered(order));

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.orderIdText}>
            {order.formattedOrderId ?? order.orderNumber}{" "}
            <Text style={styles.dotSeparator}>•</Text> {order.displayTime}
          </Text>
          <View style={styles.customerNameRow}>
            <Text style={styles.customerName} numberOfLines={1}>
              {order.customerName}
            </Text>
            <CustomerStoreOrdinalPill
              ordinal={order.customerStoreOrderOrdinal}
              variant="inline"
            />
          </View>
          <Text style={styles.timeSince}>{timeSince}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <DeliveryBadge deliveryType={order.deliveryType} />
          <StatusBadge status={order.status} />
          <Pressable
            onPress={onViewDetail}
            style={({ pressed }) => [
              styles.moreBtn,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
            hitSlop={8}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={18}
              color={GatiMitraMerchant.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.itemsSection}>
        {order.lineItems.slice(0, 2).map((item, idx) => (
          <View key={`${order.id}-${idx}`} style={styles.itemRow}>
            <ItemVegMark vegNonveg={item.vegNonveg} name={item.name} size={14} />
            <Text style={styles.itemText} numberOfLines={1}>
              {item.qty} x {item.name}
            </Text>
            <Text style={styles.itemPrice}>₹ {item.price}</Text>
          </View>
        ))}
        {order.lineItems.length > 2 && (
          <View style={styles.moreItemsRow}>
            <Text style={styles.moreItemsText}>
              +{order.lineItems.length - 2} More
            </Text>
            <Text style={styles.moreItemsTotal}>
              ₹{order.total.toLocaleString("en-IN")}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total bill: </Text>
        <Text style={styles.totalAmount}>₹ {order.total}</Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={GatiMitraMerchant.textTertiary}
          style={styles.totalChevron}
        />
      </View>

      {showPickupOtp && order.pickupOtp && (
        <OtpPill label="Pickup OTP" code={order.pickupOtp} />
      )}
      {showRtoOtp && order.rtoOtp && (
        <OtpPill label="RTO OTP" code={order.rtoOtp} />
      )}

      {order.status === "created" ? (
        <View style={styles.createdActionsRow}>
          <View style={styles.createdAcceptWrap}>
            <SlideToConfirm
              label={primaryActionLabel}
              onConfirmed={onAccept}
              disabled={false}
              stage="created"
            />
          </View>
          <Pressable
            onPress={onReject}
            style={({ pressed }) => [
              styles.rejectBtn,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Text style={styles.rejectBtnText}>Reject</Text>
          </Pressable>
        </View>
      ) : primaryActionLabel ? (
        <View style={styles.sliderOnlyRow}>
          <SlideToConfirm
            label={primaryActionLabel}
            onConfirmed={onAdvance}
            disabled={sliderDisabled}
            stage={
              order.status === "preparing"
                ? "preparing"
                : order.status === "ready"
                  ? "ready"
                  : "picked_up"
            }
          />
        </View>
      ) : null}
    </View>
  );
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

  const handleReject = useCallback(
    (order: OrderRecord) => {
      if (order.status === "created") {
        transitionOrder(order.id, "rejected");
      }
    },
    [transitionOrder]
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
      <OrderCard
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

