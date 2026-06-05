import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RiderNotificationItem, RiderNotificationType } from "@/src/stores/notificationInboxStore";
import { formatNotificationTime } from "@/src/lib/format-notification-time";
import { colors } from "@/src/theme";

const ICONS: Record<RiderNotificationType, keyof typeof Ionicons.glyphMap> = {
  order: "bicycle-outline",
  earnings: "wallet-outline",
  account: "shield-checkmark-outline",
  promo: "pricetag-outline",
  general: "notifications-outline",
};

const ICON_BG: Record<RiderNotificationType, string> = {
  order: "#CCFBF1",
  earnings: "#FEF3C7",
  account: "#DBEAFE",
  promo: "#FCE7F3",
  general: "#F0FDF4",
};

const ICON_COLOR: Record<RiderNotificationType, string> = {
  order: colors.primary[700],
  earnings: "#B45309",
  account: "#1D4ED8",
  promo: "#BE185D",
  general: colors.primary[600],
};

type Props = {
  item: RiderNotificationItem;
  onPress: () => void;
};

export function NotificationListItem({ item, onPress }: Props) {
  const iconName = ICONS[item.type];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        item.read ? styles.cardRead : styles.cardUnread,
        pressed && styles.cardPressed,
      ]}
    >
      {!item.read ? <View style={styles.unreadDot} /> : null}
      <View style={[styles.iconWrap, { backgroundColor: ICON_BG[item.type] }]}>
        <Ionicons name={iconName} size={22} color={ICON_COLOR[item.type]} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={styles.message} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.time}>{formatNotificationTime(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    position: "relative",
  },
  cardUnread: {
    backgroundColor: "#F0FDFA",
    borderColor: "#99F6E4",
  },
  cardRead: {
    opacity: 0.94,
  },
  cardPressed: {
    opacity: 0.88,
  },
  unreadDot: {
    position: "absolute",
    top: 16,
    left: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[500],
    zIndex: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    marginRight: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[800],
    marginBottom: 3,
  },
  titleUnread: {
    fontWeight: "800",
    color: colors.gray[900],
  },
  message: {
    fontSize: 13,
    color: colors.gray[600],
    lineHeight: 18,
  },
  time: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 6,
  },
});
