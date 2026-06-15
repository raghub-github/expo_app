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
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRiderOrderHistory,
  type RiderOrderHistoryFilter,
} from "@/src/hooks/useOrders";
import { openOrderHistoryDetail } from "@/src/lib/order-history-nav";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { colors } from "@/src/theme";
import { OrderCategoryDropdown } from "@/src/components/profile/OrderCategoryDropdown";
import {
  OrderHistoryDateRangeSheet,
  formatDateRangeChip,
  isOrderInDateRange,
} from "@/src/components/profile/OrderHistoryDateRangeSheet";
import {
  formatRideHistoryListDate,
  orderHistoryCategoryVisual,
  orderHistorySubtitle,
  orderHistoryTitle,
  orderMatchesHistorySearch,
  rideHistoryDropLabel,
  rideHistoryEarningLabel,
  rideHistoryOrderId,
  rideHistoryStatusLabel,
  isOrderEarningCreditPending,
} from "@/src/lib/rider-ride-history-display";
import { formatOrderHistoryPaymentLabel } from "@/src/lib/rider-payment-display";

const GREEN = colors.success[600];
const GREEN_LIGHT = "#ECFDF5";
const INK = "#111827";
const BG = "#F5F6F8";
const SURFACE = "#FFFFFF";
const MUTED = "#6B7280";
const BORDER = "#E8ECF0";
const CARD_BORDER = "#D1D5DB";

