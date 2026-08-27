/**
 * Customer notifications — merchant-matching UI, fed by
 * GET /v1/notifications/inbox (campaign + lifecycle pushes).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  ToastAndroid,
  Alert,
  Animated,
  PanResponder,
  RefreshControl,
  Text as RNText,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  loadInbox,
  markAllReadRemote,
  markClickedRemote,
  markReadRemote,
  type InboxItem,
  type NotificationApiConfig,
} from "@gatimitra/expo-push-kit";
import { getConfig } from "@/config/env";
import { STORAGE_KEYS } from "@/constants";
import { getItem } from "@/utils/storage";
import {
  addDismissedNotificationIds,
  readDismissedNotificationIds,
} from "@/lib/dismissedNotifications";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { NotificationsEmptyMailboxArt } from "@/components/NotificationsEmptyMailboxArt";
import { StoreFonts } from "@/constants/storeTypography";
import { displayNotificationTitle, formatNotificationTimeAgo } from "@/lib/notificationTime";
import {
  dedupeInboxItems,
  resolveActiveOrderPath,
  siblingNotificationIds,
} from "@/lib/notificationDedupe";

const LORA = StoreFonts.loraRegular;
const LORA_BOLD = StoreFonts.loraBold;
const H_PADDING = 16;

const BG_GRADIENT = ["#E8F8F2", "#F5FBFF", "#FFF5F7"] as const;

/** Solid teal — matches merchant unread / primary accents */
const ACCENT = "#14b8a6";

const COLORS = {
  primary: ACCENT,
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  cardBg: "#FFFFFF",
  border: "#E2E8F0",
  error: "#EF4444",
  info: "#0EA5E9",
  warning: "#F59E0B",
  success: "#22C55E",
} as const;

type NotifVisualType = "order" | "store" | "system" | "earning";

const ICON_MAP: Record<NotifVisualType, keyof typeof Ionicons.glyphMap> = {
  order: "receipt-outline",
  store: "storefront-outline",
  system: "notifications-outline",
  earning: "wallet-outline",
};

const ICON_COLOR: Record<NotifVisualType, string> = {
  order: COLORS.info,
  store: COLORS.warning,
  system: ACCENT,
  earning: COLORS.success,
};

const SWIPE_ACTION_WIDTH = 88;
const SWIPE_OPEN_THRESHOLD = 36;

function isUnread(item: InboxItem): boolean {
  return !item.clicked_at;
}

