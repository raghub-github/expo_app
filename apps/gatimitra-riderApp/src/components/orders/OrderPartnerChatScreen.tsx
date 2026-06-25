/**
 * In-app chat with customer during live order — mirrors customer partner-chat UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  orderPartnerChatService,
  type OrderPartnerChatMessage,
} from "@/src/services/orderPartnerChat.service";
import { partnerChatUnreadQueryKey } from "@/src/hooks/usePartnerChatUnread";
import { useKeyboardBottomInset } from "@/src/hooks/useKeyboardBottomInset";
import { useActiveOrders } from "@/src/hooks/useOrders";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { extractApiErrorMessage } from "@/src/services/http";
import { parseChatSharedLocation } from "@/src/lib/parse-chat-shared-location";
import { CustomerSharedLocationChatBubble } from "@/src/components/orders/CustomerSharedLocationChatBubble";
import { colors } from "@/src/theme";

const MINT = colors.primary[500];
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const BANNER_BG = "#FFF7ED";
const BANNER_TEXT = "#92400E";
const SEND_ORANGE = colors.brandOrange[500];
const POLL_MS = 3500;

type QuickReplyIcon = {
  family: "ionicons" | "material";
  name: keyof typeof Ionicons.glyphMap | keyof typeof MaterialCommunityIcons.glyphMap;
};

type DropQuickReply = {
  id: string;
  messageKey: string;
  defaultMessage: string;
  icon: QuickReplyIcon;
};

type PickupQuickReply = {
  id: string;
  messageKey: string;
  defaultMessage: string;
};

const PICKUP_QUICK_REPLIES: PickupQuickReply[] = [
  {
    id: "onTheWay",
    messageKey: "orders.partnerChat.quickReplies.onTheWay",
    defaultMessage: "🚗 I'm on the way",
  },
  {
    id: "reachedPickup",
    messageKey: "orders.partnerChat.quickReplies.reachedPickup",
    defaultMessage: "📍 I've reached the pickup location",
  },
  {
    id: "answerCall",
    messageKey: "orders.partnerChat.quickReplies.answerCallPickup",
    defaultMessage: "📞 Please answer my call",
  },
  {
    id: "arriveSoon",
    messageKey: "orders.partnerChat.quickReplies.arriveSoon",
    defaultMessage: "⏳ I'll arrive in a few minutes",
  },
  {
    id: "stuckInTraffic",
    messageKey: "orders.partnerChat.quickReplies.stuckInTraffic",
    defaultMessage: "🚦 Stuck in traffic, please wait",
  },
  {
    id: "shareLocation",
    messageKey: "orders.partnerChat.quickReplies.shareLocation",
    defaultMessage: "📍 Please share your exact location",
  },
  {
    id: "waitingAtPickup",
    messageKey: "orders.partnerChat.quickReplies.waitingAtPickup",
    defaultMessage: "👋 I'm waiting at the pickup point",
  },
  {
    id: "cantFindLocation",
    messageKey: "orders.partnerChat.quickReplies.cantFindLocation",
    defaultMessage: "🔍 I can't find your location",
  },
];

const DROP_QUICK_REPLIES: DropQuickReply[] = [
  {
    id: "arrived",
    messageKey: "orders.partnerChat.quickReplies.arrived",
    defaultMessage: "I've arrived at your location.",
    icon: { family: "ionicons", name: "location-outline" },
  },
  {
    id: "answerCall",
    messageKey: "orders.partnerChat.quickReplies.answerCall",
    defaultMessage: "Please answer my call.",
    icon: { family: "ionicons", name: "call-outline" },
  },
  {
    id: "entrance",
    messageKey: "orders.partnerChat.quickReplies.entrance",
    defaultMessage: "I'm at the entrance/gate.",
    icon: { family: "material", name: "door-open" },
  },
  {
    id: "wait",
    messageKey: "orders.partnerChat.quickReplies.wait",
    defaultMessage: "I'll wait for a few minutes.",
    icon: { family: "ionicons", name: "hourglass-outline" },
  },
];

function QuickReplyIconView({ icon }: { icon: QuickReplyIcon }) {
  if (icon.family === "material") {
    return (
      <MaterialCommunityIcons
        name={icon.name as keyof typeof MaterialCommunityIcons.glyphMap}
        size={15}
        color={MINT}
      />
    );
  }
  return (
    <Ionicons
      name={icon.name as keyof typeof Ionicons.glyphMap}
      size={15}
      color={MINT}
    />
  );
}

function paramOne(value: string | string[] | undefined): string {
  if (value == null) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Person-ride pickup quick replies stay until rider marks reach pickup. */