function formatCompactAddress(raw: string, maxLen = 120): string {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!unique.some((u) => u.toLowerCase() === key)) unique.push(part);
  }
  const joined = unique.join(", ");
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen - 1).trim()}…`;
}

function MyOrdersHeader({
  category,
  searchQuery,
  searchFocused,
  searchRef,
  hasDateFilter,
  onBack,
  onCategoryFilter,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onClearSearch,
  onOpenDateFilter,
}: {
  category: RiderOrderHistoryFilter;
  searchQuery: string;
  searchFocused: boolean;
  searchRef: React.RefObject<TextInput | null>;
  hasDateFilter: boolean;
  onBack: () => void;
  onCategoryFilter: (id: RiderOrderHistoryFilter) => void;
  onSearchChange: (text: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onClearSearch: () => void;
  onOpenDateFilter: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.headerShell}>
      <View style={styles.headerTop}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
          hitSlop={6}
        >
          <Ionicons name="arrow-back" size={22} color={INK} />
        </Pressable>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t("profile.myOrders.title", "My Orders")}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {t("profile.myOrders.subtitle", "View your past orders")}
          </Text>
        </View>
        <OrderCategoryDropdown value={category} onChange={onCategoryFilter} />
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchBox, searchFocused && styles.searchBoxFocused]}>
          <Ionicons name="search" size={18} color={MUTED} />
          <TextInput
            ref={searchRef}
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder={t("profile.myOrders.searchPlaceholder", "Search order ID, restaurant…")}
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={onClearSearch} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onOpenDateFilter}
          style={({ pressed }) => [
            styles.filterBtn,
            hasDateFilter && styles.filterBtnActive,
            pressed && styles.pressed,
          ]}
          hitSlop={4}
        >
          <Ionicons
            name={hasDateFilter ? "calendar" : "options-outline"}
            size={20}
            color={hasDateFilter ? GREEN : INK}
          />
        </Pressable>
      </View>
    </View>
  );
}

function StatsCard({
  ordersCount,
  totalEarned,
}: {
  ordersCount: number;
  totalEarned: string;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.statsCard}>
      <View style={styles.statHalf}>
        <View style={styles.statIconWrap}>
          <Ionicons name="bag-handle-outline" size={18} color={GREEN} />
        </View>
        <View style={styles.statTextCol}>
          <Text style={styles.statValue}>{ordersCount}</Text>
          <Text style={styles.statLabel}>
            {t("profile.myOrders.totalOrders", "Total Orders")}
          </Text>
        </View>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statHalf}>
        <View style={styles.statIconWrap}>
          <Ionicons name="cash-outline" size={18} color={GREEN} />
        </View>
        <View style={styles.statTextCol}>
          <Text style={[styles.statValue, styles.statValueGreen]}>{totalEarned}</Text>
          <Text style={styles.statLabel}>
            {t("profile.myOrders.totalEarned", "Total Earned")}
          </Text>
        </View>
      </View>
    </View>
  );
}

function OrderCard({
  order,
  onPress,
}: {
  order: RiderOrderSummary;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const visual = orderHistoryCategoryVisual(order.category);
  const isDone = order.status === "delivered";
  const isCancelled = order.status === "cancelled";
  const earningPending = isOrderEarningCreditPending(order);
  const subtitle = orderHistorySubtitle(order);
  const drop = formatCompactAddress(rideHistoryDropLabel(order));
  const paymentLabel = formatOrderHistoryPaymentLabel(
    order.paymentMethod,
    order.paymentStatus,
    t
  );
  const statusLabel = rideHistoryStatusLabel(order.status, t, order);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.orderCardPressable, pressed && styles.pressed]}
    >
      <View style={styles.orderCard}>
      <View style={styles.orderCardInner}>
        <View style={styles.orderTop}>
          <View style={[styles.orderCatCircle, { backgroundColor: visual.iconBg }]}>
            <Ionicons name={visual.icon} size={20} color={visual.iconColor} />
          </View>
          <View style={styles.orderMetaCol}>
            <Text style={styles.orderId} numberOfLines={1} ellipsizeMode="tail">
              {rideHistoryOrderId(order)}
            </Text>
            <Text style={styles.orderDate} numberOfLines={1} ellipsizeMode="tail">
              {formatRideHistoryListDate(order.createdAt)}
            </Text>
          </View>
          <View style={styles.orderPriceCol}>
            <Text style={styles.orderPrice} numberOfLines={1}>
              {rideHistoryEarningLabel(order, t)}
            </Text>
            {subtitle ? (
              <Text style={styles.orderItems} numberOfLines={1} ellipsizeMode="tail">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.orderTitle} numberOfLines={2} ellipsizeMode="tail">
          {orderHistoryTitle(order)}
        </Text>

        <View style={styles.orderAddressRow}>
          <View style={styles.orderAddressIcon}>
            <Ionicons name="location-outline" size={16} color={GREEN} />
          </View>
          <Text style={styles.orderAddress} numberOfLines={2} ellipsizeMode="tail">
            {drop}
          </Text>
        </View>

        {paymentLabel ? (
          <View style={styles.orderMetaRow}>
            <View style={styles.orderAddressIcon}>
              <Ionicons name="wallet-outline" size={15} color={GREEN} />
            </View>
            <Text style={styles.orderMetaText} numberOfLines={1} ellipsizeMode="tail">
              {paymentLabel}
            </Text>
          </View>
        ) : null}

        <View style={styles.orderFoot}>
          <View
            style={[
              styles.statusPill,
              isDone && !earningPending && styles.statusPillDone,
              earningPending && styles.statusPillPending,
              isCancelled && styles.statusPillCancelled,
            ]}
          >
            {isDone && !earningPending ? <View style={styles.statusDot} /> : null}
            <Text
              style={[
                styles.statusPillText,
                isDone && !earningPending && styles.statusPillTextDone,
                earningPending && styles.statusPillTextPending,
                isCancelled && styles.statusPillTextCancelled,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
          <View style={styles.viewDetailsRow}>
            <Text style={styles.viewDetailsText}>
              {t("profile.myOrders.viewDetails", "View Details")}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={MUTED} />
          </View>
        </View>
      </View>
      </View>
    </Pressable>
  );
}

export function MyRidesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const searchRef = useRef<TextInput>(null);
  const [category, setCategory] = useState<RiderOrderHistoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showDateSheet, setShowDateSheet] = useState(false);

  const hasDateFilter = dateFrom != null || dateTo != null;
  const { data, isLoading, isFetching, error, refetch } = useRiderOrderHistory(category);

  const onCategoryFilter = useCallback((id: RiderOrderHistoryFilter) => {
    setCategory(id);
  }, []);

  const orders = useMemo(() => {
    let list = data?.orders ?? [];
    if (searchQuery.trim()) {
      list = list.filter((o) => orderMatchesHistorySearch(o, searchQuery));
    }
    if (hasDateFilter) {
      list = list.filter((o) => isOrderInDateRange(o.createdAt, dateFrom, dateTo));
    }
    return [...list].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });
  }, [data?.orders, searchQuery, dateFrom, dateTo, hasDateFilter]);

  const openDetail = useCallback(
    (order: RiderOrderSummary) => {
      openOrderHistoryDetail(order, queryClient);
    },
    [queryClient]
  );

  const totalEarned = useMemo(() => {
    const sum = orders.reduce((acc, o) => {
      if (isOrderEarningCreditPending(o)) return acc;
      return acc + (o.totalEarning ?? o.estimatedEarning ?? 0);
    }, 0);
    if (!sum) return "₹0";
    return `₹${Math.round(sum).toLocaleString("en-IN")}`;
  }, [orders]);

  const listHeader = useMemo(
    () => (
      <View style={styles.listHead}>
        <StatsCard ordersCount={orders.length} totalEarned={totalEarned} />
        {hasDateFilter ? (
          <Pressable
            onPress={() => {
              setDateFrom(null);
              setDateTo(null);
            }}
            style={styles.dateChip}
          >
            <Ionicons name="calendar" size={14} color={GREEN} />
            <Text style={styles.dateChipText}>{formatDateRangeChip(dateFrom, dateTo)}</Text>
            <Ionicons name="close" size={14} color={MUTED} />
          </Pressable>
        ) : null}
        <Text style={styles.resultsLabel}>
          {orders.length === 1
            ? t("profile.myOrders.oneResult", "1 order")
            : t("profile.myOrders.nResults", "{{count}} orders", { count: orders.length })}
        </Text>
      </View>
    ),
    [dateFrom, dateTo, hasDateFilter, orders.length, totalEarned, t]
  );

  const renderItem = useCallback(
    ({ item }: { item: RiderOrderSummary }) => (
      <OrderCard order={item} onPress={() => openDetail(item)} />
    ),
    [openDetail]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.screen}>
      <MyOrdersHeader
        category={category}
        searchQuery={searchQuery}
        searchFocused={searchFocused}
        searchRef={searchRef}
        hasDateFilter={hasDateFilter}
        onBack={() => router.back()}
        onCategoryFilter={onCategoryFilter}
        onSearchChange={setSearchQuery}
        onSearchFocus={() => setSearchFocused(true)}
        onSearchBlur={() => setSearchFocused(false)}
        onClearSearch={() => setSearchQuery("")}
        onOpenDateFilter={() => setShowDateSheet(true)}
      />

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
          contentContainerStyle={[
            styles.listContent,
            orders.length === 0 && styles.listEmpty,
          ]}
          style={styles.list}
          overScrollMode="never"
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => refetch()}
              tintColor={GREEN}
            />
          }
          removeClippedSubviews={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="receipt-outline" size={40} color="#D1D5DB" />
              </View>
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
      </View>

      <OrderHistoryDateRangeSheet
        visible={showDateSheet}
        onClose={() => setShowDateSheet(false)}
        initialFrom={dateFrom}
        initialTo={dateTo}
        onApply={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, overflow: "hidden" },
  screen: { flex: 1, overflow: "hidden" },
  pressed: { opacity: 0.9 },

  headerShell: {
    backgroundColor: BG,
    paddingBottom: 12,
    overflow: "hidden",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchBoxFocused: {
    borderColor: GREEN,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: INK,
    paddingVertical: 8,
  },
  filterBtn: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  filterBtnActive: {
    backgroundColor: GREEN_LIGHT,
    borderColor: GREEN,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  listEmpty: { flexGrow: 1 },
  listHead: { paddingTop: 4, paddingBottom: 4 },

  statsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: CARD_BORDER,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
      },
      android: { elevation: 0 },
      default: {},
    }),
  },
  statHalf: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  statTextCol: {
    minWidth: 0,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GREEN_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: CARD_BORDER,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: INK,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  statValueGreen: { color: GREEN },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    marginTop: 1,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: GREEN_LIGHT,
    marginBottom: 10,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#047857",
  },
  resultsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  separator: { height: 12 },

  orderCardPressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  orderCard: {
    width: "100%",
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  orderCardInner: {
    width: "100%",
  },
  orderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  orderCatCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  orderMetaCol: { flex: 1, minWidth: 0, marginRight: 8, flexShrink: 1 },
  orderId: { fontSize: 14, fontWeight: "800", color: INK },
  orderDate: { fontSize: 12, fontWeight: "500", color: MUTED, marginTop: 2 },
  orderPriceCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    width: 72,
  },
  orderPrice: { fontSize: 16, fontWeight: "800", color: INK },
  orderItems: { fontSize: 12, fontWeight: "500", color: MUTED, marginTop: 2 },
  orderTitle: {
    width: "100%",
    fontSize: 15,
    fontWeight: "700",
    color: INK,
    lineHeight: 21,
    marginBottom: 10,
  },
  orderAddressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  orderAddressIcon: {
    width: 18,
    marginTop: 1,
    flexShrink: 0,
    alignItems: "center",
  },
  orderAddress: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 19,
  },
  orderMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 14,
  },
  orderMetaText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 17,
  },
  orderFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  statusPillDone: { backgroundColor: GREEN_LIGHT },
  statusPillPending: { backgroundColor: "#FFFBEB" },
  statusPillCancelled: { backgroundColor: "#FEF2F2" },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
  },
  statusPillText: { fontSize: 12, fontWeight: "700", color: MUTED },
  statusPillTextDone: { color: GREEN },
  statusPillTextPending: { color: "#B45309" },
  statusPillTextCancelled: { color: "#DC2626" },
  viewDetailsRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewDetailsText: { fontSize: 13, fontWeight: "600", color: MUTED },

  empty: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: INK },
  emptySub: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
});
