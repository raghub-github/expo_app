import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Platform, ToastAndroid, Alert, Animated, PanResponder, RefreshControl } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useNotifications, type MerchantNotification, type NotificationType } from "@/context/NotificationContext";
import { RadarLiveIndicator } from "@/components/RadarLiveIndicator";
import { WAITING_FOR_ORDER_TITLE } from "@/services/storeNotificationsApi";
import { useOrders, mapApiOrder } from "@/hooks/useOrders";
import {
  findOrderForNotification,
  isNewOrderAcceptNotification,
  merchantNotificationDisplayBody,
} from "@/lib/merchant-notification-display";
import { useIncomingOrderSheet } from "@/context/IncomingOrderSheetContext";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { fetchFoodOrder } from "@/services/ordersApi";
import { isNotificationsInboxUrl } from "@/lib/isNotificationsInboxUrl";
import { openOrderDetailOnce } from "@/lib/openOrderDetailOnce";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";

const ICON_MAP: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  order: "receipt-outline",
  store: "storefront-outline",
  system: "notifications-outline",
  earning: "wallet-outline",
};

const ICON_BG: Record<NotificationType, string> = {
  order: "#E0F2FE",
  store: "#FEF3C7",
  system: "#F1F5F9",
  earning: "#DCFCE7",
};

const ICON_COLOR: Record<NotificationType, string> = {
  order: GatiMitraMerchant.info,
  store: GatiMitraMerchant.warning,
  system: GatiMitraMerchant.textSecondary,
  earning: GatiMitraMerchant.success,
};

const SWIPE_ACTION_WIDTH = 64;
const SWIPE_OPEN_THRESHOLD = 40;

/** Soft brand wash — mint → soft blush (3rd image style, GatiMitra palette). */
const BG_GRADIENT = ["#E8F8F2", "#F5FBFF", "#FFF5F7"] as const;

function isWaitingForOrdersNotification(item: MerchantNotification): boolean {
  const title = item.title.trim();
  const body = String(item.body ?? "").toLowerCase();
  if (title === WAITING_FOR_ORDER_TITLE) return true;
  if (title.startsWith("🟢") && body.includes("waiting for order")) return true;
  if (body.includes("waiting for orders")) return true;
  return false;
}

/** Mailbox + nest empty-state art (reference image 3). */
function EmptyMailboxArt({ size = 160 }: { size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 160 160" fill="none">
      {/* Ground grass */}
      <Ellipse cx={80} cy={142} rx={36} ry={8} fill="#86EFAC" opacity={0.85} />
      <Path d="M55 138 C60 130 68 132 72 138" stroke="#22C55E" strokeWidth={2} fill="none" />
      <Path d="M88 138 C94 128 102 132 108 140" stroke="#22C55E" strokeWidth={2} fill="none" />
      {/* Post */}
      <Rect x={74} y={88} width={12} height={50} rx={2} fill="#92400E" />
      <Rect x={70} y={134} width={20} height={6} rx={2} fill="#78350F" />
      {/* Mailbox body */}
      <Rect x={48} y={58} width={64} height={36} rx={8} fill="#DC2626" />
      <Rect x={52} y={62} width={56} height={28} rx={6} fill="#EF4444" />
      <Path d="M48 72 H112" stroke="#B91C1C" strokeWidth={2} />
      <Circle cx={100} cy={76} r={3} fill="#FCD34D" />
      {/* Flag */}
      <Path d="M108 64 L124 58 L108 70 Z" fill="#FBBF24" />
      {/* Nest */}
      <Ellipse cx={78} cy={52} rx={18} ry={8} fill="#A16207" />
      <Ellipse cx={78} cy={50} rx={14} ry={5} fill="#CA8A04" />
      {/* Eggs */}
      <Ellipse cx={70} cy={48} rx={4} ry={5} fill="#7DD3FC" />
      <Ellipse cx={78} cy={46} rx={4} ry={5} fill="#BAE6FD" />
      <Ellipse cx={86} cy={48} rx={4} ry={5} fill="#7DD3FC" />
      {/* Bird */}
      <Ellipse cx={98} cy={44} rx={8} ry={6} fill="#FACC15" />
      <Circle cx={103} cy={42} r={2} fill="#0F172A" />
      <Path d="M106 44 L112 44" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" />
      <Path d="M92 46 C88 40 90 36 94 38" fill="#EAB308" />
    </Svg>
  );
}

