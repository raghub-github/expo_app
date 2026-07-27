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
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { NotificationsEmptyMailboxArt } from "@/components/NotificationsEmptyMailboxArt";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";

const LORA = StoreFonts.loraRegular;
const LORA_BOLD = StoreFonts.loraBold;
const H_PADDING = 16;

const BG_GRADIENT = ["#E8F8F2", "#F5FBFF", "#FFF5F7"] as const;

const COLORS = {
  primary: GatiMitraColors.deepMintStart,
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

const ICON_BG: Record<NotifVisualType, string> = {
  order: "#E0F2FE",
  store: "#FEF3C7",
  system: "#F1F5F9",
  earning: "#DCFCE7",
};

const ICON_COLOR: Record<NotifVisualType, string> = {
  order: COLORS.info,
  store: COLORS.warning,
  system: COLORS.textSecondary,
  earning: COLORS.success,
};

const SWIPE_ACTION_WIDTH = 64;
const SWIPE_OPEN_THRESHOLD = 40;

function isUnread(item: InboxItem): boolean {
  if (item.clicked_at) return false;
  return item.status === "queued" || item.status === "sent";
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

function formatTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return `${d}d ago`;
  }
}

function NotificationItem({
  item,
  onPress,
  onDeletePress,
}: {
  item: InboxItem;
  onPress: () => void;
  onDeletePress: () => void;
}) {
  const type = visualTypeFor(item);
  const iconName = ICON_MAP[type];
  const iconBg = ICON_BG[type];
  const iconColor = ICON_COLOR[type];
  const unread = isUnread(item);
  const translateX = useRef(new Animated.Value(0)).current;
  const openedSide = useRef<"right" | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const movedRef = useRef(false);
  const actionsOpacity = translateX.interpolate({
    inputRange: [-SWIPE_ACTION_WIDTH, -4, 0],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  });

  const close = () => {
    openedSide.current = null;
    setIsOpen(false);
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  };

  const openRight = () => {
    openedSide.current = "right";
    setIsOpen(true);
    Animated.spring(translateX, {
      toValue: -SWIPE_ACTION_WIDTH,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        return Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy);
      },
      onPanResponderMove: (_, g) => {
        movedRef.current = movedRef.current || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6;
        const clamped = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, g.dx));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        const dragged = movedRef.current;
        movedRef.current = false;
        if (!dragged) {
          close();
          return;
        }
        const shouldOpenRight = g.dx < -SWIPE_OPEN_THRESHOLD;
        if (!shouldOpenRight) {
          close();
          return;
        }
        openRight();
      },
      onPanResponderTerminate: close,
      onPanResponderGrant: () => {
        movedRef.current = false;
      },
    })
  ).current;

  return (
    <View style={styles.swipeWrap}>
      <Animated.View
        style={[styles.swipeActions, { opacity: actionsOpacity }]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <Pressable
          onPress={() => {
            close();
            onDeletePress();
          }}
          style={({ pressed }) => [styles.swipeActionRight, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeFront, { transform: [{ translateX }] }]}
      >
        <Pressable
          onPress={() => {
            if (movedRef.current) return;
            if (isOpen) {
              close();
              return;
            }
            onPress();
          }}
          style={({ pressed }) => [
            styles.item,
            unread && styles.itemUnread,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={22} color={iconColor} />
          </View>
          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title?.trim() || "Notification"}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {item.body?.trim() || ""}
            </Text>
            <Text style={styles.time}>{formatTime(item.queued_at)}</Text>
          </View>
          <View style={styles.itemRight}>{unread ? <View style={styles.unreadDot} /> : null}</View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InboxItem | null>(null);
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
      const page = await loadInbox(apiConfig, { limit: 100 });
      setItems(page.items.filter((n) => !dismissedIds.current.has(n.notification_id)));
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

  const hasUnread = items.some(isUnread);
  const modalVisible = selected != null;
  const confirmVisible = pendingDelete != null;
  const canOpenSelected = Boolean(selected?.deep_link);

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

    const deepLink = item.deep_link?.trim();
    if (deepLink) {
      try {
        if (!deepLink.startsWith("http")) {
          router.push(deepLink as never);
          return;
        }
      } catch {
        /* fall through to detail modal */
      }
    }
    setSelected(item);
  };

  const handleOpenSelected = () => {
    if (!selected?.deep_link) return;
    const deepLink = selected.deep_link.trim();
    setSelected(null);
    try {
      if (!deepLink.startsWith("http")) {
        router.push(deepLink as never);
      }
    } catch {
      /* ignore */
    }
  };

  const handleMarkAllRead = async () => {
    setItems((prev) =>
      prev.map((p) =>
        isUnread(p)
          ? { ...p, status: "delivered", delivered_at: p.delivered_at ?? new Date().toISOString() }
          : p
      )
    );
    try {
      await markAllReadRemote(apiConfig);
    } catch {
      /* tolerated */
    }
  };

  const requestDelete = (item: InboxItem) => {
    setPendingDelete(item);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.notification_id;
    dismissedIds.current.add(id);
    if (selected?.notification_id === id) setSelected(null);
    setPendingDelete(null);
    setItems((prev) => prev.filter((n) => n.notification_id !== id));
    showToast("Notification deleted");
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
          visible={modalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSelected(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={2}>
                  {selected?.title ?? ""}
                </Text>
                <Pressable
                  onPress={() => setSelected(null)}
                  hitSlop={12}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                </Pressable>
              </View>
              {!!selected?.queued_at && (
                <Text style={styles.modalTime}>{formatTime(selected.queued_at)}</Text>
              )}
              <Text style={styles.modalBody}>{selected?.body ?? ""}</Text>
              <View style={styles.modalActions}>
                {canOpenSelected ? (
                  <Pressable
                    onPress={handleOpenSelected}
                    style={({ pressed }) => [
                      styles.modalBtn,
                      styles.modalBtnPrimary,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>Open</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
          {hasUnread ? (
            <Pressable
              onPress={() => void handleMarkAllRead()}
              style={({ pressed }) => [styles.markReadBtn, pressed && styles.pressed]}
            >
              <Text style={styles.markReadText}>Mark all read</Text>
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
    paddingBottom: 12,
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
    marginRight: 8,
  },
  headerSpacer: { width: 88 },
  markReadBtn: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    minWidth: 88,
    alignItems: "flex-end",
  },
  markReadText: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    color: COLORS.primary,
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
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
  },
  itemRight: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginLeft: 8,
  },
  swipeWrap: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    marginBottom: 2,
  },
  swipeActions: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  swipeActionRight: {
    width: SWIPE_ACTION_WIDTH,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  swipeFront: {
    backgroundColor: "transparent",
  },
  itemUnread: {
    backgroundColor: "rgba(232,248,242,0.95)",
    borderColor: "#A7F3D0",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
  },
  body: {
    fontSize: 13,
    fontFamily: LORA,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  time: {
    fontSize: 12,
    fontFamily: LORA,
    color: COLORS.textTertiary,
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
  },
  pressed: { opacity: 0.75 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 16,
    justifyContent: "center",
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
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 16,
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
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  confirmDeleteBtn: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
  },
  modalBtnText: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
  },
  modalBtnPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modalBtnPrimaryText: {
    color: "#FFFFFF",
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
