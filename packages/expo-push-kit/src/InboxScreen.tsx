/**
 * Reusable React Native inbox screen used by customer / merchant / rider apps.
 *
 * Displays paged notifications with:
 *   • Read / unread state (unread = clicked_at IS NULL AND status != 'clicked')
 *   • Deep-link tap → marks click server-side + calls navigateFn (app-supplied)
 *   • Pull-to-refresh
 *   • Header "Mark all as read"
 *
 * Colors + spacing are neutral (Tailwind-ish inline styles) so each app can
 * re-skin via the wrapper. No external UI dep.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  loadInbox,
  markAllReadRemote,
  markClickedRemote,
  markReadRemote,
  type InboxItem,
  type NotificationApiConfig,
} from "./inbox";

export type InboxScreenProps = {
  apiConfig: NotificationApiConfig;
  /** Called with the deep_link string when a card is tapped. */
  onOpenDeepLink?: (deepLink: string, item: InboxItem) => void;
  /** Optional accent color for the unread dot + "Mark all read" text. */
  accentColor?: string;
  /** Optional empty-state copy. */
  emptyText?: string;
};

const DEFAULT_ACCENT = "#0d9488"; // teal-600

function isUnread(item: InboxItem): boolean {
  if (item.clicked_at) return false;
  return item.status === "queued" || item.status === "sent";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

export function InboxScreen({
  apiConfig,
  onOpenDeepLink,
  accentColor = DEFAULT_ACCENT,
  emptyText = "No notifications yet.",
}: InboxScreenProps) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await loadInbox(apiConfig, { limit: 100 });
      setItems(page.items);
      setUnread(page.unread);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiConfig]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTap = async (item: InboxItem) => {
    // Optimistic
    setItems((prev) =>
      prev.map((p) => (p.notification_id === item.notification_id ? { ...p, clicked_at: new Date().toISOString(), status: "clicked" } : p)),
    );
    setUnread((n) => Math.max(0, n - (isUnread(item) ? 1 : 0)));
    try {
      await markClickedRemote(apiConfig, item.notification_id);
    } catch {/* tolerated */}
    if (item.deep_link && onOpenDeepLink) onOpenDeepLink(item.deep_link, item);
  };

  const handleMarkAllRead = async () => {
    setUnread(0);
    setItems((prev) => prev.map((p) => (isUnread(p) ? { ...p, status: "delivered", delivered_at: new Date().toISOString() } : p)));
    try { await markAllReadRemote(apiConfig); } catch {/* tolerated */}
  };

  const renderItem = ({ item }: ListRenderItemInfo<InboxItem>) => {
    const unread = isUnread(item);
    return (
      <TouchableOpacity
        onPress={() => handleTap(item)}
        activeOpacity={0.7}
        style={[styles.card, unread && { backgroundColor: "#f8fafc" }]}
      >
        <View style={styles.dotColumn}>
          {unread ? <View style={[styles.dot, { backgroundColor: accentColor }]} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowBetween}>
            <Text style={styles.title} numberOfLines={1}>{item.title ?? "(untitled)"}</Text>
            <Text style={styles.time}>{relativeTime(item.queued_at)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={3}>{item.body ?? ""}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Notifications</Text>
          {unread > 0 ? <Text style={styles.subheading}>{unread} unread</Text> : null}
        </View>
        {unread > 0 ? (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={[styles.actionText, { color: accentColor }]}>Mark all as read</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(x) => x.notification_id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
        contentContainerStyle={items.length === 0 ? { flexGrow: 1, justifyContent: "center" } : undefined}
        onMomentumScrollEnd={() => {
          // Fire-and-forget "mark read" for visible unread items so the dot
          // clears even if the user didn't tap. Runs after the scroll settles
          // to avoid competing with the tap gesture.
          const unreadIds = items.filter(isUnread).slice(0, 20).map((i) => i.notification_id);
          if (unreadIds.length === 0) return;
          void Promise.all(unreadIds.map((id) => markReadRemote(apiConfig, id).catch(() => undefined)));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  heading: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  subheading: { fontSize: 12, color: "#64748b", marginTop: 2 },
  actionText: { fontSize: 13, fontWeight: "600" },
  card: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f7",
  },
  dotColumn: { width: 12, alignItems: "center", paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 14, fontWeight: "600", color: "#0f172a", flex: 1, marginRight: 8 },
  time: { fontSize: 11, color: "#64748b" },
  body: { fontSize: 13, color: "#475569", marginTop: 2 },
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 14 },
  error: { textAlign: "center", color: "#dc2626", fontSize: 12, padding: 8 },
});
