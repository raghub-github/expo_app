/**
 * Partner Dashboard — KPI cards, recent orders (max 5). Swipe to remove; tap opens order detail.
 */

import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  CARD_GAP,
  CARD_PADDING,
  SECTION_GAP,
  FONT_PAGE_TITLE,
  FONT_LABEL,
  FONT_SECONDARY,
  TAB_BAR_HEIGHT,
  SCROLL_BOTTOM_SAFE,
} from "@/constants/theme";
import { SwipeableOrderCard } from "@/components/SwipeableOrderCard";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - H_PADDING * 2 - CARD_GAP) / 2;
const MAX_RECENT_ORDERS = 5;

const DUMMY_ORDERS: Array<{
  id: string;
  items: string;
  amount: string;
  status: "Preparing" | "Pending" | "Completed";
  time: string;
}> = [
  { id: "GM-2851", items: "2× Burger, 1× Fries", amount: "₹349", status: "Preparing", time: "5 min ago" },
  { id: "GM-2850", items: "1× Margherita Pizza", amount: "₹499", status: "Pending", time: "12 min ago" },
  { id: "GM-2849", items: "3× Biryani, 2× Raita", amount: "₹720", status: "Completed", time: "28 min ago" },
  { id: "GM-2848", items: "1× Cold Coffee, 2× Sandwich", amount: "₹385", status: "Completed", time: "1 hr ago" },
  { id: "GM-2847", items: "4× Samosa, 2× Chai", amount: "₹220", status: "Completed", time: "1 hr 15 min ago" },
];

function ClickableStatCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
  titleMuted,
  onPress,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient?: boolean;
  titleMuted?: boolean;
  onPress: () => void;
}) {
  const cardContent = (
    <>
      <View style={styles.statRow}>
        <View style={[styles.statIconWrap, gradient && styles.statIconWrapWhite, !gradient && styles.statIconWrapMuted]}>
          <Ionicons name={icon} size={16} color={gradient ? "#fff" : GatiMitraMerchant.primary} />
        </View>
        <Text style={[styles.statValue, gradient && styles.statValueWhite]} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={[styles.statTitle, gradient && styles.statTitleWhite, titleMuted && styles.statTitleWhiteMuted]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.statSubtitle, gradient && styles.statSubtitleWhite]}>{subtitle}</Text>
      ) : null}
    </>
  );

  if (gradient) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.statCardWrap,
          pressed && styles.cardPressed,
          GatiMitraMerchant.cursorPointer,
        ]}
      >
        <LinearGradient
          colors={[GatiMitraMerchant.primary, GatiMitraMerchant.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.statCard, styles.statCardGradient]}
        >
          {cardContent}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statCardWrap,
        styles.statCard,
        pressed && styles.cardPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      {cardContent}
    </Pressable>
  );
}

const TOAST_DURATION_MS = 2500;
const TOAST_MSG = "Removed. See Orders.";

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dismissedRecentIds, setDismissedRecentIds] = useState<Set<string>>(new Set());
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recentOrders = useMemo(() => {
    return DUMMY_ORDERS.filter((o) => !dismissedRecentIds.has(o.id)).slice(0, MAX_RECENT_ORDERS);
  }, [dismissedRecentIds]);

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

  const scrollBottomPadding = TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom;

  return (
    <View style={styles.screenWrap}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Two KPI cards — equal size */}
      <View style={styles.section}>
        <View style={styles.statRow}>
          <ClickableStatCard
            title="Today's orders"
            value="24"
            subtitle="Pending: 3"
            icon="receipt-outline"
            onPress={() => router.push("/(tabs)/orders")}
          />
          <ClickableStatCard
            title="Wallet balance"
            value="₹1,24,200"
            subtitle="Available"
            icon="wallet-outline"
            gradient
            titleMuted
            onPress={() => router.push("/(tabs)/earnings")}
          />
        </View>
      </View>

      {/* Recent orders — card list (mobile-friendly) */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent orders</Text>
          <Pressable
            onPress={() => router.push("/(tabs)/orders")}
            style={({ pressed }) => [pressed && { opacity: 0.8 }, GatiMitraMerchant.cursorPointer]}
          >
            <Text style={styles.linkText}>View all</Text>
          </Pressable>
        </View>
        <View style={styles.orderList}>
          {recentOrders.map((order) => (
            <SwipeableOrderCard
              key={order.id}
              id={order.id}
              items={order.items}
              amount={order.amount}
              status={order.status}
              time={order.time}
              onPress={() => router.push(`/order/${order.id}`)}
              onDismiss={() => handleDismissRecent(order.id)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
    {toastVisible && (
      <View style={[styles.toast, { bottom: (insets.bottom || 12) + 56 + 12 }]}>
        <Text style={styles.toastText}>{TOAST_MSG}</Text>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  content: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
  },
  section: { marginBottom: SECTION_GAP },
  sectionTitle: {
    fontSize: FONT_PAGE_TITLE,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  linkText: {
    fontSize: FONT_LABEL,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  statRow: { flexDirection: "row", gap: CARD_GAP },
  statCardWrap: {
    width: CARD_WIDTH,
    height: 96,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
  },
  statCard: {
    width: CARD_WIDTH,
    height: 96,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    justifyContent: "space-between",
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  statCardGradient: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    justifyContent: "space-between",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  statIconWrapWhite: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewBtnText: {
    fontSize: FONT_SECONDARY,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  viewBtnTextWhite: { color: "#fff" },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.2,
    flex: 1,
  },
  statValueWhite: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.2,
  },
  statTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statTitleMuted: {
    color: GatiMitraMerchant.textTertiary,
  },
  statTitleWhite: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statTitleWhiteMuted: {
    color: "rgba(255,255,255,0.75)",
  },
  statIconWrapMuted: {
    opacity: 0.75,
  },
  statSubtitle: {
    fontSize: 11,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
    marginTop: 1,
  },
  statSubtitleWhite: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.8)",
    marginTop: 1,
  },
  orderList: {},
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
