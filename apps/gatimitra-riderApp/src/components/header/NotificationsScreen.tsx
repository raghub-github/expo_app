import React, { useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { NotificationListItem } from "@/src/components/header/NotificationListItem";
import { useNotificationInboxStore } from "@/src/stores/notificationInboxStore";
import { colors } from "@/src/theme";

const PAGE_BG = "#F4F6F8";

function groupLabel(ts: number, now = Date.now()): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (ts >= startOfToday.getTime()) return "today";
  if (ts >= startOfYesterday.getTime()) return "yesterday";
  return "earlier";
}

export function NotificationsScreen() {
  const { t } = useTranslation();
  const items = useNotificationInboxStore((s) => s.items);
  const markRead = useNotificationInboxStore((s) => s.markRead);
  const markAllRead = useNotificationInboxStore((s) => s.markAllRead);
  const unreadCount = items.filter((n) => !n.read).length;
  const hasUnread = unreadCount > 0;
  const hasNotifications = items.length > 0;

  const sections = useMemo(() => {
    const buckets: Record<string, typeof items> = { today: [], yesterday: [], earlier: [] };
    for (const item of items) {
      buckets[groupLabel(item.createdAt)].push(item);
    }
    const order = ["today", "yesterday", "earlier"] as const;
    return order
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({
        key: k,
        label:
          k === "today"
            ? t("topbar.notificationsToday", "Today")
            : k === "yesterday"
              ? t("topbar.notificationsYesterday", "Yesterday")
              : t("topbar.notificationsEarlier", "Earlier"),
        items: buckets[k],
      }));
  }, [items, t]);

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("common.back", "Back")}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("topbar.notifications", "Notifications")}</Text>
        {hasUnread ? (
          <Pressable onPress={markAllRead} hitSlop={8} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>{t("topbar.markAllRead", "Mark all read")}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          !hasNotifications && styles.scrollContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.label}</Text>
            {section.items.map((item) => (
              <NotificationListItem
                key={item.id}
                item={item}
                onPress={() => markRead(item.id)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  backBtnPressed: {
    backgroundColor: "#F8FAFC",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSpacer: {
    width: 40,
  },
  markAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary[700],
  },
  scroll: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
    marginLeft: 2,
  },
});
