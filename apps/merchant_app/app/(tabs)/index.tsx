/**
 * Partner Dashboard — date, 3 KPI cards (Today's earning, Delivered, Overall wallet),
 * All Orders with New/Active tabs, recent orders. Main area only; header/status card untouched.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  RefreshControl,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { AppText as Text } from "@/components/AppText";
import { useRouter, useFocusEffect } from "expo-router";
import { useMerchantNavigate } from "@/lib/merchantNavigation";
import { useProfileNav } from "@/context/ProfileNavContext";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  CARD_GAP,
  SECTION_GAP,
  FONT_PAGE_TITLE,
  FONT_LABEL,
  TAB_BAR_SCROLL_CONTENT_PADDING,
} from "@/constants/theme";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrders, type OrderRecord } from "@/hooks/useOrders";
import { LiveOrderCard } from "@/components/order/LiveOrderCard";
import { DashboardOrdersEmptyState } from "@/components/order/DashboardOrdersEmptyState";
import { RejectOrderSheet } from "@/components/order/RejectOrderSheet";
import { MerchantPrepDelaySheet } from "@/components/order/MerchantPrepDelaySheet";
import { RejectFollowUpHost, useRejectFollowUp } from "@/components/order/RejectFollowUpHost";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import { rejectReasonNeedsFollowUp } from "@/lib/merchantCancellationReasons";
import { fetchWalletSummary } from "@/services/walletApi";
import { StoreClosedActiveOrdersNotice } from "@/components/order/StoreClosedActiveOrdersNotice";
import { openOrderDetailOnce } from "@/lib/openOrderDetailOnce";
import { isActiveMerchantOrderStage } from "@/lib/merchantActiveOrders";
import { formatCurrency } from "@/lib/merchantPayoutUtils";
import { resolveWalletDisplayBalance } from "@gatimitra/merchant-payout";
import { subscribeMerchantDashboardStatsRefresh } from "@/lib/merchantDashboardStatsBus";
import { OrderNotificationsDisabledBanner } from "@/components/OrderNotificationsDisabledBanner";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";

const { width } = Dimensions.get("window");
const KPI_VIEWPORT = width - H_PADDING * 2;
/** Two full cards + half of the third visible — hints horizontal scroll. */
const KPI_CARD_WIDTH = (KPI_VIEWPORT - CARD_GAP * 2) / 2.5;
const KPI_ICON_SIZE = 24;
const KPI_ICON_GLYPH = 13;

const MAX_RECENT_ORDERS = 5;

type OrderFilterTab = "New" | "Active";

const DASHBOARD_ORDER_TABS: OrderFilterTab[] = ["New", "Active"];
const SWIPE_THRESHOLD = 48;
const SWIPE_VELOCITY = 450;

