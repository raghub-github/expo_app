/**
 * In-app chat with delivery partner during live food order tracking.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking, Alert, Image, ActivityIndicator, KeyboardAvoidingView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import {
  orderPartnerChatService,
  type OrderPartnerChatMessage,
} from "@/services/orderPartnerChat.service";
import { partnerChatUnreadQueryKey } from "@/hooks/usePartnerChatUnread";
import { useKeyboardBottomInset } from "@/hooks/useKeyboardBottomInset";
import { resolveRiderPickupChatCustomerView } from "@/lib/rider-pickup-chat-customer";
import { RiderPickupChatCustomerCard } from "@/components/orders/RiderPickupChatCustomerCard";
import { formatChatSharedLocationMessage } from "@/lib/chat-shared-location";
import {
  isPersonRidePartnerChat,
  PERSON_RIDE_CUSTOMER_QUICK_REPLIES,
  type PersonRideCustomerQuickReply,
} from "@/lib/person-ride-customer-chat-quick-replies";
import { useLocationStore } from "@/store/locationStore";

const MINT = GatiMitraColors.primaryMint;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const BANNER_BG = "#FFF7ED";
const BANNER_TEXT = "#92400E";
const POLL_MS = 8_000;

function paramOne(value: string | string[] | undefined): string {
  if (value == null) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function OrderPartnerChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const queryClient = useQueryClient();
  const refetchLocation = useLocationStore((s) => s.refetchLocation);
  const locationCoords = useLocationStore((s) => s.coords);
  const locationAddress = useLocationStore((s) => s.address);

  const params = useLocalSearchParams<{
    orderId?: string | string[];
    partnerName?: string | string[];
    restaurantName?: string | string[];
    partnerPhone?: string | string[];
    partnerPhoto?: string | string[];
    partnerRole?: string | string[];
    orderSubtitle?: string | string[];
    personRide?: string | string[];
  }>();

  const orderId = paramOne(params.orderId);
  const partnerName = paramOne(params.partnerName) || "Delivery partner";
  const restaurantName = paramOne(params.restaurantName) || "Your order";
  const partnerPhone = paramOne(params.partnerPhone);
  const partnerPhoto = toAbsoluteImageUrl(paramOne(params.partnerPhoto) || null);
  const partnerRole = paramOne(params.partnerRole) || "Delivery partner";
  const orderSubtitle = paramOne(params.orderSubtitle) || `${restaurantName} order`;
  const isPersonRide = isPersonRidePartnerChat({
    personRide: paramOne(params.personRide),
    partnerRole,
    orderSubtitle,
  });
  const displayPartnerRole =
    isPersonRide && partnerRole.trim().toLowerCase() === "captain"
      ? "Mitra-Sathi"
      : partnerRole;

  const [draft, setDraft] = useState("");
  const [shareLocationLoading, setShareLocationLoading] = useState(false);
  const keyboardInset = useKeyboardBottomInset();

  const queryKey = useMemo(() => ["order-partner-chat", orderId] as const, [orderId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => orderPartnerChatService.listMessages(orderId),
    enabled: Boolean(orderId),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const chatClosed = data?.chatClosed ?? false;
  const messages = data?.messages ?? [];

  const highlightCall = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.isMine || m.senderType !== "RIDER") continue;
      const view = resolveRiderPickupChatCustomerView(m.body);
      if (view?.action === "call_highlight") return true;
    }
    return false;
  }, [messages]);

  useEffect(() => {
    if (!orderId || !data) return;
    queryClient.setQueryData(partnerChatUnreadQueryKey(orderId), { unreadCount: 0 });
  }, [orderId, data, queryClient]);

  const normalizePhone = useCallback(() => {
    const digits = partnerPhone.replace(/\D/g, "");
    if (!digits) return null;
    return digits.length === 10 ? `+91${digits}` : partnerPhone.startsWith("+") ? partnerPhone : `+${digits}`;
  }, [partnerPhone]);

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
    onError: (e: Error) => {
      Alert.alert("Could not send", e.message || "Please try again.");
    },
  });

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
    const phone = normalizePhone();
    if (!phone) {
      Alert.alert("Unavailable", "Delivery partner phone is not available yet.");
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert("Could not open dialer"));
  }, [normalizePhone]);

  const handleShareLiveLocation = useCallback(
    async (prefixMessage?: string) => {
      if (chatClosed || sendMutation.isPending || shareLocationLoading) return;
      setShareLocationLoading(true);
      try {
        let lat = locationCoords?.latitude;
        let lng = locationCoords?.longitude;
        if (lat == null || lng == null) {
          await refetchLocation({ forceDevice: true });
          const fresh = useLocationStore.getState();
          lat = fresh.coords?.latitude;
          lng = fresh.coords?.longitude;
        }
        if (lat == null || lng == null) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Location needed", "Allow location access to share your pickup point.");
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
        const label =
          locationAddress?.fullAddress?.trim() ||
          locationAddress?.primary?.trim() ||
          `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const lead = prefixMessage?.trim() || "Sharing my location with you.";
        sendMutation.mutate(formatChatSharedLocationMessage(lead, label, lat, lng));
      } catch {
        Alert.alert("Could not share location", "Please try again.");
      } finally {
        setShareLocationLoading(false);
      }
    },
    [
      chatClosed,
      sendMutation,
      shareLocationLoading,
      locationCoords,
      locationAddress,
      refetchLocation,
    ]
  );

  const handleQuickReply = useCallback(
    (item: PersonRideCustomerQuickReply) => {
      if (chatClosed || sendMutation.isPending || shareLocationLoading) return;
      if (item.action === "share_location") {
        void handleShareLiveLocation(item.message);
        return;
      }
      if (item.action === "call") {
        sendMutation.mutate(item.message, {
          onSuccess: () => {
            handleCall();
          },
        });
        return;
      }
      sendMutation.mutate(item.message);
    },
    [chatClosed, sendMutation, shareLocationLoading, handleShareLiveLocation, handleCall]
  );

  const showPersonRideQuickReplies = isPersonRide && !chatClosed;

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || chatClosed || sendMutation.isPending) return;
    sendMutation.mutate(text);
  }, [draft, chatClosed, sendMutation]);

  const renderBubble = (m: OrderPartnerChatMessage) => {
    if (m.senderType === "SYSTEM") {
      return (
        <View key={m.id} style={styles.systemBubbleWrap}>
          <AppText style={styles.systemBubble}>{m.body}</AppText>
        </View>
      );
    }
    if (m.isMine) {
      return (
        <View key={m.id} style={styles.customerBubbleWrap}>
          <View style={styles.customerBubble}>
            <AppText style={styles.customerBubbleText}>{m.body}</AppText>
          </View>
          <AppText style={styles.timeLabel}>{formatTime(m.createdAt)}</AppText>
        </View>
      );
    }

    const pickupView = resolveRiderPickupChatCustomerView(m.body);
    if (pickupView) {
      return (
        <RiderPickupChatCustomerCard
          key={m.id}
          view={pickupView}
          createdAt={m.createdAt}
          timeLabel={formatTime(m.createdAt)}
          onCall={handleCall}
          onChat={() => inputRef.current?.focus()}
          onShareLocation={() => void handleShareLiveLocation()}
          shareLoading={shareLocationLoading}
        />
      );
    }

    return (
      <View key={m.id} style={styles.partnerBubbleWrap}>
        <View style={styles.partnerBubble}>
          <AppText style={styles.partnerBubbleText}>{m.body}</AppText>
        </View>
        <AppText style={styles.timeLabelLeft}>{formatTime(m.createdAt)}</AppText>
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
          keyboardVerticalOffset: 0,
        }
      : {};

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" />
      <Root style={shellStyle} {...rootProps}>
        {/* Orders stack uses translucent status bar (no global spacer) — pad header with insets.top. */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerSide}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              {partnerPhoto ? (
                <Image source={{ uri: partnerPhoto }} style={styles.headerAvatarImg} />
              ) : (
                <AppText style={styles.headerAvatarText}>{partnerName.slice(0, 1).toUpperCase()}</AppText>
              )}
            </View>
            <View style={styles.headerTextCol}>
              <AppText style={styles.headerTitle} numberOfLines={1}>
                {partnerName} ({displayPartnerRole})
              </AppText>
              <AppText style={styles.headerSub} numberOfLines={1}>
                {orderSubtitle}
              </AppText>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleCall}
            hitSlop={12}
            style={[styles.headerSide, highlightCall && styles.headerCallHighlight]}
          >
            <Ionicons name="call-outline" size={22} color={highlightCall ? GatiMitraColors.warmOrange : MINT} />
          </TouchableOpacity>
        </View>

        <View style={styles.banner}>
          <AppText style={styles.bannerEmoji}>🛵</AppText>
          <View style={styles.bannerTextWrap}>
            <AppText style={styles.bannerTitle}>Your partner might be driving</AppText>
            <AppText style={styles.bannerSub}>
              They&apos;ll respond to your messages as soon as possible
            </AppText>
          </View>
        </View>

        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={MINT} />
          </View>
        ) : error && messages.length === 0 ? (
          <View style={styles.loadingWrap}>
            <AppText style={styles.errorText}>
              {(error as Error).message || "Could not load chat."}
            </AppText>
            <TouchableOpacity onPress={() => void refetch()} style={styles.retryBtn}>
              <AppText style={styles.retryText}>Retry</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={[
              styles.messagesContent,
              { paddingBottom: 12 },
              messages.length === 0 && styles.messagesEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {messages.length === 0 ? (
              <View style={styles.systemBubbleWrap}>
                <AppText style={styles.systemBubble}>
                  Ask about pickup OTP, location, or trip details. Messages appear in the rider app.
                </AppText>
              </View>
            ) : (
              messages.map(renderBubble)
            )}
          </ScrollView>
        )}

        {chatClosed ? (
          <View style={[styles.closedBar, { paddingBottom: composerBottomPad }]}>
            <AppText style={styles.closedText}>Chat closed — order completed.</AppText>
          </View>
        ) : (
          <>
            {showPersonRideQuickReplies ? (
              <View style={styles.quickReplyList}>
                {PERSON_RIDE_CUSTOMER_QUICK_REPLIES.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.quickReplyRowItem}
                    onPress={() => handleQuickReply(item)}
                    disabled={sendMutation.isPending || shareLocationLoading}
                    activeOpacity={0.85}
                  >
                    <AppText style={styles.quickReplyText} numberOfLines={2}>
                      {item.message}
                    </AppText>
                    <Ionicons name="chevron-forward" size={16} color="#C4C4C4" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View
              style={[
                styles.composer,
                { paddingBottom: composerBottomPad },
                !showPersonRideQuickReplies && styles.composerBorderTop,
              ]}
            >
            <View style={styles.inputWrap}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                placeholder="Type your message here..."
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
    borderBottomColor: GatiMitraColors.border,
    backgroundColor: "#fff",
  },
  headerSide: { width: 40, alignItems: "center", justifyContent: "center" },
  headerCallHighlight: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFF7ED",
    borderWidth: 2,
    borderColor: GatiMitraColors.warmOrange,
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerAvatarImg: { width: 40, height: 40 },
  headerAvatarText: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.emerald },
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
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  retryText: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.emerald },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 14, paddingTop: 16 },
  messagesEmpty: { flexGrow: 1 },
  systemBubbleWrap: { alignItems: "center", marginBottom: 12 },
  systemBubble: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: "88%",
  },
  customerBubbleWrap: { alignItems: "flex-end", marginBottom: 10 },
  customerBubble: {
    maxWidth: "82%",
    backgroundColor: MINT,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  customerBubbleText: { fontSize: 14, color: "#fff", lineHeight: 20 },
  partnerBubbleWrap: { alignItems: "flex-start", marginBottom: 10 },
  partnerBubble: {
    maxWidth: "82%",
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  partnerBubbleText: { fontSize: 14, color: TEXT, lineHeight: 20 },
  timeLabel: { fontSize: 10, color: MUTED, marginTop: 4, marginRight: 4 },
  timeLabelLeft: { fontSize: 10, color: MUTED, marginTop: 4, marginLeft: 4 },
  quickReplyList: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
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
    borderTopColor: GatiMitraColors.border,
  },
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
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
    backgroundColor: GatiMitraColors.warmOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.45 },
  closedBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
    backgroundColor: "#F9FAFB",
  },
  closedText: { fontSize: 13, color: MUTED, textAlign: "center" },
});
