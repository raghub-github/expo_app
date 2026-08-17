/**
 * Light-theme customer review for a completed order.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { useMerchantGoBack } from "@/lib/merchantNavigation";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrdersContext } from "@/context/OrdersContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import { ViewOrderDetailsMenu } from "@/components/order/ViewOrderDetailsMenu";
import { openOrderDetailOnce } from "@/lib/openOrderDetailOnce";
import { fetchStoreReviews, replyToStoreReview } from "@/services/ratingsApi";
import { fetchFoodOrder } from "@/services/ordersApi";
import { mapApiOrder, type OrderRecord, type StoreOrderRating } from "@/hooks/useOrders";

const IST = "Asia/Kolkata";
const BADGE_GREEN = "#22C55E";

function parseFoodId(raw: string): number | null {
  if (!raw || raw.startsWith("core-")) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Customer";
  return trimmed.split(/\s+/)[0] ?? "Customer";
}

function formatReviewWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const time = new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: IST,
    }).format(d);
    const today = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: IST,
    }).format(new Date());
    const day = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: IST,
    }).format(d);
    if (day === today) return `today, ${time}`;
    return `${day}, ${time}`;
  } catch {
    return "";
  }
}

export default function OrderReviewScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const goBack = useMerchantGoBack("/(tabs)/orders?tab=completed");
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { orders: boardOrders } = useOrdersContext();

  const routeId = Array.isArray(rawId) ? rawId[0] ?? "" : String(rawId ?? "");
  const foodId = parseFoodId(routeId);

  const boardOrder = useMemo(
    () => (foodId != null ? boardOrders.find((o) => o.id === String(foodId)) ?? null : null),
    [boardOrders, foodId]
  );

  const [order, setOrder] = useState<OrderRecord | null>(boardOrder);
  const [review, setReview] = useState<StoreOrderRating | null>(boardOrder?.storeRating ?? null);
  const [customerName, setCustomerName] = useState(boardOrder?.customerName ?? "Customer");
  const [loading, setLoading] = useState(!boardOrder?.storeRating);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState(false);

  const storeId = order?.merchantStoreId ?? selectedStore?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (foodId == null || !token) {
        setLoading(false);
        setError("Review not found.");
        return;
      }
      setError(null);
      if (!boardOrder?.storeRating) setLoading(true);
      try {
        let nextOrder = boardOrder;
        if (!nextOrder && storeId) {
          const api = await fetchFoodOrder(storeId, foodId, token);
          nextOrder = mapApiOrder(api, {
            storeId,
            storeName: selectedStore?.store_name ?? null,
            storeLocality: selectedStore?.city ?? null,
          });
        }
        if (cancelled) return;
        if (nextOrder) {
          setOrder(nextOrder);
          setCustomerName(nextOrder.customerName);
          if (nextOrder.storeRating) setReview(nextOrder.storeRating);
        }

        const sid = nextOrder?.merchantStoreId ?? storeId ?? selectedStore?.id;
        const coreId = nextOrder?.ordersCoreId;
        if (sid && coreId && coreId > 0) {
          const data = await fetchStoreReviews({ token, storeId: sid, orderId: coreId });
          const row = data.data?.[0];
          if (row && !cancelled) {
            setReview({
              reviewId: row.id,
              rating: row.overallRating,
              reviewText: row.reviewText,
              reviewTitle: row.reviewTitle,
              createdAt: row.createdAt,
              replyText: row.replyText ?? null,
              repliedAt: row.repliedAt ?? null,
            });
            if (row.customerName) setCustomerName(row.customerName);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load review.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    boardOrder,
    foodId,
    selectedStore?.city,
    selectedStore?.id,
    selectedStore?.store_name,
    storeId,
    token,
  ]);

  const storeLine = useMemo(() => {
    const name =
      order?.merchantStoreName?.trim() || selectedStore?.store_name?.trim() || "";
    const locality = order?.merchantStoreLocality?.trim() || selectedStore?.city?.trim() || "";
    if (name && locality) return `${name}, ${locality}`;
    return name || locality;
  }, [order?.merchantStoreLocality, order?.merchantStoreName, selectedStore?.city, selectedStore?.store_name]);

  const orderLabel = useMemo(() => {
    const id = formatOrderIdDisplay(order?.formattedOrderId, order?.ordersCoreId ?? 0);
    return storeLine ? `Order ${id} • ${storeLine}` : `Order ${id}`;
  }, [order?.formattedOrderId, order?.ordersCoreId, storeLine]);

  const ordersWithYou =
    order?.customerStoreOrdersTotal ?? order?.customerStoreOrderOrdinal ?? 1;

  const openOrderDetails = useCallback(() => {
    const id = String(order?.id ?? foodId ?? "").trim();
    if (!id || id.startsWith("core-")) return;
    openOrderDetailOnce(router, id, { currentPath: "/order-review/" });
  }, [foodId, order?.id, router]);

  const handleSend = useCallback(async () => {
    const text = replyText.trim();
    if (!text || !review || !token || !storeId) return;
    setSaving(true);
    try {
      await replyToStoreReview({
        token,
        storeId,
        reviewId: review.reviewId,
        replyText: text,
      });
      setReview((prev) =>
        prev
          ? { ...prev, replyText: text, repliedAt: new Date().toISOString() }
          : prev
      );
      setReplyText("");
    } catch {
      setError("Could not send reply.");
    } finally {
      setSaving(false);
    }
  }, [replyText, review, storeId, token]);

  const stars = Math.min(5, Math.max(1, Math.round(review?.rating ?? 0)));
  const reviewBody = review?.reviewText?.trim() || review?.reviewTitle?.trim() || "";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Review</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {orderLabel}
          </Text>
        </View>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
      </View>

      {loading && !review ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
        </View>
      ) : error && !review ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : review ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color="#6B7280" />
            </View>
            <View style={styles.profileText}>
              <Text style={styles.customerName}>{firstName(customerName)}</Text>
              <Text style={styles.ordersMeta}>
                {ordersWithYou} {ordersWithYou === 1 ? "order" : "orders"} with you
              </Text>
            </View>
          </View>

          <Pressable
            onPress={openOrderDetails}
            style={({ pressed }) => [styles.bubbleWrap, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View order details"
          >
            <View style={styles.bubblePointer} />
            <View style={styles.bubble}>
              <View style={styles.bubbleTop}>
                <View style={styles.ratingBadge}>
                  <Text style={styles.ratingBadgeText}>{stars}</Text>
                  <Ionicons name="star" size={11} color="#FFFFFF" />
                </View>
                <Text style={styles.when}>{formatReviewWhen(review.createdAt)}</Text>
              </View>
              {reviewBody ? <Text style={styles.bubbleBody}>{reviewBody}</Text> : null}
            </View>
          </Pressable>

          {review.replyText ? (
            <View style={styles.replyBubble}>
              <Text style={styles.replyLabel}>Your reply</Text>
              <Text style={styles.replyBody}>{review.replyText}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.muted}>No review for this order yet.</Text>
        </View>
      )}

      {review ? (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            placeholder="Type your reply"
            placeholderTextColor="#9CA3AF"
            value={replyText}
            onChangeText={setReplyText}
            multiline
            editable={!saving}
          />
          <Pressable
            onPress={() => void handleSend()}
            disabled={saving || !replyText.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              (!replyText.trim() || saving) && styles.sendBtnDisabled,
              pressed && replyText.trim() ? styles.pressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send reply"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      ) : null}

      <ViewOrderDetailsMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onViewDetails={openOrderDetails}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  headerTitles: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  pressed: { opacity: 0.72 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: GatiMitraMerchant.error,
    textAlign: "center",
  },
  muted: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 18,
    paddingBottom: 24,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: { flex: 1, minWidth: 0 },
  customerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  ordersMeta: {
    marginTop: 2,
    fontSize: 13,
    color: "#6B7280",
  },
  bubbleWrap: { marginLeft: 8 },
  bubblePointer: {
    position: "absolute",
    top: 10,
    left: 8,
    width: 12,
    height: 12,
    backgroundColor: "#F3F4F6",
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
  bubble: {
    marginLeft: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  bubbleTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: BADGE_GREEN,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  when: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  bubbleBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#111827",
  },
  replyBubble: {
    marginTop: 12,
    marginLeft: 56,
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  replyBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#14532D",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
});
