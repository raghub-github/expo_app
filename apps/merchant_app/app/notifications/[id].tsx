import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Platform,
  ToastAndroid,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useNotifications, type MerchantNotification, type NotificationType } from "@/context/NotificationContext";
import { useOrders } from "@/hooks/useOrders";
import { merchantNotificationDisplayBody } from "@/lib/merchant-notification-display";
import { isNotificationsInboxUrl } from "@/lib/isNotificationsInboxUrl";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";

const BG_GRADIENT = ["#E8F8F2", "#F5FBFF", "#FFF5F7"] as const;

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

function showToast(message: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

export default function NotificationDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const notificationId = rawId ? decodeURIComponent(rawId) : "";

  const { notifications, markAsRead, removeNotification, loading } = useNotifications();
  const { orders } = useOrders();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const item: MerchantNotification | null = useMemo(
    () => notifications.find((n) => n.id === notificationId) ?? null,
    [notifications, notificationId]
  );

  useEffect(() => {
    if (!notificationId || !item || item.read) return;
    void markAsRead(notificationId);
  }, [notificationId, item, markAsRead]);

  const body = useMemo(
    () => (item ? merchantNotificationDisplayBody(item, orders) : ""),
    [item, orders]
  );

  const canOpenLink = Boolean(
    item?.actionUrl && !isNotificationsInboxUrl(item.actionUrl)
  );
  const canOpenOrder = Boolean(item?.orderId);

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/notifications" as never);
  }, [router]);

  const onDelete = useCallback(async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await removeNotification(item.id);
      showToast("Notification deleted");
      setConfirmDelete(false);
      onClose();
    } finally {
      setDeleting(false);
    }
  }, [item, removeNotification, onClose]);

  const onOpenLinked = useCallback(() => {
    if (!item) return;
    if (item.actionUrl && !isNotificationsInboxUrl(item.actionUrl)) {
      router.replace(item.actionUrl as never);
      return;
    }
    if (item.orderId) {
      router.replace(`/order/${item.orderId}` as never);
    }
  }, [item, router]);

  if (!item && !loading) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <Pressable onPress={onClose} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Notification</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Notification not found</Text>
          <Text style={styles.missingBody}>It may have already been deleted.</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.root, styles.loadingRoot]}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
      </View>
    );
  }

  const iconName = ICON_MAP[item.type];
  const iconBg = ICON_BG[item.type];
  const iconColor = ICON_COLOR[item.type];

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmDelete(false)}>
          <Pressable style={styles.confirmCard} onPress={() => null}>
            <Text style={styles.confirmTitle}>Delete notification?</Text>
            <Text style={styles.confirmBody} numberOfLines={3}>
              {item.title}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmDelete(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                disabled={deleting}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void onDelete()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.confirmDeleteBtn,
                  pressed && styles.pressed,
                ]}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>Delete</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Notification</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={28} color={iconColor} />
          </View>
          <Text style={styles.title}>{item.title}</Text>
          {!!item.dateTime && <Text style={styles.time}>{item.dateTime}</Text>}
          <Text style={styles.body}>{body}</Text>
        </View>

        {(canOpenLink || canOpenOrder) && (
          <Pressable
            onPress={onOpenLinked}
            style={({ pressed }) => [styles.openLinkBtn, pressed && styles.pressed]}
          >
            <Ionicons name="open-outline" size={18} color={GatiMitraMerchant.primary} />
            <Text style={styles.openLinkText}>
              {canOpenOrder ? "View related order" : "Open link"}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.ctaBtn, styles.ctaClose, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.ctaCloseText}>Close</Text>
        </Pressable>
        <Pressable
          onPress={() => setConfirmDelete(true)}
          style={({ pressed }) => [styles.ctaBtn, styles.ctaDelete, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Delete"
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={styles.ctaDeleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_GRADIENT[0],
  },
  loadingRoot: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 12,
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
  },
  headerSpacer: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 28,
  },
  time: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: LORA,
    color: GatiMitraMerchant.textTertiary,
  },
  body: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  openLinkBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  openLinkText: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.primary,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  ctaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaClose: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  ctaCloseText: {
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  ctaDelete: {
    backgroundColor: GatiMitraMerchant.error,
  },
  ctaDeleteText: {
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
  },
  missing: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  missingTitle: {
    fontSize: 18,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  missingBody: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  closeBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.primary,
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
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
    minWidth: 88,
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
});
