/**
 * Reusable React Native inbox screen used by customer / merchant / rider apps.
 *
 * Displays paged notifications with:
 *   • Read / unread state
 *   • Deep-link tap → marks click server-side + calls navigateFn (app-supplied)
 *   • Pull-to-refresh
 *   • Header "Mark all as read" + "Clear all"
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
  /**
   * When set, called instead of navigating immediately after mark-clicked.
   * Use for in-app detail sheets. Still marks the row as clicked remotely.
   */
  onItemPress?: (item: InboxItem) => void;
  /** Optional accent color for the unread dot + action text. */
  accentColor?: string;
  /** Optional empty-state copy. */
  emptyText?: string;
  /**
   * Optional dismiss persistence (device-local). When provided, Clear all /
   * future dismisses hide rows across reloads. Inbox rows are audit logs and
   * cannot be deleted server-side for end users.
   */
  getDismissedIds?: () => Promise<Set<string>>;
  persistDismissedIds?: (ids: string[]) => Promise<void>;
  /** Filter API rows before display (e.g. hide dispatch offers). */
  filterItems?: (items: InboxItem[]) => InboxItem[];
  /** Fires whenever visible unread / count changes (for app chrome badges). */
  onInboxStats?: (stats: { unread: number; total: number }) => void;
  /** After Clear all completes (local + remote). */
  onCleared?: () => void;
};

const DEFAULT_ACCENT = "#0d9488";

function isUnread(item: InboxItem): boolean {
  // Align with backend unread: clicked_at IS NULL.
  return !item.clicked_at;
}

/** Safe relative + absolute time. Invalid ISO must never produce "NaNd". */
export function formatInboxTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso || typeof iso !== "string") return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";

  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const datePart = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function itemTimestamp(item: InboxItem): string {
  return item.queued_at || item.delivered_at || item.clicked_at || "";
}

export function InboxScreen({
  apiConfig,
  onOpenDeepLink,
  onItemPress,
  accentColor = DEFAULT_ACCENT,
  emptyText = "No notifications yet.",
  getDismissedIds,
  persistDismissedIds,
  filterItems,
  onInboxStats,
  onCleared,
}: InboxScreenProps) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const publishStats = useCallback(
    (list: InboxItem[]) => {
      const nextUnread = list.filter(isUnread).length;
      setUnread(nextUnread);
      onInboxStats?.({ unread: nextUnread, total: list.length });
    },
    [onInboxStats]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [page, dismissedIds] = await Promise.all([
        loadInbox(apiConfig, { limit: 100 }),
        getDismissedIds ? getDismissedIds() : Promise.resolve(new Set<string>()),
      ]);
      setDismissed(dismissedIds);
      const filtered = filterItems ? filterItems(page.items) : page.items;
      const visible = filtered.filter((i) => !dismissedIds.has(i.notification_id));
      setItems(visible);
      publishStats(visible);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [apiConfig, getDismissedIds, filterItems, publishStats]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTap = async (item: InboxItem) => {
    const wasUnread = isUnread(item);
    const marked: InboxItem = {
      ...item,
      clicked_at: new Date().toISOString(),
      status: "clicked",
    };
    setItems((prev) => {
      const next = prev.map((p) =>
        p.notification_id === item.notification_id ? marked : p
      );
      publishStats(next);
      return next;
    });
    if (wasUnread) setUnread((n) => Math.max(0, n - 1));
    try {
      await markClickedRemote(apiConfig, item.notification_id);
    } catch {
      /* tolerated */
    }
    if (onItemPress) {
      onItemPress(marked);
      return;
    }
    const link = (item.deep_link ?? "").trim();
    if (onOpenDeepLink) {
      onOpenDeepLink(link, marked);
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => {
      const next = prev.map((p) =>
        isUnread(p)
          ? {
              ...p,
              clicked_at: p.clicked_at ?? new Date().toISOString(),
              status: "clicked",
              delivered_at: p.delivered_at ?? new Date().toISOString(),
            }
          : p
      );
      publishStats(next);
      return next;
    });
    try {
      await markAllReadRemote(apiConfig);
    } catch {
      /* tolerated */
    }
  };

  const handleClearAll = async () => {
    const ids = items.map((i) => i.notification_id);
    setItems([]);
    publishStats([]);
    const next = new Set(dismissed);
    for (const id of ids) next.add(id);
    setDismissed(next);
    try {
      await markAllReadRemote(apiConfig);
    } catch {
      /* tolerated */
    }
    if (persistDismissedIds && ids.length > 0) {
      try {
        await persistDismissedIds(ids);
      } catch {
        /* tolerated */
      }
    }
    onCleared?.();
  };

  const renderItem = ({ item }: ListRenderItemInfo<InboxItem>) => {
    const unreadRow = isUnread(item);
    const timeLabel = formatInboxTime(itemTimestamp(item));
    return (
      <TouchableOpacity
        onPress={() => void handleTap(item)}
        activeOpacity={0.7}
        style={[styles.card, unreadRow && { backgroundColor: "#f8fafc" }]}
      >
        <View style={styles.dotColumn}>
          {unreadRow ? <View style={[styles.dot, { backgroundColor: accentColor }]} /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.rowBetween, { maxWidth: "100%" }]}>
            <Text
              style={[styles.title, { flex: 1, minWidth: 0, marginRight: 8 }]}
              numberOfLines={1}
            >
              {item.title ?? "(untitled)"}
            </Text>
            {timeLabel ? (
              <Text style={[styles.time, { flexShrink: 0 }]} numberOfLines={1}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.body, { flexShrink: 1 }]} numberOfLines={3}>
            {item.body ?? ""}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heading}>Notifications</Text>
          {unread > 0 ? <Text style={styles.subheading}>{unread} unread</Text> : null}
        </View>
        <View style={styles.headerActions}>
          {unread > 0 ? (
            <TouchableOpacity onPress={() => void handleMarkAllRead()} hitSlop={8}>
              <Text style={[styles.actionText, { color: accentColor }]}>Mark all as read</Text>
            </TouchableOpacity>
          ) : null}
          {items.length > 0 ? (
            <TouchableOpacity onPress={() => void handleClearAll()} hitSlop={8}>
              <Text style={[styles.actionText, styles.clearAllText]}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(x) => x.notification_id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
        contentContainerStyle={
          items.length === 0 ? { flexGrow: 1, justifyContent: "center" } : undefined
        }
        onMomentumScrollEnd={() => {
          const unreadIds = items.filter(isUnread).slice(0, 20).map((i) => i.notification_id);
          if (unreadIds.length === 0) return;
          void Promise.all(
            unreadIds.map((id) => markReadRemote(apiConfig, id).catch(() => undefined))
          );
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
    gap: 12,
    maxWidth: "100%",
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  heading: { fontSize: 18, fontWeight: "700", color: "#0f172a", flexShrink: 1 },
  subheading: { fontSize: 12, color: "#64748b", marginTop: 2 },
  actionText: { fontSize: 13, fontWeight: "600", flexShrink: 0 },
  clearAllText: { color: "#64748b" },
  card: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f7",
    maxWidth: "100%",
  },
  dotColumn: { width: 12, alignItems: "center", paddingTop: 6, flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    maxWidth: "100%",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  time: { fontSize: 11, color: "#64748b", flexShrink: 0, maxWidth: 120, textAlign: "right" },
  body: { fontSize: 13, color: "#475569", marginTop: 2 },
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 14 },
  error: { textAlign: "center", color: "#dc2626", fontSize: 12, padding: 8 },
});
