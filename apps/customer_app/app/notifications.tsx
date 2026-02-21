/**
 * Notifications – list of app notifications with read/unread, empty state.
 * GatiMitra styling: cards, emerald accents, compact layout.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";

const PAD = 20;
const CARD_RADIUS = 14;

type NotificationType = "order" | "offer" | "ride" | "general";

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  read: boolean;
};

const NOTIFICATION_ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  order: "receipt-outline",
  offer: "pricetag-outline",
  ride: "car-outline",
  general: "notifications-outline",
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    type: "offer",
    title: "20% off your next ride",
    body: "Use code GATI20 at checkout. Valid till this weekend.",
    time: "2h ago",
    read: false,
  },
  {
    id: "2",
    type: "order",
    title: "Order delivered",
    body: "Your order #12345 has been delivered. Thank you for choosing GatiMitra!",
    time: "Yesterday",
    read: false,
  },
  {
    id: "3",
    type: "ride",
    title: "Ride completed",
    body: "Your ride from MG Road to Airport has been completed. Rate your experience.",
    time: "2 days ago",
    read: true,
  },
  {
    id: "4",
    type: "general",
    title: "Welcome to GatiMitra",
    body: "Book rides, order food, send parcels and more. Explore the app.",
    time: "1 week ago",
    read: true,
  },
];

const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 2,
};

function NotificationCard({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: () => void;
}) {
  const iconName = NOTIFICATION_ICONS[item.type];
  return (
    <TouchableOpacity
      style={[styles.card, item.read ? styles.cardRead : styles.cardUnread, SHADOW]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {!item.read && <View style={styles.unreadDot} />}
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={24} color={GatiMitraColors.emerald} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardText} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.cardTime}>{item.time}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notifications] = useState<NotificationItem[]>(MOCK_NOTIFICATIONS);
  const hasNotifications = notifications.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {!hasNotifications ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={48} color={GatiMitraColors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>
              When you get orders, offers or updates, they'll show up here.
            </Text>
          </View>
        ) : (
          notifications.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onPress={() => {}}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.background,
    paddingHorizontal: PAD,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  headerRight: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 16,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    position: "relative",
  },
  cardRead: {
    opacity: 0.92,
  },
  cardUnread: {
    backgroundColor: "#d1fae540",
    borderColor: "#05966930",
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraColors.emerald,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    marginRight: 12,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 2,
  },
  cardText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 18,
  },
  cardTime: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 4,
  },
});