function NotificationItem({
  item,
  displayBody,
  onPress,
  onDeletePress,
}: {
  item: MerchantNotification;
  displayBody: string;
  onPress: () => void;
  onDeletePress: () => void;
}) {
  const iconName = ICON_MAP[item.type];
  const iconBg = ICON_BG[item.type];
  const iconColor = ICON_COLOR[item.type];
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
            !item.read && styles.itemUnread,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={22} color={iconColor} />
          </View>
          <View style={styles.content}>
            <View style={styles.titleRow}>
              {isWaitingForOrdersNotification(item) ? (
                <View style={styles.waitingRadar} accessibilityLabel="Live waiting indicator">
                  <RadarLiveIndicator compact />
                </View>
              ) : null}
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            <Text style={styles.body} numberOfLines={2}>
              {displayBody}
            </Text>
            <Text style={styles.time}>{item.dateTime || item.timeAgo || ""}</Text>
          </View>

          <View style={styles.itemRight}>{!item.read && <View style={styles.unreadDot} />}</View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { notifications, markAsRead, removeNotification, clearAllNotifications, loading, refresh } =
    useNotifications();
  const { orders, upsertOrder } = useOrders();
  const { openIncomingOrderSheet } = useIncomingOrderSheet();
  const [pendingDelete, setPendingDelete] = useState<MerchantNotification | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const confirmVisible = pendingDelete != null;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleItemPress = async (item: MerchantNotification) => {
    markAsRead(item.id);

    // Waiting-for-orders → Orders tab (not detail page).
    if (isWaitingForOrdersNotification(item)) {
      router.replace("/(tabs)/orders" as never);
      return;
    }

    if (isNewOrderAcceptNotification(item)) {
      try {
        let order = findOrderForNotification(item, orders);
        if (!order && storeId && token && item.orderId) {
          const foodId = parseInt(String(item.orderId), 10);
          if (Number.isFinite(foodId)) {
            const api = await fetchFoodOrder(storeId, foodId, token);
            order = mapApiOrder(api);
          }
        }
        if (order) {
          upsertOrder(order);
        }
        if (order?.status === "created" && !order.id.startsWith("core-")) {
          openIncomingOrderSheet(order);
          return;
        }
        if (order) {
          openOrderDetailOnce(router as never, order.id);
          return;
        }
        if (item.orderId) {
          openOrderDetailOnce(router as never, String(item.orderId));
          return;
        }
      } catch {
        if (item.orderId) openOrderDetailOnce(router as never, String(item.orderId));
      }
    }

    // Real deep links that leave the inbox (never /notifications — that loops).
    if (item.actionUrl && !isNotificationsInboxUrl(item.actionUrl)) {
      router.push(item.actionUrl as never);
      return;
    }

    // Default: open the inner detail page (Close + Delete CTAs).
    router.push(`/notifications/${encodeURIComponent(item.id)}` as never);
  };

  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert(message);
    }
  };

  const requestDelete = (item: MerchantNotification) => {
    setPendingDelete(item);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await removeNotification(id);
    showToast("Notification deleted");
  };

  const runClearAll = async () => {
    setClearingAll(true);
    try {
      await clearAllNotifications();
      setConfirmClearAll(false);
      showToast("All notifications cleared");
    } finally {
      setClearingAll(false);
    }
  };

  const hasNotifications = notifications.length > 0;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
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
                style={({ pressed }) => [styles.modalBtn, styles.confirmDeleteBtn, pressed && styles.pressed]}
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
        onRequestClose={() => (!clearingAll ? setConfirmClearAll(false) : undefined)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => (!clearingAll ? setConfirmClearAll(false) : undefined)}
        >
          <Pressable style={styles.confirmCard} onPress={() => null}>
            <Text style={styles.confirmTitle}>Clear all notifications?</Text>
            <Text style={styles.confirmBody}>
              This deletes every notification for this store. You can't undo this.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmClearAll(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                disabled={clearingAll}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void runClearAll()}
                style={({ pressed }) => [styles.modalBtn, styles.confirmDeleteBtn, pressed && styles.pressed]}
                disabled={clearingAll}
              >
                {clearingAll ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>Clear all</Text>
                )}
              </Pressable>
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
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        {hasNotifications ? (
          <Pressable
            onPress={() => setConfirmClearAll(true)}
            style={({ pressed }) => [styles.markReadBtn, pressed && styles.pressed]}
          >
            <Text style={styles.markReadText}>Clear all</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          notifications.length === 0 && !loading ? styles.scrollContentEmpty : null,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={GatiMitraMerchant.primary}
            colors={[GatiMitraMerchant.primary]}
            title="Pull down to refresh"
            titleColor={GatiMitraMerchant.navy}
          />
        }
      >
        {loading && notifications.length === 0 && !refreshing ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
            <Text style={styles.loadingText}>Loading notifications…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.empty}>
            <EmptyMailboxArt size={168} />
            <Text style={styles.emptyTitle}>No Notification</Text>
            <Text style={styles.emptySub}>Nothing to show!</Text>
          </View>
        ) : (
          notifications.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              displayBody={merchantNotificationDisplayBody(item, orders)}
              onPress={() => void handleItemPress(item)}
              onDeletePress={() => requestDelete(item)}
            />
          ))
        )}
      </ScrollView>
    </View>
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
    color: GatiMitraMerchant.textPrimary,
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
    color: GatiMitraMerchant.primary,
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
    backgroundColor: GatiMitraMerchant.error,
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  waitingRadar: {
    marginTop: -2,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  body: {
    fontSize: 13,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  time: {
    fontSize: 12,
    fontFamily: LORA,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.primary,
    marginTop: 6,
  },
  pressed: { opacity: 0.75 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  confirmCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  confirmTitle: {
    fontSize: 16,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  confirmBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  confirmDeleteBtn: {
    backgroundColor: GatiMitraMerchant.error,
    borderColor: GatiMitraMerchant.error,
    minWidth: 96,
    alignItems: "center",
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  modalBtnText: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
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
    color: GatiMitraMerchant.textPrimary,
  },
  emptySub: {
    fontSize: 15,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
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
    color: GatiMitraMerchant.textSecondary,
  },
});