function previewBody(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the inbox row has a real detail screen to open. */
function hasInnerPage(item: InboxItem): boolean {
  return Boolean(item.title?.trim() || previewBody(item.body));
}

/** Reject "/", empty, and other routes that become Unmatched Route. */
function isValidAppDeepLink(raw: string | null | undefined): boolean {
  const d = String(raw ?? "").trim();
  if (!d) return false;
  if (d === "/" || d === "/--" || d === "#" || d === "." || d === "./") return false;
  if (d.startsWith("/notifications")) return false;
  if (d.startsWith("http://") || d.startsWith("https://")) return true;
  if (d.startsWith("/") && d.length > 1) return true;
  if (/^[a-zA-Z(]/.test(d)) return true;
  return false;
}

function visualTypeFor(item: InboxItem): NotifVisualType {
  const code = String(item.template_code ?? "").toUpperCase();
  const metaType = String((item.metadata as { gmType?: string } | null)?.gmType ?? "").toUpperCase();
  const key = code || metaType;
  if (key.includes("ORDER") || key.includes("FOOD") || key.includes("RIDE") || key.includes("PARCEL")) {
    return "order";
  }
  if (key.includes("WALLET") || key.includes("PAYMENT") || key.includes("CASH") || key.includes("SETTLEMENT")) {
    return "earning";
  }
  if (key.includes("STORE") || key.includes("MERCHANT") || key.includes("OFFER")) {
    return "store";
  }
  return "system";
}

function NotificationItem({
  item,
  displayBody,
  clickable,
  onPress,
  onDeletePress,
}: {
  item: InboxItem;
  displayBody: string;
  clickable: boolean;
  onPress: () => void;
  onDeletePress: () => void;
}) {
  const type = visualTypeFor(item);
  const iconName = ICON_MAP[type];
  const iconColor = ICON_COLOR[type];
  const unread = isUnread(item);
  const when = formatNotificationTimeAgo(item.queued_at);
  const title = displayNotificationTitle(item.title);
  const translateX = useRef(new Animated.Value(0)).current;
  const dragStartX = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const movedRef = useRef(false);

  const close = () => {
    setIsOpen(false);
    dragStartX.current = 0;
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const openRight = () => {
    setIsOpen(true);
    dragStartX.current = -SWIPE_ACTION_WIDTH;
    Animated.spring(translateX, {
      toValue: -SWIPE_ACTION_WIDTH,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderGrant: () => {
        movedRef.current = false;
        translateX.stopAnimation((v) => {
          dragStartX.current = typeof v === "number" ? v : 0;
        });
      },
      onPanResponderMove: (_, g) => {
        movedRef.current = movedRef.current || Math.abs(g.dx) > 4;
        const next = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, dragStartX.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const dragged = movedRef.current;
        movedRef.current = false;
        if (!dragged) return;
        const projected = dragStartX.current + g.dx;
        if (projected < -SWIPE_OPEN_THRESHOLD || g.vx < -0.35) {
          openRight();
        } else {
          close();
        }
      },
      onPanResponderTerminate: close,
    })
  ).current;

  return (
    <View style={styles.swipeWrap}>
      {/* Red delete slot behind the card — revealed by translateX (no elevation on front). */}
      <View style={styles.swipeDeleteBox} pointerEvents={isOpen ? "auto" : "none"}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            close();
            onDeletePress();
          }}
          style={styles.swipeDeleteHit}
          accessibilityRole="button"
          accessibilityLabel="Delete notification"
        >
          <Ionicons name="trash" size={24} color="#FFFFFF" />
          <RNText style={styles.swipeDeleteLabel}>Delete</RNText>
        </TouchableOpacity>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        pointerEvents={isOpen ? "none" : "auto"}
        style={[styles.swipeFront, { transform: [{ translateX }] }]}
      >
        <Pressable
          onPress={() => {
            if (movedRef.current) return;
            if (!clickable) return;
            onPress();
          }}
          disabled={!clickable}
          style={({ pressed }) => [
            styles.item,
            unread && styles.itemUnread,
            !clickable && styles.itemMuted,
            pressed && clickable && styles.pressed,
          ]}
        >
          {unread ? <View style={styles.unreadDot} pointerEvents="none" /> : null}
          <View style={styles.topRow}>
            <View style={styles.iconWrap}>
              <Ionicons name={iconName} size={15} color={iconColor} />
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
          {!!displayBody ? (
            <Text style={styles.body} numberOfLines={2}>
              {displayBody}
            </Text>
          ) : null}
          {when ? <Text style={styles.time}>{when}</Text> : null}
        </Pressable>
      </Animated.View>

      {isOpen ? (
        <TouchableOpacity
          activeOpacity={1}
          onPress={close}
          style={styles.swipeDismissOverlay}
          accessibilityLabel="Close swipe actions"
        />
      ) : null}
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InboxItem | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const dismissedIds = useRef<Set<string>>(new Set());

  const apiConfig = useMemo<NotificationApiConfig>(
    () => ({
      baseUrl: getConfig().apiBaseUrl,
      getAuthHeader: async () => {
        const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
        return token ? `Bearer ${token}` : null;
      },
    }),
    []
  );

  const load = useCallback(async () => {
    try {
      const [page, dismissed] = await Promise.all([
        loadInbox(apiConfig, { limit: 100 }),
        readDismissedNotificationIds(),
      ]);
      for (const id of dismissedIds.current) dismissed.add(id);
      dismissedIds.current = dismissed;
      const visible = page.items.filter((n) => !dismissed.has(n.notification_id));
      // Collapse campaign/order duplicates so list + detail stay one entry.
      const unique = dedupeInboxItems(visible);
      const hiddenDupes = visible
        .filter((n) => !unique.some((u) => u.notification_id === n.notification_id))
        .map((n) => n.notification_id);
      if (hiddenDupes.length > 0) {
        for (const id of hiddenDupes) dismissedIds.current.add(id);
        void addDismissedNotificationIds(hiddenDupes);
      }
      setItems(unique);
    } catch {
      // Keep previous list on soft failure.
    } finally {
      setLoading(false);
    }
  }, [apiConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const hasNotifications = items.length > 0;
  const confirmVisible = pendingDelete != null;

  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert(message);
    }
  };

  const markItemReadLocal = (id: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.notification_id === id
          ? { ...p, clicked_at: p.clicked_at ?? new Date().toISOString(), status: "clicked" }
          : p
      )
    );
  };

  const handleItemPress = async (item: InboxItem) => {
    // No detail content and no valid link → stay put (row is unclickable).
    if (!hasInnerPage(item) && !isValidAppDeepLink(item.deep_link) && !resolveActiveOrderPath(item)) {
      return;
    }

    markItemReadLocal(item.notification_id);
    try {
      await markClickedRemote(apiConfig, item.notification_id);
    } catch {
      try {
        await markReadRemote(apiConfig, item.notification_id);
      } catch {
        /* tolerated */
      }
    }

    // Active / order lifecycle → open the live order screen directly.
    const orderPath = resolveActiveOrderPath(item);
    if (orderPath) {
      try {
        router.push(orderPath as never);
        return;
      } catch {
        /* fall through */
      }
    }

    const deepLink = item.deep_link?.trim() ?? "";
    if (isValidAppDeepLink(deepLink) && !deepLink.startsWith("http")) {
      try {
        router.push(deepLink as never);
        return;
      } catch {
        /* fall through to detail */
      }
    }

    // Announcements / system → in-app notification detail.
    if (hasInnerPage(item)) {
      router.push(`/notifications/${encodeURIComponent(item.notification_id)}` as never);
    }
  };

  const requestDelete = (item: InboxItem) => {
    Alert.alert("Delete notification?", item.title?.trim() || "Remove this notification?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const ids = siblingNotificationIds(items, item);
          for (const id of ids) dismissedIds.current.add(id);
          setItems((prev) => prev.filter((n) => !ids.includes(n.notification_id)));
          void addDismissedNotificationIds(ids);
          showToast("Notification deleted");
        },
      },
    ]);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const ids = siblingNotificationIds(items, target);
    for (const id of ids) dismissedIds.current.add(id);
    setPendingDelete(null);
    setItems((prev) => prev.filter((n) => !ids.includes(n.notification_id)));
    void addDismissedNotificationIds(ids);
    showToast("Notification deleted");
  };

  const runClearAll = async () => {
    setClearingAll(true);
    try {
      const ids = items.map((n) => n.notification_id);
      for (const id of ids) dismissedIds.current.add(id);
      setItems([]);
      await addDismissedNotificationIds(ids);
      try {
        await markAllReadRemote(apiConfig);
      } catch {
        /* tolerated */
      }
      setConfirmClearAll(false);
      showToast("All notifications cleared");
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.root}>
        <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />
        <StatusBar style="dark" />

        <Modal
          visible={confirmVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPendingDelete(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPendingDelete(null)}>
            <Pressable style={styles.confirmCard} onPress={() => null}>
              <Text style={styles.confirmTitle}>Delete notification?</Text>
              <Text style={styles.confirmBody} numberOfLines={3}>
                {pendingDelete?.title ?? ""}
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setPendingDelete(null)}
                  style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  style={({ pressed }) => [
                    styles.modalBtn,
                    styles.confirmDeleteBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={confirmClearAll}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!clearingAll) setConfirmClearAll(false);
          }}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!clearingAll) setConfirmClearAll(false);
            }}
          >
            <Pressable style={styles.confirmCard} onPress={() => null}>
              <Text style={styles.confirmTitle}>Clear all notifications?</Text>
              <Text style={styles.confirmBody}>
                This removes every notification from your inbox. You can't undo this.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => {
                    if (!clearingAll) setConfirmClearAll(false);
                  }}
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnFlex, pressed && styles.pressed]}
                  disabled={clearingAll}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void runClearAll()}
                  style={({ pressed }) => [
                    styles.modalBtn,
                    styles.modalBtnFlex,
                    styles.modalBtnPrimary,
                    pressed && styles.pressed,
                    clearingAll && styles.modalBtnDisabled,
                  ]}
                  disabled={clearingAll}
                  accessibilityRole="button"
                  accessibilityLabel="Continue and clear all notifications"
                >
                  {clearingAll ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>Continue</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={[styles.header, { paddingTop: Math.max(insets.top - 4, 6) }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          {hasNotifications ? (
            <Pressable
              onPress={() => setConfirmClearAll(true)}
              style={({ pressed }) => [styles.clearAllBtn, pressed && styles.pressed]}
              hitSlop={8}
            >
              <Text style={styles.clearAllText}>Clear all</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            items.length === 0 && !loading ? styles.scrollContentEmpty : null,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              title="Pull down to refresh"
              titleColor={COLORS.textPrimary}
            />
          }
        >
          {loading && items.length === 0 && !refreshing ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading notifications…</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <NotificationsEmptyMailboxArt size={168} />
              <Text style={styles.emptyTitle}>No Notification</Text>
              <Text style={styles.emptySub}>Nothing to show!</Text>
            </View>
          ) : (
            items.map((item) => (
              <NotificationItem
                key={item.notification_id}
                item={item}
                displayBody={previewBody(item.body)}
                clickable={
                  hasInnerPage(item) ||
                  isValidAppDeepLink(item.deep_link) ||
                  Boolean(resolveActiveOrderPath(item))
                }
                onPress={() => void handleItemPress(item)}
                onDeletePress={() => requestDelete(item)}
              />
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_GRADIENT[0],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  headerSpacer: { width: 88, minWidth: 88 },
  clearAllBtn: {
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(20, 184, 166, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  clearAllText: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    color: "#0D9488",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
  },
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  item: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 12,
    paddingRight: 22,
    borderRadius: 14,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    overflow: "visible",
  },
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    marginBottom: 10,
    width: "100%",
    backgroundColor: "#EF4444",
  },
  swipeDeleteBox: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },
  swipeDeleteHit: {
    width: SWIPE_ACTION_WIDTH,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeDeleteLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  swipeFront: {
    backgroundColor: COLORS.cardBg,
    width: "100%",
    zIndex: 1,
    // Do not set elevation — Android draws elevated views over the delete slot.
  },
  swipeDismissOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: SWIPE_ACTION_WIDTH,
    zIndex: 2,
  },
  itemUnread: {
    backgroundColor: "#F0FDFA",
    borderColor: "#A7F3D0",
  },
  itemMuted: {
    opacity: 0.85,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    paddingRight: 4,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 0,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "rgba(20, 184, 166, 0.08)",
  },
  title: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
    lineHeight: 20,
    paddingTop: 4,
  },
  body: {
    fontSize: 13,
    fontFamily: LORA,
    color: COLORS.textSecondary,
    marginTop: 8,
    marginLeft: 38,
    lineHeight: 18,
  },
  time: {
    fontSize: 12,
    fontFamily: LORA,
    color: COLORS.textTertiary,
    marginTop: 6,
    marginLeft: 38,
  },
  unreadDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    zIndex: 2,
  },
  pressed: { opacity: 0.75 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: "80%",
  },
  confirmCard: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: 360,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  confirmTitle: {
    fontSize: 16,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
  },
  confirmBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: LORA,
    color: COLORS.textSecondary,
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    marginTop: 18,
  },
  confirmDeleteBtn: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
    minWidth: 88,
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
  },
  modalTime: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: LORA,
    color: COLORS.textTertiary,
  },
  modalBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: LORA,
    color: COLORS.textSecondary,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  modalBtnFlex: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
    minWidth: 120,
    marginHorizontal: 5,
  },
  modalBtnText: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  modalBtnPrimary: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  modalBtnPrimaryText: {
    color: "#FFFFFF",
  },
  modalBtnDisabled: {
    opacity: 0.7,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 22,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: 15,
    fontFamily: LORA,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: LORA,
    color: COLORS.textSecondary,
  },
});
