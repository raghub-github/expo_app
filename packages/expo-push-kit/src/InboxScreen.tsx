/**
 * Reusable React Native inbox screen used by customer / merchant / rider apps.
 *
 * Displays paged notifications with:
 *   • Card layout + unread state
 *   • Swipe left/right → Read / Clear actions
 *   • Deep-link tap → marks click server-side + calls navigateFn (app-supplied)
 *   • Pull-to-refresh
 *   • Header "Mark all as read" + "Clear all"
 *
 * Clear all prefers POST /v1/notifications/clear-all. If the server endpoint is
 * unavailable (migration pending / 404), falls back to mark-all-read + local
 * dismiss cache so the rider is never stuck with a false error.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  PanResponder,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
  type PanResponderGestureState,
} from "react-native";
import {
  clearAllRemote,
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
   * Optional local dismiss cache. Used as optimistic hide + offline mirror after
   * a successful server Clear All. Server cutoff is the source of truth.
   */
  getDismissedIds?: () => Promise<Set<string>>;
  persistDismissedIds?: (ids: string[]) => Promise<void>;
  /** Filter API rows before display (e.g. hide dispatch offers). */
  filterItems?: (items: InboxItem[]) => InboxItem[];
  /** Fires whenever visible unread / count changes (for app chrome badges). */
  onInboxStats?: (stats: { unread: number; total: number }) => void;
  /** After Clear all completes successfully (server and/or local fallback). */
  onCleared?: () => void;
};

const DEFAULT_ACCENT = "#0d9488";
const ACTION_WIDTH = 76;
const SWIPE_OPEN = ACTION_WIDTH + 8;
const SWIPE_THRESHOLD = 40;

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

function isClearAllUnavailable(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "");
  return (
    msg.includes("409") ||
    msg.includes("404") ||
    msg.includes("501") ||
    msg.includes("503") ||
    /migration_pending|clear-all/i.test(msg)
  );
}