function isPersonRideBeforeReachPickup(order: RiderOrderSummary): boolean {
  if (order.category !== "ride") return false;
  if (order.atCustomer || order.rideStarted) return false;
  return !(
    order.atPickup ||
    order.pickupOtpVerified ||
    order.pickupWaitStartedAt
  );
}

export function OrderPartnerChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    orderId?: string | string[];
    customerName?: string | string[];
    orderLabel?: string | string[];
    customerPhone?: string | string[];
    atDrop?: string | string[];
    atPickup?: string | string[];
  }>();

  const orderId = paramOne(params.orderId);
  const customerName = paramOne(params.customerName) || t("orders.partnerChat.customerFallback", "Customer");
  const orderLabel = paramOne(params.orderLabel) || t("orders.partnerChat.orderFallback", "Live order");
  const customerPhone = paramOne(params.customerPhone);
  const atDrop = paramOne(params.atDrop) === "1" || paramOne(params.atDrop) === "true";
  const atPickup = paramOne(params.atPickup) === "1" || paramOne(params.atPickup) === "true";

  const [draft, setDraft] = useState("");
  const [dropQuickReplyDismissed, setDropQuickReplyDismissed] = useState(false);
  const keyboardInset = useKeyboardBottomInset();

  const { data: activeOrders = [] } = useActiveOrders();
  const activeOrder = useMemo(
    () => activeOrders.find((o) => o.id === orderId),
    [activeOrders, orderId]
  );

  const personRideBeforeReach = activeOrder
    ? isPersonRideBeforeReachPickup(activeOrder)
    : atPickup;

  const queryKey = useMemo(() => ["order-partner-chat", orderId] as const, [orderId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => orderPartnerChatService.listMessages(orderId),
    enabled: Boolean(orderId),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const chatClosed = data?.chatClosed ?? false;
  const messages = data?.messages ?? [];
  const showPickupQuickReplies = personRideBeforeReach && !chatClosed;
  const showDropQuickReplies = atDrop && !chatClosed && !dropQuickReplyDismissed;
  const showQuickReplies = showPickupQuickReplies || showDropQuickReplies;

  useEffect(() => {
    if (!orderId || !data) return;
    queryClient.setQueryData(partnerChatUnreadQueryKey(orderId), { unreadCount: 0 });
  }, [orderId, data, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => orderPartnerChatService.sendMessage(orderId, body),
    onSuccess: (msg) => {
      queryClient.setQueryData<{ messages: OrderPartnerChatMessage[]; chatClosed: boolean }>(
        queryKey,
        (prev) => {
          const list = prev?.messages ?? [];
          if (list.some((m) => m.id === msg.id)) return prev ?? { messages: list, chatClosed };
          return {
            chatClosed: prev?.chatClosed ?? false,
            messages: [...list, msg],
          };
        }
      );
      setDraft("");
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    onError: (e) => {
      Alert.alert(
        t("orders.partnerChat.sendFailedTitle", "Could not send"),
        extractApiErrorMessage(e, t("orders.partnerChat.sendFailedMessage", "Please try again."))
      );
    },
  });

  useEffect(() => {
    if (!showDropQuickReplies || dropQuickReplyDismissed) return;
    const quickTexts = DROP_QUICK_REPLIES.map((item) =>
      t(item.messageKey, item.defaultMessage).trim()
    );
    const alreadySent = messages.some(
      (m) => m.isMine && quickTexts.includes(m.body.trim())
    );
    if (alreadySent) setDropQuickReplyDismissed(true);
  }, [showDropQuickReplies, dropQuickReplyDismissed, messages, t]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
    }
  }, [messages.length]);

  useEffect(() => {
    if (keyboardInset <= 0) return;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [keyboardInset]);

  const handleCall = useCallback(() => {
    const digits = customerPhone.replace(/\D/g, "");
    const phone =
      digits.length === 10
        ? `+91${digits}`
        : customerPhone.startsWith("+")
          ? customerPhone
          : digits
            ? `+${digits}`
            : "";
    if (!phone) {
      Alert.alert(
        t("orders.partnerChat.noPhoneTitle", "Phone unavailable"),
        t("orders.partnerChat.noPhoneMessage", "Customer phone is not available for this order.")
      );
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert(t("orders.partnerChat.callFailedTitle", "Could not call"))
    );
  }, [customerPhone, t]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || chatClosed || sendMutation.isPending) return;
    sendMutation.mutate(text);
  }, [draft, chatClosed, sendMutation]);

  const handleQuickSend = useCallback(
    (text: string, dismissDropReplies = false) => {
      if (chatClosed || sendMutation.isPending) return;
      if (dismissDropReplies) setDropQuickReplyDismissed(true);
      sendMutation.mutate(text);
    },
    [chatClosed, sendMutation]
  );

  const renderBubble = (m: OrderPartnerChatMessage) => {
    if (m.senderType === "SYSTEM") {
      return (
        <View key={m.id} style={styles.systemBubbleWrap}>
          <Text style={styles.systemBubble}>{m.body}</Text>
        </View>
      );
    }

    const sharedLocation = parseChatSharedLocation(m.body);
    if (sharedLocation) {
      return (
        <View
          key={m.id}
          style={m.isMine ? styles.mineLocationWrap : styles.theirBubbleWrap}
        >
          <CustomerSharedLocationChatBubble
            location={sharedLocation}
            timeLabel={formatTime(m.createdAt)}
          />
        </View>
      );
    }

    if (m.isMine) {
      return (
        <View key={m.id} style={styles.mineBubbleWrap}>
          <View style={styles.mineBubble}>
            <Text style={styles.mineBubbleText}>{m.body}</Text>
          </View>
          <Text style={styles.timeLabel}>{formatTime(m.createdAt)}</Text>
        </View>
      );
    }
    return (
      <View key={m.id} style={styles.theirBubbleWrap}>
        <View style={styles.theirBubble}>
          <Text style={styles.theirBubbleText}>{m.body}</Text>
        </View>
        <Text style={styles.timeLabelLeft}>{formatTime(m.createdAt)}</Text>
      </View>
    );
  };

  const composerBottomPad = keyboardInset > 0 ? 8 : Math.max(insets.bottom, 10);
  const shellStyle = [
    styles.screen,
    Platform.OS === "android" && keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
  ];
  const Root = Platform.OS === "ios" ? KeyboardAvoidingView : View;
  const rootProps =
    Platform.OS === "ios"
      ? {
          behavior: "padding" as const,
          keyboardVerticalOffset: insets.top,
        }
      : {};

  return (
    <>
      <StatusBar style="dark" />
      <Root style={shellStyle} {...rootProps}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{customerName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {customerName}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {orderLabel}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleCall} hitSlop={12} style={styles.headerSide}>
            <Ionicons name="call-outline" size={22} color={MINT} />
          </TouchableOpacity>
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerEmoji}>🛵</Text>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>
              {t("orders.partnerChat.bannerTitle", "You may be on the road")}
            </Text>
            <Text style={styles.bannerSub}>
              {t(
                "orders.partnerChat.bannerSub",
                "Reply when safe. Customer sees messages in the app."
              )}
            </Text>
          </View>
        </View>

        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={MINT} />
          </View>
        ) : error && messages.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>
              {extractApiErrorMessage(error, t("orders.partnerChat.loadFailed", "Could not load chat."))}
            </Text>
            <TouchableOpacity onPress={() => void refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>{t("common.retry", "Retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={[styles.messagesContent, { paddingBottom: 12 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <View style={styles.systemBubbleWrap}>
                <Text style={styles.systemBubble}>
                  {t(
                    "orders.partnerChat.emptyHint",
                    "Say hi to the customer about pickup, OTP, or delivery."
                  )}
                </Text>
              </View>
            ) : (
              messages.map(renderBubble)
            )}
          </ScrollView>
        )}

        {chatClosed ? (
          <View style={[styles.closedBar, { paddingBottom: composerBottomPad }]}>
            <Text style={styles.closedText}>
              {t("orders.partnerChat.closed", "Chat closed — order completed.")}
            </Text>
          </View>
        ) : (
          <>
            {showPickupQuickReplies ? (
              <ScrollView
                style={styles.quickReplyList}
                contentContainerStyle={styles.pickupQuickReplyContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {PICKUP_QUICK_REPLIES.map((item) => {
                  const label = t(item.messageKey, item.defaultMessage);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.quickReplyRowItem}
                      onPress={() => handleQuickSend(label)}
                      disabled={sendMutation.isPending}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.quickReplyText} numberOfLines={2}>
                        {label}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#C4C4C4" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : showDropQuickReplies ? (
              <View style={styles.quickReplyList}>
                {DROP_QUICK_REPLIES.map((item) => {
                  const label = t(item.messageKey, item.defaultMessage);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.quickReplyRowItem}
                      onPress={() => handleQuickSend(label, true)}
                      disabled={sendMutation.isPending}
                      activeOpacity={0.85}
                    >
                      <View style={styles.quickReplyIconWrap}>
                        <QuickReplyIconView icon={item.icon} />
                      </View>
                      <Text style={styles.quickReplyText} numberOfLines={1}>
                        {label}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#C4C4C4" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <View
              style={[
                styles.composer,
                { paddingBottom: composerBottomPad },
                !showQuickReplies && styles.composerBorderTop,
              ]}
            >
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder={t("orders.partnerChat.placeholder", "Type your message here...")}
                  placeholderTextColor="#9CA3AF"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={500}
                  editable={!sendMutation.isPending}
                  onFocus={() => {
                    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
                  }}
                />
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, (!draft.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!draft.trim() || sendMutation.isPending}
                activeOpacity={0.85}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </Root>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  headerSide: { width: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: { fontSize: 16, fontWeight: "700", color: colors.primary[700] },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 15, fontWeight: "700", color: TEXT },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: BANNER_BG,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#FDE68A",
  },
  bannerEmoji: { fontSize: 22 },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { fontSize: 13, fontWeight: "700", color: BANNER_TEXT },
  bannerSub: { fontSize: 12, color: "#B45309", marginTop: 2, lineHeight: 17 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 13, color: MUTED, textAlign: "center", marginBottom: 12 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary[50] },
  retryText: { fontSize: 13, fontWeight: "600", color: colors.primary[700] },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 14, paddingTop: 16 },
  systemBubbleWrap: { alignItems: "center", marginBottom: 12 },
  systemBubble: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: "88%",
  },
  mineBubbleWrap: { alignItems: "flex-end", marginBottom: 10 },
  mineLocationWrap: { alignItems: "flex-end", marginBottom: 10, maxWidth: "100%" },
  mineBubble: {
    maxWidth: "82%",
    backgroundColor: MINT,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mineBubbleText: { fontSize: 14, color: "#fff", lineHeight: 20 },
  theirBubbleWrap: { alignItems: "flex-start", marginBottom: 10 },
  theirBubble: {
    maxWidth: "82%",
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  theirBubbleText: { fontSize: 14, color: TEXT, lineHeight: 20 },
  timeLabel: { fontSize: 10, color: MUTED, marginTop: 4, marginRight: 4 },
  timeLabelLeft: { fontSize: 10, color: MUTED, marginTop: 4, marginLeft: 4 },
  quickReplyList: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    maxHeight: 220,
  },
  pickupQuickReplyContent: {
    gap: 6,
    paddingBottom: 2,
  },
  quickReplyRowItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8EAED",
    backgroundColor: "#FAFAFA",
    gap: 10,
  },
  quickReplyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  quickReplyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: TEXT,
    lineHeight: 18,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: "#fff",
  },
  composerBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 22,
    paddingHorizontal: 14,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: "#FAFAFA",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: TEXT,
    paddingVertical: 10,
    maxHeight: 96,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SEND_ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.45 },
  closedBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  closedText: { fontSize: 13, color: MUTED, textAlign: "center" },
});
