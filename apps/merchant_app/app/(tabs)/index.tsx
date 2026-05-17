/**
 * Partner Dashboard — date, 4 KPI cards (Today's earning, Delivered, Pending, Overall wallet),
 * All Orders with New/Active tabs, recent orders. Main area only; header/status card untouched.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
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
import { SwipeableOrderCard } from "@/components/SwipeableOrderCard";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrders, type OrderStage } from "@/hooks/useOrders";
import { fetchGrowthSummary } from "@/services/growthApi";
import { fetchWalletSummary } from "@/services/walletApi";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - H_PADDING * 2 - CARD_GAP) / 2;
const MAX_RECENT_ORDERS = 5;

type OrderFilterTab = "New" | "Active";

function formatCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function cardStatusForStage(stage: OrderStage): "Preparing" | "Pending" | "Completed" {
  if (stage === "created") return "Pending";
  if (stage === "delivered" || stage === "rejected" || stage === "rto") return "Completed";
  return "Preparing";
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
        pressed && styles.cardPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <View style={styles.kpiCardInner}>
        <View style={[styles.kpiIconWrap, { backgroundColor: iconColor }]}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={styles.kpiTitle}>{title}</Text>
    </Pressable>
  );
}

const TOAST_DURATION_MS = 2500;
const TOAST_MSG = "Removed. See Orders.";

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
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { orders, refetch: refetchOrders } = useOrders(12000);
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
  const [dismissedRecentIds, setDismissedRecentIds] = useState<Set<string>>(new Set());
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const [orderTab, setOrderTab] = useState<OrderFilterTab>("New");
  const [todayEarning, setTodayEarning] = useState(0);
  const [deliveredToday, setDeliveredToday] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);

  const loadDashboardStats = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const [growth, wallet, active] = await Promise.all([
        fetchGrowthSummary(storeId, token, "today"),
        fetchWalletSummary(storeId, token),
        getActiveOrdersCount(storeId, token),
      ]);
      setTodayEarning(Number(growth.total_sales) || 0);
      setDeliveredToday(Number(growth.total_orders) || 0);
      setWalletBalance(Number(wallet.available_balance ?? 0) || 0);
      setPendingCount(Number(active) || 0);
    } catch {
      /* keep previous values */
    }
  }, [token, storeId]);

  useEffect(() => {
    void loadDashboardStats();
  }, [loadDashboardStats]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
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

  const recentOrders = useMemo(() => {
    let list = orders
      .filter((o) => !dismissedRecentIds.has(o.id))
      .map((o) => ({
        id: o.id,
        displayId: `#${o.formattedOrderId ?? o.orderNumber}`,
        items: o.lineItems.map((li) => `${li.qty}× ${li.name}`).join(", ") || "Order items",
        amount: formatCurrency(o.total),
        status: cardStatusForStage(o.status),
        time: relativeTime(o.createdAt),
        stage: o.status,
      }));
    if (orderTab === "New") {
      list = list.filter((o) => o.stage === "created");
    } else {
      list = list.filter((o) => o.stage === "preparing" || o.stage === "ready" || o.stage === "picked_up");
    }
    return list.slice(0, MAX_RECENT_ORDERS);
  }, [dismissedRecentIds, orderTab, orders]);

  const handleDismissRecent = (id: string) => {
    setDismissedRecentIds((prev) => new Set(prev).add(id));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      toastTimer.current = null;
    }, TOAST_DURATION_MS);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;

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
          { paddingBottom: scrollBottomPadding },
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
      {showClosedBanner && (
        <Pressable
          style={styles.scheduledOffBanner}
          onPress={() => router.push("/(tabs)/profile/vacation")}
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
      <Text style={styles.dateText}>{formatTodayDate()}</Text>

      <View style={styles.section}>
        <View style={styles.kpiRow}>
          <KpiCard
            title="Today's earning"
            value={formatCurrency(todayEarning)}
            icon="cash-outline"
            accent="primary"
            onPress={() => router.push("/(tabs)/earnings")}
          />
          <KpiCard
            title="Delivered"
            value={String(deliveredToday).padStart(2, "0")}
            icon="cube-outline"
            accent="navy"
            onPress={() => router.push("/(tabs)/orders")}
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiCard
            title="Pending deliveries"
            value={String(pendingCount)}
            icon="time-outline"
            accent="primary"
            onPress={() => router.push("/(tabs)/orders")}
          />
          <KpiCard
            title="Overall wallet balance"
            value={formatCurrency(walletBalance)}
            icon="wallet-outline"
            accent="navy"
            onPress={() => router.push("/(tabs)/earnings")}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All Orders</Text>
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setOrderTab("New")}
            style={[styles.tab, orderTab === "New" && styles.tabActive]}
          >
            <Text style={[styles.tabText, orderTab === "New" && styles.tabTextActive]}>New</Text>
          </Pressable>
          <Pressable
            onPress={() => setOrderTab("Active")}
            style={[styles.tab, orderTab === "Active" && styles.tabActive]}
          >
            <Text style={[styles.tabText, orderTab === "Active" && styles.tabTextActive]}>Active</Text>
          </Pressable>
        </View>
        <View style={styles.orderList}>
          {recentOrders.length === 0 ? (
            <View style={styles.emptyOrders}>
              <Text style={styles.emptyOrdersText}>No {orderTab.toLowerCase()} orders right now.</Text>
            </View>
          ) : (
            recentOrders.map((order) => (
              <SwipeableOrderCard
                key={order.id}
                id={order.displayId}
                items={order.items}
                amount={order.amount}
                status={order.status}
                time={order.time}
                onPress={() => router.push(`/order/${order.id}`)}
                onDismiss={() => handleDismissRecent(order.id)}
              />
            ))
          )}
        </View>
      </View>
    </ScrollView>
    {toastVisible && (
      <View style={[styles.toast, { bottom: TAB_BAR_SCROLL_CONTENT_PADDING + 8 }]}>
        <Text style={styles.toastText}>{TOAST_MSG}</Text>
      </View>
    )}
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
  kpiRow: { flexDirection: "row", gap: CARD_GAP, marginBottom: CARD_GAP },
  kpiCardWrap: {
    width: CARD_WIDTH,
    minHeight: 100,
    borderRadius: CARD_RADIUS,
    padding: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  kpiCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
  },
  kpiTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: GatiMitraMerchant.navy,
    ...GatiMitraMerchant.shadowSm,
  },
  tabText: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  tabTextActive: {
    color: "#fff",
  },
  orderList: {},
  emptyOrders: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyOrdersText: {
    fontSize: FONT_LABEL,
    color: GatiMitraMerchant.textTertiary,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  toast: {
    position: "absolute",
    left: H_PADDING,
    right: H_PADDING,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: GatiMitraMerchant.textPrimary,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  toastText: {
    fontSize: FONT_LABEL,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});
