/**
 * Notifications — grouped inbox with filters, read/unread, empty state.
 */

import { useCallback, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BrandingFooter } from "@/components/BrandingFooter";
import { HEADER_PADDING_TOP } from "@/constants/layout";

const PAD = 16;

type NotificationType = "order" | "offer" | "ride" | "general";
type FilterId = "all" | NotificationType;
type TimeGroup = "today" | "yesterday" | "earlier";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  timeGroup: TimeGroup;
  read: boolean;
};

const FILTER_TABS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "offer", label: "Offers" },
  { id: "order", label: "Orders" },
  { id: "ride", label: "Rides" },
];

const GROUP_LABELS: Record<TimeGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

const TYPE_META: Record<
  NotificationType,
  { icon: keyof typeof Ionicons.glyphMap; bg: string; color: string }
> = {
  offer: { icon: "pricetag", bg: "#FEF3C7", color: "#D97706" },
  order: { icon: "bag-handle", bg: "#DCFCE7", color: "#16A34A" },
  ride: { icon: "car", bg: "#DBEAFE", color: "#2563EB" },
  general: { icon: "sparkles", bg: "#F3E8FF", color: "#7C3AED" },
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    type: "offer",
    title: "20% off your next ride",
    body: "Use code GATI20 at checkout. Valid till this weekend.",
    time: "2h ago",
    timeGroup: "today",
    read: false,
  },
  {
    id: "2",
    type: "order",
    title: "Order delivered",
    body: "Your order #12345 has been delivered. Thank you for choosing GatiMitra!",
    time: "Yesterday",
    timeGroup: "yesterday",
    read: false,
  },
  {
    id: "3",
    type: "ride",
    title: "Ride completed",
    body: "Your ride from MG Road to Airport has been completed. Rate your experience.",
    time: "2 days ago",
    timeGroup: "earlier",
    read: true,
  },
  {
    id: "4",
    type: "general",
    title: "Welcome to GatiMitra",
    body: "Book rides, order food, send parcels and more. Explore the app.",
    time: "1 week ago",
    timeGroup: "earlier",
    read: true,
  },
];

const GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "earlier"];

function NotificationCard({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: () => void;
}) {
  const meta = TYPE_META[item.type];

  return (
    <TouchableOpacity
      style={[styles.card, !item.read && styles.cardUnread]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardRow}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={20} color={meta.color} />
          {!item.read ? <View style={styles.unreadDot} /> : null}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <AppText
              style={[styles.cardTitle, !item.read && styles.cardTitleUnread]}
              numberOfLines={1}
            >
              {item.title}
            </AppText>
            <AppText style={styles.cardTime}>{item.time}</AppText>
          </View>
          <AppText style={styles.cardText} numberOfLines={2}>
            {item.body}
          </AppText>
        </View>

        <Ionicons name="chevron-forward" size={16} color="#C4C9D4" style={styles.chevron} />
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<NotificationItem[]>(MOCK_NOTIFICATIONS);
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "all") return notifications;
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const groupedSections = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group],
      items: filteredNotifications.filter((n) => n.timeGroup === group),
    })).filter((section) => section.items.length > 0);
  }, [filteredNotifications]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const hasNotifications = notifications.length > 0;
  const hasFilteredResults = groupedSections.length > 0;

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.container}>
        <StatusBar style="dark" />

        <LinearGradient
          colors={["#FFFFFF", "#F4FBF6", "#FFFFFF"]}
          locations={[0, 0.55, 1]}
          style={[styles.headerBlock, { paddingTop: HEADER_PADDING_TOP }]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color={GatiMitraColors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <AppText style={styles.headerTitle}>Notifications</AppText>
              {unreadCount > 0 ? (
                <AppText style={styles.headerSub}>
                  {unreadCount} unread {unreadCount === 1 ? "update" : "updates"}
                </AppText>
              ) : (
                <AppText style={styles.headerSub}>You're all caught up</AppText>
              )}
            </View>

            {unreadCount > 0 ? (
              <TouchableOpacity
                style={styles.markAllBtn}
                onPress={markAllRead}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done-outline" size={16} color={GatiMitraColors.deepMintStart} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerSpacer} />
            )}
          </View>

          {hasNotifications ? (
            <View style={styles.filterRow}>
              {FILTER_TABS.map((tab) => {
                const active = activeFilter === tab.id;
                const count =
                  tab.id === "all"
                    ? notifications.length
                    : notifications.filter((n) => n.type === tab.id).length;
                if (tab.id !== "all" && count === 0) return null;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setActiveFilter(tab.id)}
                    activeOpacity={0.85}
                  >
                    <AppText style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {tab.label}
                    </AppText>
                    {count > 0 ? (
                      <View style={[styles.filterCount, active && styles.filterCountActive]}>
                        <AppText style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                          {count}
                        </AppText>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
            !hasNotifications && styles.scrollContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {!hasNotifications ? (
            <View style={styles.emptyWrap}>
              <LinearGradient
                colors={["#ECFDF5", "#FFFFFF"]}
                style={styles.emptyIconWrap}
              >
                <Ionicons name="notifications-off-outline" size={40} color={GatiMitraColors.deepMintStart} />
              </LinearGradient>
              <AppText style={styles.emptyTitle}>No notifications yet</AppText>
              <AppText style={styles.emptySub}>
                Orders, ride updates, offers and account alerts will appear here when you have
                activity on GatiMitra.
              </AppText>
            </View>
          ) : !hasFilteredResults ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="filter-outline" size={36} color={GatiMitraColors.textSecondary} />
              </View>
              <AppText style={styles.emptyTitle}>Nothing in this filter</AppText>
              <AppText style={styles.emptySub}>Try another category or check back later.</AppText>
            </View>
          ) : (
            groupedSections.map((section) => (
              <View key={section.group} style={styles.section}>
                <AppText style={styles.sectionLabel}>{section.label}</AppText>
                <View style={styles.sectionCards}>
                  {section.items.map((item) => (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      onPress={() => markRead(item.id)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}

          {hasNotifications ? <BrandingFooter compact /> : null}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: GatiMitraColors.softBackground,
  },
  headerBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.04)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.15)",
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
  },
  markAllBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerSpacer: {
    width: 36,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
  filterChipActive: {
    backgroundColor: GatiMitraColors.deepMintStart,
    borderColor: GatiMitraColors.deepMintStart,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  filterCountActive: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
  },
  filterCountTextActive: {
    color: "#FFFFFF",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 16,
  },
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
    marginLeft: 2,
  },
  sectionCards: {
    width: "100%",
  },
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
  },
  cardUnread: {
    borderColor: "rgba(22, 163, 74, 0.14)",
    backgroundColor: "#FAFFFC",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  unreadDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: GatiMitraColors.deepMintStart,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
    position: "relative",
  },
  cardBody: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    flexShrink: 0,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    letterSpacing: -0.2,
  },
  cardTitleUnread: {
    fontWeight: "800",
  },
  cardText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 19,
  },
  chevron: {
    flexShrink: 0,
    marginLeft: 2,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 28,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.12)",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  emptySub: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
  },
});