type SwipeCardProps = {
  item: InboxItem;
  accentColor: string;
  disabled?: boolean;
  onPress: () => void;
  onMarkRead: () => void;
  onClear: () => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

function InboxSwipeCard({
  item,
  accentColor,
  disabled,
  onPress,
  onMarkRead,
  onClear,
  openId,
  setOpenId,
}: SwipeCardProps) {
  const unreadRow = isUnread(item);
  const timeLabel = formatInboxTime(itemTimestamp(item));
  const translateX = useRef(new Animated.Value(0)).current;
  const startX = useRef(0);
  const openedRef = useRef(0);

  const snapTo = useCallback(
    (to: number) => {
      openedRef.current = to;
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
      setOpenId(to === 0 ? null : item.notification_id);
    },
    [item.notification_id, setOpenId, translateX]
  );

  useEffect(() => {
    if (openId !== item.notification_id && openedRef.current !== 0) {
      openedRef.current = 0;
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }).start();
    }
  }, [openId, item.notification_id, translateX]);

  const release = useCallback(
    (gs: PanResponderGestureState) => {
      const { dx, dy, vx } = gs;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && Math.abs(vx) < 0.2) {
        if (openedRef.current !== 0) {
          snapTo(0);
        } else {
          onPress();
        }
        return;
      }

      const next = startX.current + dx;
      // Prefer the direction of the gesture; open Read (right) or Clear (left).
      if (next > SWIPE_THRESHOLD || (dx > 20 && vx > 0.35)) {
        if (unreadRow) snapTo(SWIPE_OPEN);
        else snapTo(-SWIPE_OPEN);
        return;
      }
      if (next < -SWIPE_THRESHOLD || (dx < -20 && vx < -0.35)) {
        snapTo(-SWIPE_OPEN);
        return;
      }
      snapTo(0);
    },
    [onPress, snapTo, unreadRow]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) =>
          !disabled && Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
        onPanResponderGrant: () => {
          startX.current = openedRef.current;
          translateX.stopAnimation((v) => {
            startX.current = typeof v === "number" ? v : openedRef.current;
          });
        },
        onPanResponderMove: (_, gs) => {
          const maxRight = unreadRow ? SWIPE_OPEN + 12 : 0;
          const maxLeft = -(SWIPE_OPEN + 12);
          const next = Math.max(maxLeft, Math.min(maxRight, startX.current + gs.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gs) => release(gs),
        onPanResponderTerminate: (_, gs) => release(gs),
      }),
    [disabled, release, translateX, unreadRow]
  );

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.actionsBehind} pointerEvents="box-none">
        <View style={styles.leftActions}>
          {unreadRow ? (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: accentColor }]}
              onPress={() => {
                snapTo(0);
                onMarkRead();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.actionBtnText}>Read</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.rightActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.clearBtn]}
            onPress={() => {
              snapTo(0);
              onClear();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.actionBtnText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View
        style={[styles.cardMotion, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          onPress={() => {
            if (openedRef.current !== 0) {
              snapTo(0);
              return;
            }
            onPress();
          }}
          activeOpacity={0.88}
          style={[styles.card, unreadRow ? styles.cardUnread : styles.cardRead]}
          disabled={disabled}
        >
          <View style={styles.dotColumn}>
            {unreadRow ? <View style={[styles.dot, { backgroundColor: accentColor }]} /> : null}
          </View>
          <View style={styles.cardBody}>
            <View style={styles.rowBetween}>
              <Text
                style={[styles.title, unreadRow && styles.titleUnread, { flex: 1, minWidth: 0, marginRight: 8 }]}
                numberOfLines={2}
              >
                {item.title ?? "(untitled)"}
              </Text>
              {timeLabel ? (
                <Text style={styles.time} numberOfLines={1}>
                  {timeLabel}
                </Text>
              ) : null}
            </View>
            {item.body ? (
              <Text style={styles.body} numberOfLines={3}>
                {item.body}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
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
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const clearEpochRef = useRef(0);
  const clearingRef = useRef(false);
  const itemsSnapshotRef = useRef<InboxItem[]>([]);

  const publishStats = useCallback(
    (list: InboxItem[]) => {
      const nextUnread = list.filter(isUnread).length;
      setUnread(nextUnread);
      // Never notify parent stores synchronously from a setState updater —
      // that updates TabAppChrome while InboxScreen is still rendering.
      const notify = onInboxStats;
      if (!notify) return;
      queueMicrotask(() => {
        notify({ unread: nextUnread, total: list.length });
      });
    },
    [onInboxStats]
  );

  /** Update list + unread outside of any setState updater body. */
  const commitItems = useCallback(
    (next: InboxItem[]) => {
      itemsSnapshotRef.current = next;
      setItems(next);
      publishStats(next);
    },
    [publishStats]
  );

  const load = useCallback(async () => {
    const epochAtStart = clearEpochRef.current;
    setError(null);
    try {
      const [page, dismissedIds] = await Promise.all([
        loadInbox(apiConfig, { limit: 100 }),
        getDismissedIds ? getDismissedIds() : Promise.resolve(new Set<string>()),
      ]);
      // A Clear All that finished after this fetch started wins — do not restore.
      if (epochAtStart !== clearEpochRef.current) return;
      setDismissed(dismissedIds);
      const filtered = filterItems ? filterItems(page.items) : page.items;
      const visible = filtered.filter((i) => !dismissedIds.has(i.notification_id));
      commitItems(visible);
    } catch (e) {
      if (epochAtStart !== clearEpochRef.current) return;
      setError((e as Error).message);
    }
  }, [apiConfig, getDismissedIds, filterItems, commitItems]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    if (clearingRef.current) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTap = async (item: InboxItem) => {
    setOpenSwipeId(null);
    const marked: InboxItem = {
      ...item,
      clicked_at: new Date().toISOString(),
      status: "clicked",
    };
    commitItems(
      itemsSnapshotRef.current.map((p) =>
        p.notification_id === item.notification_id ? marked : p
      )
    );
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

  const handleMarkRead = useCallback(
    async (item: InboxItem) => {
      if (!isUnread(item)) return;
      const marked: InboxItem = {
        ...item,
        clicked_at: item.clicked_at ?? new Date().toISOString(),
        status: "clicked",
        delivered_at: item.delivered_at ?? new Date().toISOString(),
      };
      commitItems(
        itemsSnapshotRef.current.map((p) =>
          p.notification_id === item.notification_id ? marked : p
        )
      );
      try {
        await markReadRemote(apiConfig, item.notification_id);
      } catch {
        try {
          await markClickedRemote(apiConfig, item.notification_id);
        } catch {
          /* tolerated */
        }
      }
    },
    [apiConfig, commitItems]
  );

  const handleClearOne = useCallback(
    async (item: InboxItem) => {
      const id = item.notification_id;
      commitItems(itemsSnapshotRef.current.filter((p) => p.notification_id !== id));
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      try {
        if (isUnread(item)) {
          await markReadRemote(apiConfig, id).catch(() =>
            markClickedRemote(apiConfig, id).catch(() => undefined)
          );
        }
      } catch {
        /* hide locally anyway */
      }
      if (persistDismissedIds) {
        try {
          await persistDismissedIds([id]);
        } catch {
          /* tolerated */
        }
      }
    },
    [apiConfig, persistDismissedIds, commitItems]
  );

  const handleMarkAllRead = async () => {
    setOpenSwipeId(null);
    commitItems(
      itemsSnapshotRef.current.map((p) =>
        isUnread(p)
          ? {
              ...p,
              clicked_at: p.clicked_at ?? new Date().toISOString(),
              status: "clicked",
              delivered_at: p.delivered_at ?? new Date().toISOString(),
            }
          : p
      )
    );
    try {
      await markAllReadRemote(apiConfig);
    } catch {
      /* tolerated */
    }
  };

  const applyLocalClearAll = async (ids: string[]) => {
    try {
      await markAllReadRemote(apiConfig);
    } catch {
      /* local hide still wins */
    }
    if (persistDismissedIds && ids.length > 0) {
      await persistDismissedIds(ids);
    }
    clearEpochRef.current += 1;
    onCleared?.();
  };

  const handleClearAll = async () => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    setError(null);
    setOpenSwipeId(null);

    const previousItems = itemsSnapshotRef.current;
    const previousDismissed = dismissed;
    const ids = previousItems.map((i) => i.notification_id);

    // Optimistic empty UI; roll back only if both server + local fallback fail.
    commitItems([]);
    const nextDismissed = new Set(previousDismissed);
    for (const id of ids) nextDismissed.add(id);
    setDismissed(nextDismissed);

    try {
      try {
        await clearAllRemote(apiConfig);
        clearEpochRef.current += 1;
        if (persistDismissedIds && ids.length > 0) {
          try {
            await persistDismissedIds(ids);
          } catch {
            /* local cache optional once server cutoff exists */
          }
        }
        onCleared?.();
      } catch (serverErr) {
        // Migration not applied / old backend — still clear for this device.
        if (isClearAllUnavailable(serverErr) || persistDismissedIds) {
          await applyLocalClearAll(ids);
        } else {
          throw serverErr;
        }
      }
    } catch (e) {
      commitItems(previousItems);
      setDismissed(previousDismissed);
      setError(
        (e as Error)?.message?.includes("409")
          ? "Clear all is temporarily unavailable. Please try again later."
          : "Could not clear notifications. Please try again."
      );
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  };

  const renderItem = ({ item }: ListRenderItemInfo<InboxItem>) => (
    <InboxSwipeCard
      item={item}
      accentColor={accentColor}
      disabled={clearing}
      onPress={() => void handleTap(item)}
      onMarkRead={() => void handleMarkRead(item)}
      onClear={() => void handleClearOne(item)}
      openId={openSwipeId}
      setOpenId={setOpenSwipeId}
    />
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heading}>Notifications</Text>
          {unread > 0 ? <Text style={styles.subheading}>{unread} unread</Text> : null}
        </View>
        <View style={styles.headerActions}>
          {unread > 0 ? (
            <TouchableOpacity
              onPress={() => void handleMarkAllRead()}
              hitSlop={8}
              disabled={clearing}
            >
              <Text style={[styles.actionText, { color: accentColor, opacity: clearing ? 0.4 : 1 }]}>
                Mark all as read
              </Text>
            </TouchableOpacity>
          ) : null}
          {items.length > 0 || clearing ? (
            <TouchableOpacity
              onPress={() => void handleClearAll()}
              hitSlop={8}
              disabled={clearing || items.length === 0}
            >
              {clearing ? (
                <View style={styles.clearingRow}>
                  <ActivityIndicator size="small" color="#64748b" />
                  <Text style={[styles.actionText, styles.clearAllText]}>Clearing…</Text>
                </View>
              ) : (
                <Text style={[styles.actionText, styles.clearAllText]}>Clear all</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(x) => x.notification_id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} enabled={!clearing} />
        }
        ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
        contentContainerStyle={
          items.length === 0
            ? { flexGrow: 1, justifyContent: "center" }
            : styles.listContent
        }
        onScrollBeginDrag={() => setOpenSwipeId(null)}
        onMomentumScrollEnd={() => {
          if (clearingRef.current) return;
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
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148, 163, 184, 0.35)",
    gap: 12,
    maxWidth: "100%",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  heading: { fontSize: 20, fontWeight: "800", color: "#0f172a", flexShrink: 1 },
  subheading: { fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: "600" },
  actionText: { fontSize: 13, fontWeight: "700", flexShrink: 0 },
  clearAllText: { color: "#64748b" },
  clearingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 28,
  },
  swipeWrap: {
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  actionsBehind: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    paddingHorizontal: 2,
  },
  leftActions: {
    width: ACTION_WIDTH,
    justifyContent: "center",
  },
  rightActions: {
    width: ACTION_WIDTH,
    justifyContent: "center",
    marginLeft: "auto",
  },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  clearBtn: {
    backgroundColor: "#DC2626",
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  cardMotion: {
    width: "100%",
  },
  card: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    maxWidth: "100%",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardUnread: {
    backgroundColor: "#F0FDFA",
    borderColor: "#99F6E4",
  },
  cardRead: {
    backgroundColor: "#FFFFFF",
  },
  dotColumn: { width: 12, alignItems: "center", paddingTop: 6, flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardBody: { flex: 1, minWidth: 0 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    maxWidth: "100%",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  titleUnread: {
    fontWeight: "800",
  },
  time: {
    fontSize: 11,
    color: "#64748b",
    flexShrink: 0,
    maxWidth: 120,
    textAlign: "right",
    fontWeight: "600",
    marginTop: 2,
  },
  body: { fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 18 },
  empty: { textAlign: "center", color: "#94a3b8", fontSize: 14, paddingHorizontal: 24 },
  error: { textAlign: "center", color: "#dc2626", fontSize: 12, padding: 8 },
});
