import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
        // Capture only horizontal swipes (so vertical scrolling stays smooth).
        return Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy);
      },
      onPanResponderMove: (_, g) => {
        movedRef.current = movedRef.current || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6;
        // Only allow left swipe (reveal right action)
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
        // Open only on left swipe beyond threshold
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
        style={[
          styles.swipeFront,
          { transform: [{ translateX }] },
        ]}
      >
        <Pressable
          onPress={() => {
            // If user was swiping/dragging, do not open modal.
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
              {item.title.trim() === WAITING_FOR_ORDER_TITLE ? (
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

          <View style={styles.itemRight}>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
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
  const { notifications, markAllAsRead, markAsRead, removeNotification, loading } = useNotifications();
  const { orders } = useOrders();
  const { openIncomingOrderSheet } = useIncomingOrderSheet();
  const [selected, setSelected] = useState<MerchantNotification | null>(null);
  const modalVisible = selected != null;
  const [pendingDelete, setPendingDelete] = useState<MerchantNotification | null>(null);
  const confirmVisible = pendingDelete != null;

  const canOpenSelected = useMemo(() => {
    if (!selected) return false;
    return Boolean(selected.actionUrl || selected.orderId);
  }, [selected]);

  const selectedDisplayBody = useMemo(
    () => (selected ? merchantNotificationDisplayBody(selected, orders) : ""),
    [selected, orders]
  );

  const handleItemPress = async (item: MerchantNotification) => {
    markAsRead(item.id);

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
        if (order?.status === "created" && !order.id.startsWith("core-")) {
          openIncomingOrderSheet(order);
          return;
        }
        if (order) {
          router.push(`/order/${order.id}` as never);
          return;
        }
        if (item.orderId) {
          router.push(`/order/${item.orderId}` as never);
          return;
        }
      } catch {
        if (item.orderId) router.push(`/order/${item.orderId}` as never);
      }
    }

    if (item.actionUrl) {
      router.push(item.actionUrl as never);
      return;
    }

    setSelected(item);
  };

  const handleOpenSelected = () => {
    if (!selected) return;
    const { actionUrl, orderId } = selected;
    setSelected(null);
    if (actionUrl) {
      router.push(actionUrl as any);
      return;
    }
    if (orderId) {
      router.push(`/order/${orderId}`);
    }
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
    // Close details modal if it's the same item
    if (selected?.id === id) setSelected(null);
    setPendingDelete(null);
    await removeNotification(id);
    showToast("Notification deleted");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {selected?.title ?? ""}
              </Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
                <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
              </Pressable>
            </View>
            {!!selected?.dateTime && <Text style={styles.modalTime}>{selected.dateTime}</Text>}
            <Text style={styles.modalBody}>{selectedDisplayBody}</Text>
            <View style={styles.modalActions}>
              {canOpenSelected && (
                <Pressable
                  onPress={handleOpenSelected}
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>Open</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.some((n) => !n.read) && (
          <Pressable
            onPress={() => void markAllAsRead()}
            style={({ pressed }) => [styles.markReadBtn, pressed && styles.pressed]}
          >
            <Text style={styles.markReadText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
            <Text style={styles.loadingText}>Loading notifications…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={48} color={GatiMitraMerchant.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySub}>You're all caught up.</Text>
          </View>
        ) : (
          notifications.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              displayBody={merchantNotificationDisplayBody(item, orders)}
              onPress={() => handleItemPress(item)}
              onDeletePress={() => requestDelete(item)}
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
    backgroundColor: GatiMitraMerchant.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
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
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginLeft: 8,
  },
  markReadBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  markReadText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    gap: 0,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
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
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  swipeFront: {
    backgroundColor: "transparent",
  },
  itemUnread: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
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
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  body: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  time: {
    fontSize: 12,
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
  pressed: {
    opacity: 0.75,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  modalCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    maxHeight: "80%",
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
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  confirmBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
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
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  modalTime: {
    marginTop: 6,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  modalBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: GatiMitraMerchant.textSecondary,
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
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnPrimary: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  modalBtnPrimaryText: {
    color: "#FFFFFF",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyIconWrap: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  emptySub: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
});