// GatiMitra brand only: white/surface cards + primary green or navy for accent
function KpiCard({
  title,
  value,
  icon,
  accent,
  onPress,
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: "primary" | "navy";
  onPress: () => void;
}) {
  const iconColor = accent === "primary" ? GatiMitraMerchant.primary : GatiMitraMerchant.navy;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.kpiCardWrap,
        { width: KPI_CARD_WIDTH },
        pressed && styles.cardPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <View style={styles.kpiTopRow}>
        <View style={[styles.kpiIconWrap, { backgroundColor: iconColor }]}>
          <Ionicons name={icon} size={KPI_ICON_GLYPH} color="#fff" />
        </View>
        <Text style={styles.kpiTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Text
        style={styles.kpiValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </Pressable>
  );
}

function formatTodayDate(): string {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Today ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format API date/time for banner. Handles ISO, timestamp number, "YYYY-MM-DD HH:mm:ss", and parses manually if needed. */
function formatScheduledOffDateAndTime(value: string | null | undefined): string {
  if (value == null || value === "") return "scheduled date";
  const str = typeof value === "number" ? String(value) : String(value).trim();
  if (!str) return "scheduled date";
  let d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    d = new Date(str.replace(" ", "T"));
  }
  if (Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(str) && !/[Z+-]\d{2}/.test(str)) {
    d = new Date(str.trim().replace(" ", "T") + "Z");
  }
  if (Number.isNaN(d.getTime()) && /^\d+$/.test(str)) {
    d = new Date(Number(str));
  }
  if (Number.isNaN(d.getTime())) {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, y, mo, day, h, mi, s] = match;
      d = new Date(Number(y), Number(mo) - 1, Number(day), Number(h), Number(mi), Number(s || 0), 0);
    }
  }
  if (Number.isNaN(d.getTime())) return "scheduled date";
  const day = d.getDate();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const year = d.getFullYear();
  const h = d.getHours();
  const m = d.getMinutes();
  const am = h < 12;
  const h12 = h % 12 || 12;
  const min = Number.isNaN(m) ? "00" : m < 10 ? `0${m}` : String(m);
  return `${day} ${month} ${year} till ${h12}:${min} ${am ? "AM" : "PM"}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { push: navPush, pathname } = useMerchantNavigate();
  const { setReturnRoute } = useProfileNav();
  const { token } = useAuth();
  const { selectedStore, managedStores } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { orders, refetch: refetchOrders, transitionOrder, extendPrepDelay, acceptanceWindowMinutes } = useOrders();
  const {
    isOnline,
    manualCloseUntil,
    restrictionType,
    scheduledClosure,
    upcomingScheduledClosure,
    unavailableReason,
    statusReason,
    refresh,
  } = useStoreStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [rejectTarget, setRejectTarget] = useState<OrderRecord | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [prepDelayOrder, setPrepDelayOrder] = useState<OrderRecord | null>(null);
  const [prepDelayLoading, setPrepDelayLoading] = useState(false);
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();

  const [orderTab, setOrderTab] = useState<OrderFilterTab>("New");
  const orderTabBootstrapped = useRef(false);
  const [todayEarning, setTodayEarning] = useState(0);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);

  const loadDashboardStats = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const wallet = await fetchWalletSummary(storeId, token);
      setTodayEarning(Number(wallet.today_earning) || 0);
      setDeliveredToday(Number(wallet.delivered_today ?? 0) || 0);
      setWalletBalance(resolveWalletDisplayBalance(wallet));
    } catch {
      setTodayEarning(0);
      setDeliveredToday(0);
    }
  }, [token, storeId]);

  useEffect(() => {
    void loadDashboardStats();
  }, [loadDashboardStats]);

  useEffect(() => {
    return subscribeMerchantDashboardStatsRefresh(() => {
      void loadDashboardStats();
    });
  }, [loadDashboardStats]);

  useFocusEffect(
    useCallback(() => {
      setNowMs(Date.now());
      const id = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(id);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void loadDashboardStats();
    }, [refresh, loadDashboardStats])
  );

  // Show the yellow banner ONLY when store is closed AND closure is manual/scheduled
  // (temp close, closed for today, schedule off, permanent shut). Never show when store is online;
  // hide instantly when store goes online. Do not show for auto/schedule-only closure (outside hours).
  const unavail = unavailableReason != null ? String(unavailableReason).trim().toLowerCase() : "";
  const status = statusReason != null ? String(statusReason).trim().toLowerCase() : "";
  const restriction = restrictionType != null ? String(restrictionType).trim().toLowerCase() : "";
  const hasManualOrScheduledClosure =
    scheduledClosure != null ||
    restrictionType === "PERMANENT_SHUT" ||
    (manualCloseUntil != null &&
      manualCloseUntil !== "" &&
      new Date(manualCloseUntil).getTime() > Date.now()) ||
    unavail === "manual_close" ||
    unavail === "manual_indefinite" ||
    status === "manual_close" ||
    status === "manual_indefinite" ||
    restriction === "manual" ||
    restriction === "manual_hold";
  const showClosedBanner = !isOnline && hasManualOrScheduledClosure;

  const hasActiveOrders = useMemo(
    () => orders.some((o) => isActiveMerchantOrderStage(o.status)),
    [orders]
  );

  const orderTabCounts = useMemo(
    () => ({
      new: orders.filter((o) => o.status === "created").length,
      active: orders.filter(
        (o) =>
          o.status === "preparing" ||
          o.status === "ready" ||
          o.status === "picked_up"
      ).length,
    }),
    [orders]
  );

  useEffect(() => {
    if (orderTabBootstrapped.current) return;
    if (orderTabCounts.new > 0) {
      orderTabBootstrapped.current = true;
      setOrderTab("New");
      return;
    }
    if (orderTabCounts.active > 0) {
      orderTabBootstrapped.current = true;
      setOrderTab("Active");
    }
  }, [orderTabCounts.new, orderTabCounts.active]);

  const recentOrders = useMemo(() => {
    let list = orders;
    if (orderTab === "New") {
      // Delayed / oldest first — longest-waiting CREATED orders at the top.
      list = list
        .filter((o) => o.status === "created")
        .slice()
        .sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
    } else {
      list = list.filter(
        (o) =>
          o.status === "preparing" ||
          o.status === "ready" ||
          o.status === "picked_up"
      );
    }
    return list.slice(0, MAX_RECENT_ORDERS);
  }, [orderTab, orders]);

  const shiftOrderTabBySwipe = useCallback(
    (direction: "next" | "previous") => {
      const idx = DASHBOARD_ORDER_TABS.indexOf(orderTab);
      const nextIdx = direction === "next" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= DASHBOARD_ORDER_TABS.length) return;
      setOrderTab(DASHBOARD_ORDER_TABS[nextIdx]!);
    },
    [orderTab]
  );

  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);

  const tabSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          "worklet";
          const touch = e.changedTouches[0];
          if (!touch) return;
          touchStartX.value = touch.absoluteX;
          touchStartY.value = touch.absoluteY;
        })
        .onTouchesMove((e, state) => {
          "worklet";
          const touch = e.changedTouches[0];
          if (!touch) return;
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
        .onEnd((e) => {
          "worklet";
          const commitNext =
            e.translationX <= -SWIPE_THRESHOLD || e.velocityX <= -SWIPE_VELOCITY;
          const commitPrev =
            e.translationX >= SWIPE_THRESHOLD || e.velocityX >= SWIPE_VELOCITY;
          if (commitNext) {
            runOnJS(shiftOrderTabBySwipe)("next");
          } else if (commitPrev) {
            runOnJS(shiftOrderTabBySwipe)("previous");
          }
        }),
    [shiftOrderTabBySwipe, touchStartX, touchStartY]
  );

  const handleAccept = useCallback(
    (order: OrderRecord) => {
      if (order.status === "created") {
        transitionOrder(order.id, "preparing");
      }
    },
    [transitionOrder]
  );

  const handleReject = useCallback((order: OrderRecord) => {
    if (order.status === "created") setRejectTarget(order);
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
        /* useOrders surfaces error */
      } finally {
        setRejectLoading(false);
      }
    },
    [rejectTarget, transitionOrder, beginFollowUp]
  );

  const handleAdvance = useCallback(
    (order: OrderRecord) => {
      const pipeline = (order.pipelineStatus ?? "").toUpperCase();
      // Preparing card also shows for ACCEPTED — always mark ready from kitchen stage.
      if (
        order.status === "preparing" ||
        pipeline === "ACCEPTED" ||
        pipeline === "PREPARING"
      ) {
        void transitionOrder(order.id, "ready").catch(() => {
          /* error surfaced via OrdersContext */
        });
        return;
      }
      if (order.status === "ready" || pipeline === "READY_FOR_PICKUP") {
        void transitionOrder(order.id, "picked_up").catch(() => {});
        return;
      }
      if (order.status === "picked_up" || pipeline === "OUT_FOR_DELIVERY") {
        void transitionOrder(order.id, "delivered").catch(() => {});
      }
    },
    [transitionOrder]
  );

  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;
  const { notificationsGranted } = useNotificationPermissionGate();
  const showNotificationsDisabledBanner = !notificationsGranted;
  const ordersEmpty = recentOrders.length === 0;
  const ordersSectionFlex = ordersEmpty;

  const REFRESH_TIMEOUT_MS = 15000;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const timeoutId = setTimeout(() => {
      setRefreshing(false);
    }, REFRESH_TIMEOUT_MS);
    try {
      await Promise.all([refresh(), refetchOrders(), loadDashboardStats()]);
    } catch {
      // Keep spinner stop on error; finally will clear it
    } finally {
      clearTimeout(timeoutId);
      setRefreshing(false);
    }
  }, [refresh, refetchOrders, loadDashboardStats]);

  return (
    <View style={styles.screenWrap}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: scrollBottomPadding, flexGrow: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[GatiMitraMerchant.primary]}
            tintColor={GatiMitraMerchant.primary}
          />
        }
      >
      <OrderNotificationsDisabledBanner visible={showNotificationsDisabledBanner} />
      {showClosedBanner && (
        <Pressable
          style={styles.scheduledOffBanner}
          onPress={() => navPush("/(tabs)/profile/vacation")}
        >
          <Ionicons name="calendar-outline" size={20} color={GatiMitraMerchant.warning} />
          <Text style={styles.scheduledOffText}>
            {restrictionType === "PERMANENT_SHUT"
              ? "Store is permanently closed."
              : scheduledClosure
                ? `Store is closed from ${formatScheduledOffDateAndTime(scheduledClosure.from)} to ${formatScheduledOffDateAndTime(scheduledClosure.to)}.\nReason: ${scheduledClosure.reason}`
                : manualCloseUntil
                  ? `Store closed until ${formatScheduledOffDateAndTime(manualCloseUntil)}`
                  : unavail === "manual_indefinite" || status === "manual_indefinite"
                    ? "Store is closed until you turn it back ON from Store status."
                    : "Store is scheduled off."}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textSecondary} />
        </Pressable>
      )}
      <StoreClosedActiveOrdersNotice visible={!isOnline && hasActiveOrders} />
      <Text style={styles.dateText}>{formatTodayDate()}</Text>

      <View style={styles.section}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiScrollContent}
          decelerationRate="fast"
          snapToInterval={KPI_CARD_WIDTH + CARD_GAP}
          snapToAlignment="start"
          disableIntervalMomentum
        >
          <KpiCard
            title="Today's earning"
            value={formatCurrency(todayEarning)}
            icon="cash-outline"
            accent="primary"
            onPress={() => navPush("/(tabs)/earnings")}
          />
          <KpiCard
            title="Delivered"
            value={String(deliveredToday).padStart(2, "0")}
            icon="cube-outline"
            accent="navy"
            onPress={() => navPush("/(tabs)/orders")}
          />
          <KpiCard
            title="Wallet balance"
            value={formatCurrency(walletBalance)}
            icon="wallet-outline"
            accent="navy"
            onPress={() => navPush("/(tabs)/earnings")}
          />
        </ScrollView>
      </View>

      <View style={[styles.section, ordersSectionFlex && styles.ordersSectionFlex]}>
        <Text style={styles.sectionTitle}>All Orders</Text>
        <GestureDetector gesture={tabSwipeGesture}>
          <View style={ordersSectionFlex ? styles.ordersSwipeArea : undefined}>
            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setOrderTab("New")}
                style={[styles.tab, orderTab === "New" && styles.tabActive]}
              >
                <View style={styles.tabInner}>
                  <Text style={[styles.tabText, orderTab === "New" && styles.tabTextActive]} numberOfLines={1}>
                    New
                  </Text>
                  <Text style={[styles.tabCountInline, orderTab === "New" && styles.tabTextActive]} numberOfLines={1}>
                    {orderTabCounts.new > 99 ? "99+" : orderTabCounts.new}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setOrderTab("Active")}
                style={[styles.tab, orderTab === "Active" && styles.tabActive]}
              >
                <View style={styles.tabInner}>
                  <Text style={[styles.tabText, orderTab === "Active" && styles.tabTextActive]} numberOfLines={1}>
                    Active
                  </Text>
                  <Text style={[styles.tabCountInline, orderTab === "Active" && styles.tabTextActive]} numberOfLines={1}>
                    {orderTabCounts.active > 99 ? "99+" : orderTabCounts.active}
                  </Text>
                </View>
              </Pressable>
            </View>
            <View style={[styles.orderList, ordersSectionFlex && styles.orderListEmptyActive]}>
              {recentOrders.length === 0 ? (
                <DashboardOrdersEmptyState tab={orderTab} fillAvailable={ordersSectionFlex} />
              ) : (
                recentOrders.map((order) => (
                  <LiveOrderCard
                    key={order.id}
                    order={order}
                    nowMs={nowMs}
                    acceptanceWindowMinutes={acceptanceWindowMinutes}
                    storeName={
                      order.merchantStoreName?.trim() ||
                      (order.merchantStoreId != null
                        ? managedStores.find((s) => s.id === order.merchantStoreId)?.store_name
                        : null) ||
                      selectedStore?.store_name
                    }
                    onAccept={() => handleAccept(order)}
                    onReject={() => handleReject(order)}
                    onAdvance={() => handleAdvance(order)}
                    onNeedMoreTime={() => setPrepDelayOrder(order)}
                    onViewDetail={() =>
                      openOrderDetailOnce(router, order.id, {
                        fromPath: pathname,
                        currentPath: pathname,
                        setReturnRoute,
                      })
                    }
                  />
                ))
              )}
            </View>
          </View>
        </GestureDetector>
      </View>
    </ScrollView>
      <RejectOrderSheet
        visible={!!rejectTarget}
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
        onSelectMinutes={async (mins) => {
          if (!prepDelayOrder) return;
          setPrepDelayLoading(true);
          try {
            await extendPrepDelay(prepDelayOrder.id, mins);
            setPrepDelayOrder(null);
          } finally {
            setPrepDelayLoading(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  content: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  scheduledOffBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  scheduledOffText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
  },
  dateText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 16,
  },
  section: { marginBottom: SECTION_GAP },
  sectionTitle: {
    fontSize: FONT_PAGE_TITLE,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  kpiScrollContent: {
    paddingRight: H_PADDING,
    gap: CARD_GAP,
  },
  kpiCardWrap: {
    minHeight: 96,
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
  },
  kpiTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  kpiIconWrap: {
    width: KPI_ICON_SIZE,
    height: KPI_ICON_SIZE,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    lineHeight: 13,
  },
  /** Align with icon left edge — do not stretch to the card’s right border. */
  kpiValue: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    alignSelf: "flex-start",
    textAlign: "left",
    maxWidth: "100%",
    paddingRight: 8,
    fontVariant: ["tabular-nums"],
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    overflow: "visible",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 11.5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  tabInner: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabActive: {
    backgroundColor: GatiMitraMerchant.navy,
    borderColor: GatiMitraMerchant.navy,
    borderRadius: 8,
    ...GatiMitraMerchant.shadowSm,
  },
  tabText: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    flexShrink: 0,
  },
  tabTextActive: {
    color: "#fff",
  },
  tabCountInline: {
    fontSize: FONT_LABEL,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    flexShrink: 0,
  },
  tabCountBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#64748B",
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  tabCountTextActive: {
    color: "#FFFFFF",
  },
  ordersSectionFlex: { flex: 1 },
  ordersSwipeArea: { flex: 1 },
  orderList: { gap: 12 },
  orderListEmptyActive: { flex: 1, justifyContent: "center" },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
});
