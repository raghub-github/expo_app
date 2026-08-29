/**
 * Light-theme review/complaint reply screen.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { useMerchantGoBack } from "@/lib/merchantNavigation";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import {
  fetchStoreComplaints,
  fetchStoreReviews,
  replyToStoreReview,
} from "@/services/ratingsApi";
import { FeedbackImageRow } from "@/components/FeedbackImageRow";
import { FeedbackCustomerAvatar } from "@/components/FeedbackCustomerAvatar";
import { ViewOrderDetailsMenu } from "@/components/order/ViewOrderDetailsMenu";
import { openOrderDetailOnce } from "@/lib/openOrderDetailOnce";
import {
  getFeedbackReplySnapshot,
  setFeedbackReplySnapshot,
  type FeedbackReplySnapshot,
} from "@/lib/feedbackReplyCache";
import { parseMerchantReviewReplies } from "@/lib/merchantReviewReplies";

type ThreadItem = FeedbackReplySnapshot;

const IME_TOOLBAR_CLEARANCE = 48;
const BADGE_GREEN = "#22C55E";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Kolkata" });
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Kolkata" });
  const year = d.toLocaleDateString("en-GB", { year: "numeric", timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  return `${day} ${month}, ${year} ${time}`;
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Customer";
  return trimmed.split(/\s+/)[0] ?? "Customer";
}

function orderLine(formattedOrderId?: string | null, storeHeading?: string): string {
  const raw = (formattedOrderId ?? "").trim();
  const order = !raw
    ? "Order"
    : /^order\b/i.test(raw)
      ? raw
      : raw.startsWith("#")
        ? `Order ${raw}`
        : `Order #${raw.replace(/^#/, "")}`;
  const store = (storeHeading ?? "").trim();
  return store ? `${order} • ${store}` : order;
}

function ratingBadgeColor(rating: number): string {
  if (rating >= 4) return BADGE_GREEN;
  if (rating >= 3) return GatiMitraMerchant.warning;
  return GatiMitraMerchant.error;
}

export default function FeedbackReplyScreen() {
  const raw = useLocalSearchParams<{ id?: string | string[]; kind?: string | string[] }>();
  const idRaw = Array.isArray(raw.id) ? raw.id[0] : raw.id;
  const id = Number(idRaw);
  const kind = (Array.isArray(raw.kind) ? raw.kind[0] : raw.kind) === "complaint" ? "complaint" : "review";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useMerchantGoBack(kind === "complaint" ? "/(tabs)/complaints" : "/(tabs)/reviews");
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();

  const cached = Number.isFinite(id) && id > 0 ? getFeedbackReplySnapshot(id) : null;
  const [item, setItem] = useState<ThreadItem | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const applyLift = (e: KeyboardEvent) => {
      const kb = Math.max(0, e.endCoordinates?.height ?? 0);
      if (Platform.OS === "ios") {
        setKeyboardLift(kb);
        return;
      }
      const winH = Dimensions.get("window").height;
      const screenH = Dimensions.get("screen").height;
      const shrunk = Math.max(0, screenH - winH);
      setKeyboardLift(Math.max(0, kb - shrunk) + IME_TOOLBAR_CLEARANCE);
    };
    const show = Keyboard.addListener(showEvent, applyLift);
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const load = useCallback(async () => {
    const paramsReady = idRaw != null && String(idRaw).trim() !== "";
    if (!paramsReady || !Number.isInteger(id) || id < 1) {
      if (paramsReady) {
        setItem(null);
        setLoading(false);
      }
      return;
    }

    const snapshot = getFeedbackReplySnapshot(id);
    if (snapshot) {
      setItem(snapshot);
      setLoading(false);
    }

    if (!selectedStore?.id || !token) {
      if (!snapshot) setLoading(true);
      return;
    }

    if (!snapshot) setLoading(true);
    setError(null);
    try {
      if (kind === "complaint") {
        const data = await fetchStoreComplaints({ token, storeId: selectedStore.id });
        const found = (data.data ?? []).find((c) => Number(c.id) === id) ?? null;
        if (found) {
          const next: ThreadItem = {
            ...found,
            id: Number(found.id),
            source: found.source === "ticket" ? "ticket" : "rating",
          };
          setItem(next);
          setFeedbackReplySnapshot(next);
        } else if (!snapshot) {
          setItem(null);
        }
      } else {
        const data = await fetchStoreReviews({
          token,
          storeId: selectedStore.id,
          reviewId: id,
        });
        const found = (data.data ?? []).find((r) => Number(r.id) === id) ?? null;
        if (found) {
          const next: ThreadItem = { ...found, id: Number(found.id), source: "rating" };
          setItem(next);
          setFeedbackReplySnapshot(next);
        } else if (!snapshot) {
          setItem(null);
        }
      }
    } catch (e) {
      if (!snapshot) {
        setError(e instanceof Error ? e.message : "Could not load this feedback.");
      }
    } finally {
      setLoading(false);
    }
  }, [id, idRaw, kind, selectedStore?.id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const isTicket = item?.source === "ticket";
  const threadReplies = parseMerchantReviewReplies(
    item?.replies,
    item?.replyText,
    item?.repliedAt ?? item?.createdAt,
  );

  const handleSend = async () => {
    if (!selectedStore?.id || !token || !item || isTicket || !draft.trim()) return;
    try {
      setSaving(true);
      await replyToStoreReview({
        token,
        storeId: selectedStore.id,
        reviewId: Number(item.id),
        replyText: draft.trim(),
      });
      const nextText = draft.trim();
      const nextAt = new Date().toISOString();
      setDraft("");
      Keyboard.dismiss();
      setItem((prev) => {
        if (!prev) return prev;
        const prevReplies = parseMerchantReviewReplies(
          prev.replies,
          prev.replyText,
          prev.repliedAt ?? prev.createdAt,
        );
        const next = {
          ...prev,
          replyText: nextText,
          repliedAt: nextAt,
          replies: [...prevReplies, { text: nextText, at: nextAt }],
        };
        setFeedbackReplySnapshot(next);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save reply.");
    } finally {
      setSaving(false);
    }
  };

  const title = kind === "complaint" ? "Complaint" : "Review";
  const storeHeading = [selectedStore?.store_name?.trim(), selectedStore?.city?.trim()]
    .filter(Boolean)
    .join(", ");
  const headerOrderLine = item ? orderLine(item.formattedOrderId, storeHeading) : "";
  const body = (item?.reviewText || item?.reviewTitle || "").trim();
  const rounded = item ? Math.round(item.overallRating) : 0;
  const customerName = item?.customerName?.trim() || "Customer";
  const orderCount = Number(item?.orderCount);
  const ordersLabel =
    Number.isFinite(orderCount) && orderCount > 0
      ? `${orderCount} ${orderCount === 1 ? "order" : "orders"} with you`
      : "Customer";
  const canOpenOrder = Boolean(item?.foodOrderId);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        <Pressable
          onPress={() => (canOpenOrder ? setMenuOpen(true) : undefined)}
          disabled={!canOpenOrder}
          style={({ pressed }) => [styles.iconBtn, pressed && canOpenOrder ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons
            name="ellipsis-vertical"
            size={20}
            color={canOpenOrder ? GatiMitraMerchant.textPrimary : GatiMitraMerchant.textTertiary}
          />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={GatiMitraMerchant.navy} />
        </View>
      ) : error && !item ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : item ? (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <Text style={styles.orderLine} numberOfLines={2}>
              {headerOrderLine}
            </Text>

            <View style={styles.profileRow}>
              <FeedbackCustomerAvatar
                uri={item.customerAvatarUrl}
                name={customerName}
                token={token}
                size={44}
              />
              <View style={styles.profileText}>
                <Text style={styles.customerName}>{firstName(customerName)}</Text>
                <Text style={styles.ordersMeta}>{ordersLabel}</Text>
              </View>
            </View>

            <View style={styles.bubbleWrap}>
              <View style={styles.bubblePointer} />
              <View style={styles.customerBubble}>
                <View style={[styles.bubbleTop, body ? styles.bubbleTopSpaced : null]}>
                  {rounded > 0 ? (
                    <View style={[styles.ratingBadge, { backgroundColor: ratingBadgeColor(rounded) }]}>
                      <Text style={styles.ratingBadgeText}>{rounded}</Text>
                      <Ionicons name="star" size={11} color="#FFFFFF" />
                    </View>
                  ) : null}
                  <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
                </View>
                {body ? <Text style={styles.bubbleBody}>{body}</Text> : null}
                <FeedbackImageRow urls={item.reviewImages} token={token} />
              </View>
            </View>

            {threadReplies.map((reply, idx) => (
              <View key={`${reply.at}-${idx}`} style={styles.youWrap}>
                <View style={styles.youBubble}>
                  <Text style={styles.youLabel}>You</Text>
                  <Text style={styles.youBody}>{reply.text}</Text>
                  {reply.at ? <Text style={styles.youWhen}>{formatWhen(reply.at)}</Text> : null}
                </View>
              </View>
            ))}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          {!isTicket ? (
            <View
              style={[
                styles.composer,
                {
                  paddingBottom: keyboardLift > 0 ? 8 : Math.max(insets.bottom, 12),
                  marginBottom: keyboardLift,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="Type your reply"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!saving}
              />
              <Pressable
                onPress={() => void handleSend()}
                disabled={saving || !draft.trim()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!draft.trim() || saving) && styles.sendBtnDisabled,
                  pressed && draft.trim() ? styles.pressed : null,
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
          ) : isTicket ? (
            <View style={[styles.ticketBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Text style={styles.ticketBarText}>This is a support ticket. Replies are handled in Help.</Text>
            </View>
          ) : (
            <View style={{ height: Math.max(insets.bottom, 8) }} />
          )}
        </>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.muted}>This feedback is no longer available.</Text>
        </View>
      )}

      <ViewOrderDetailsMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onViewDetails={() => {
          if (!item?.foodOrderId) return;
          openOrderDetailOnce(router, String(item.foodOrderId));
        }}
      />
    </View>
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
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  headerTitles: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
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
    backgroundColor: "#FFFFFF",
  },
  errorText: {
    fontSize: 14,
    color: GatiMitraMerchant.error,
    textAlign: "center",
    marginTop: 8,
  },
  muted: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  scroll: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 24,
  },
  orderLine: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  profileText: { flex: 1, minWidth: 0 },
  customerName: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  ordersMeta: {
    marginTop: 2,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  bubbleWrap: {
    marginLeft: 8,
  },
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
  customerBubble: {
    marginLeft: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bubbleTopSpaced: {
    marginBottom: 8,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
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
    flex: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "500",
  },
  bubbleBody: {
    fontSize: 15,
    lineHeight: 22,
    color: GatiMitraMerchant.textPrimary,
  },
  youWrap: {
    marginTop: 16,
    alignItems: "flex-end",
  },
  youBubble: {
    maxWidth: "82%",
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 14,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  youLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    marginBottom: 4,
  },
  youBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#FFFFFF",
  },
  youWhen: {
    marginTop: 6,
    fontSize: 11,
    color: "rgba(255,255,255,0.64)",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    backgroundColor: "#F3F4F6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: "#FFFFFF",
    textAlignVertical: "top",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  ticketBar: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  ticketBarText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
});
