/**
 * Customer notification detail — full-screen card + sticky Close / Delete footer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ToastAndroid,
  Alert,
  ActivityIndicator,
  Linking,
  Text as RNText,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  loadInbox,
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
import { StoreFonts } from "@/constants/storeTypography";
import { formatNotificationDateTime } from "@/lib/notificationTime";
import { siblingNotificationIds, resolveActiveOrderPath } from "@/lib/notificationDedupe";

const LORA = StoreFonts.loraRegular;
const LORA_BOLD = StoreFonts.loraBold;
const H_PADDING = 16;
const BG_GRADIENT = ["#E8F8F2", "#F5FBFF", "#FFF5F7"] as const;
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

function showToast(message: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

export default function NotificationDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const notificationId = rawId ? decodeURIComponent(rawId) : "";

  const [item, setItem] = useState<InboxItem | null>(null);
  const [allItems, setAllItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!notificationId) {
        setLoading(false);
        return;
      }
      try {
        const [page, dismissed] = await Promise.all([
          loadInbox(apiConfig, { limit: 100 }),
          readDismissedNotificationIds(),
        ]);
        if (cancelled) return;
        if (dismissed.has(notificationId)) {
          setItem(null);
          return;
        }
        const found = page.items.find((n) => n.notification_id === notificationId) ?? null;
        setItem(found);
        setAllItems(page.items);
        if (found) {
          // Soft-hide duplicate campaign/order rows so inbox stays one entry.
          const siblings = siblingNotificationIds(page.items, found).filter(
            (id) => id !== found.notification_id && !dismissed.has(id)
          );
          if (siblings.length > 0) {
            void addDismissedNotificationIds(siblings);
          }
        }
        if (found && !found.clicked_at) {
          try {
            await markClickedRemote(apiConfig, notificationId);
          } catch {
            try {
              await markReadRemote(apiConfig, notificationId);
            } catch {
              /* tolerated */
            }
          }
        }
      } catch {
        if (!cancelled) setItem(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiConfig, notificationId]);

  const type = item ? visualTypeFor(item) : "system";
  const deepLink = item?.deep_link?.trim() ?? "";
  const orderPath = item ? resolveActiveOrderPath(item) : null;
  const canOpenLink = (() => {
    if (orderPath) return true;
    if (!deepLink) return false;
    if (deepLink.startsWith("/notifications")) return false;
    if (deepLink === "/" || deepLink === "/--" || deepLink === "#") return false;
    if (deepLink.startsWith("http://") || deepLink.startsWith("https://")) return true;
    if (deepLink.startsWith("/") && deepLink.length > 1) return true;
    if (/^[a-zA-Z(]/.test(deepLink)) return true;
    return false;
  })();

  const onClose = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/notifications" as never);
  }, [router]);

  const onDelete = useCallback(async () => {
    if (!item) return;
    setDeleting(true);
    try {
      const ids = siblingNotificationIds(allItems.length ? allItems : [item], item);
      await addDismissedNotificationIds(ids);
      showToast("Notification deleted");
      onClose();
    } finally {
      setDeleting(false);
    }
  }, [allItems, item, onClose]);

  const requestDeleteConfirm = useCallback(() => {
    if (!item || deleting) return;
    Alert.alert(
      "Delete notification?",
      item.title?.trim() || "Remove this notification?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void onDelete();
          },
        },
      ]
    );
  }, [deleting, item, onDelete]);

  const onOpenLinked = useCallback(() => {
    if (orderPath) {
      try {
        router.replace(orderPath as never);
      } catch {
        showToast("Order unavailable");
      }
      return;
    }
    if (!deepLink || !canOpenLink) return;
    if (deepLink.startsWith("http://") || deepLink.startsWith("https://")) {
      void Linking.openURL(deepLink);
      return;
    }
    try {
      router.replace(deepLink as never);
    } catch {
      showToast("Link unavailable");
    }
  }, [canOpenLink, deepLink, orderPath, router]);

  const headerPad = Math.max(insets.top - 4, 6);
  // Half of content width for each footer button (padding + gap accounted for).
  const halfBtnWidth = Math.max((windowWidth - H_PADDING * 2 - 12) / 2, 120);

  if (!item && !loading) {
    return (
      <>
        <AndroidBackHandler />
        <View style={styles.root}>
          <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />
          <StatusBar style="dark" />
          <View style={[styles.header, { paddingTop: headerPad }]}>
            <Pressable onPress={onClose} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
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
      </>
    );
  }

  if (!item) {
    return (
      <View style={[styles.root, styles.loadingRoot]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const when = formatNotificationDateTime(item.queued_at);

  return (
    <>
      <AndroidBackHandler />
      <View style={styles.root}>
        <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />
        <StatusBar style="dark" />

        <View style={[styles.header, { paddingTop: headerPad }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Notification</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.iconWrap}>
                <Ionicons name={ICON_MAP[type]} size={24} color={ICON_COLOR[type]} />
              </View>
              <Text style={styles.title}>{item.title?.trim() || "Notification"}</Text>
            </View>
            {when ? <Text style={styles.time}>{when}</Text> : null}
            <Text style={styles.body}>{item.body?.trim() || ""}</Text>
          </View>

          {canOpenLink ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onOpenLinked}
              style={styles.openLinkBtn}
            >
              <Ionicons name="open-outline" size={18} color={COLORS.primary} />
              <RNText style={styles.openLinkText}>
                {orderPath ? "View order" : deepLink.startsWith("http") ? "Open link" : "Open"}
              </RNText>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        {/* Merchant-style bottom row: Close | Delete at 50% each */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClose}
            style={{ width: halfBtnWidth }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <View style={[styles.ctaBtnInner, styles.ctaCloseInner, { width: halfBtnWidth }]}>
              <RNText style={styles.ctaCloseText}>Close</RNText>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={requestDeleteConfirm}
            style={{ width: halfBtnWidth }}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          >
            <View style={[styles.ctaBtnInner, styles.ctaDeleteInner, { width: halfBtnWidth }]}>
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <RNText style={styles.ctaDeleteText}>Delete</RNText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </>
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
    paddingBottom: 8,
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
  headerSpacer: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    alignItems: "stretch",
  },
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.9)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: LORA_BOLD,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  time: {
    marginTop: 12,
    fontSize: 13,
    fontFamily: LORA,
    color: COLORS.textTertiary,
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: LORA,
    color: COLORS.textSecondary,
  },
  openLinkBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  openLinkText: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    color: COLORS.primary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: "#FFFFFF",
  },
  ctaBtnInner: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  ctaCloseInner: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#94A3B8",
  },
  ctaCloseText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  ctaDeleteInner: {
    backgroundColor: COLORS.error,
  },
  ctaDeleteText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: "700",
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
    color: COLORS.textPrimary,
  },
  missingBody: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: LORA,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  closeBtn: {
    marginTop: 20,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 15,
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.75 },
});
