/**
 * Ticket detail + realtime chat.
 *
 * Architecture (same as merchant_app/HelpChatScreen + partnersite chat):
 *  - React Query owns the detail+messages fetch.
 *  - `useTicketRealtime` subscribes to Supabase realtime on the same
 *    "ticket_<id>" channel the agent dashboard publishes via INSERT/UPDATE on
 *    `unified_ticket_messages` + `unified_tickets`. Debounced refetch (~180ms).
 *  - Background polling fallback every 4s when realtime is unavailable.
 *  - Composer: text + image/PDF attachment via ImagePicker / DocumentPicker.
 *  - Inline CSAT (emoji rating) when ticket is RESOLVED/CLOSED — same UX as merchant app.
 *  - Internal notes never reach this screen — the backend filters them out.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image, StyleSheet, KeyboardAvoidingView, Platform, Pressable, Linking, Alert, Keyboard } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { ChatImageViewerModal } from "@/components/support/ChatImageViewerModal";
import { formatTicketMessageText } from "@/lib/formatTicketMessage";
import {
  customerSupportService,
  type TicketDetailResponse,
  type TicketMessage,
  type TicketAttachment,
} from "@/services/customerSupport.service";
import { useTicketRealtime } from "@/hooks/useTicketRealtime";
import { useKeyboardBottomInset } from "@/hooks/useKeyboardBottomInset";
import { useAuthStore } from "@/store/authStore";
import { useCustomerSupportReadStore } from "@/store/customerSupportReadStore";
import { computeTicketReadWatermark } from "@/lib/customerSupportReadStorage";
import { getConfig } from "@/config/env";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { SUPPORT_PAGE_BG, supportHeaderPaddingTop } from "@/lib/supportLayout";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const GREEN = GatiMitraColors.primaryMint;
const MINE_BUBBLE_BG = "#DCFCE7";
const MINE_BUBBLE_TEXT = "#14532D";
const MINE_BUBBLE_TIME = "#166534";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const FALLBACK_POLL_MS = 4_000;
const MAX_CHAT_ATTACHMENTS = 10;

type PendingAttachment = {
  id: string;
  localPreviewUri: string;
  uploading: boolean;
  storageKey?: string;
  url?: string;
  name?: string;
  mimeType?: string;
};

function newAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function restoreComposerKeyboard(inputRef: React.RefObject<TextInput | null>, restore: boolean) {
  if (restore) {
    requestAnimationFrame(() => inputRef.current?.focus());
    setTimeout(() => inputRef.current?.focus(), 64);
    return;
  }
  inputRef.current?.blur();
  Keyboard.dismiss();
}

function collectChatImageUris(
  messages: TicketMessage[],
  pending: PendingAttachment[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (uri: string | undefined | null) => {
    const u = String(uri ?? "").trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  for (const message of messages) {
    const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
      .map(resolveAttachmentUrl)
      .filter((a): a is { name: string; url: string; isImage: boolean } => !!a);
    for (const att of attachments) {
      if (att.isImage) push(att.url);
    }
  }
  for (const pendingItem of pending) {
    push(pendingItem.localPreviewUri);
    if (pendingItem.url) push(pendingItem.url);
  }
  return out;
}

const RATING_OPTIONS = [
  { value: 1, label: "Very poor", emoji: "😡" },
  { value: 2, label: "Poor", emoji: "🙁" },
  { value: 3, label: "Neutral", emoji: "😐" },
  { value: 4, label: "Good", emoji: "🙂" },
  { value: 5, label: "Excellent", emoji: "😍" },
] as const;

function ticketStatusNormalized(status: string | null | undefined): string {
  return String(status ?? "")
    .toUpperCase()
    .replace(/-/g, "_");
}

function statusBadge(status: string): { label: string; color: string; bg: string } {
  const s = String(status).toUpperCase();
  if (s === "OPEN" || s === "REOPENED") return { label: s === "REOPENED" ? "Reopened" : "Open", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "ASSIGNED") return { label: "Assigned", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "IN_PROGRESS") return { label: "In progress", color: "#7c3aed", bg: "#ede9fe" };
  if (s === "WAITING_FOR_USER") return { label: "Awaiting you", color: "#b45309", bg: "#fef3c7" };
  if (s === "WAITING_FOR_MERCHANT" || s === "WAITING_FOR_RIDER" || s === "PENDING") return { label: "Pending", color: "#b45309", bg: "#fef3c7" };
  if (s === "RESOLVED") return { label: "Resolved", color: "#15803d", bg: "#dcfce7" };
  if (s === "CLOSED") return { label: "Closed", color: "#374151", bg: "#e5e7eb" };
  if (s === "REJECTED") return { label: "Rejected", color: "#b91c1c", bg: "#fee2e2" };
  if (s === "ESCALATED") return { label: "Escalated", color: "#b91c1c", bg: "#fee2e2" };
  return { label: s, color: "#374151", bg: "#e5e7eb" };
}

/** Build the full URL for an attachment by joining the API base + storageKey/url. */
function resolveAttachmentUrl(att: string | TicketAttachment): { name: string; url: string; isImage: boolean } | null {
  const { apiBaseUrl } = getConfig();
  const base = apiBaseUrl.replace(/\/+$/, "");

  if (typeof att === "string") {
    const text = att.trim();
    if (!text) return null;
    if (text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as TicketAttachment;
        return resolveAttachmentUrl(parsed);
      } catch {
        return null;
      }
    }
  }

  let storageKey = "";
  let url = "";
  let name = "attachment";
  let mime = "";
  if (typeof att === "string") {
    storageKey = att.trim();
  } else if (att && typeof att === "object") {
    storageKey = (att.storageKey || "").toString().trim();
    url = (att.url || "").toString().trim();
    name = (att.name || "").toString().trim() || name;
    mime = (att.mimeType || "").toString().trim();
  }
  if (!storageKey && !url) return null;
  let full: string;
  if (url.startsWith("http")) {
    full = url;
  } else if (storageKey) {
    full = `${base}/v1/attachments/proxy?key=${encodeURIComponent(storageKey)}`;
  } else if (url.startsWith("/")) {
    full = `${base}${url}`;
  } else {
    full = `${base}/${url}`;
  }
  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(name) || /^image\//i.test(mime) || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(full);
  return { name: name || storageKey.split("/").pop() || "attachment", url: full, isImage };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TicketDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ticketId: ticketIdParam } = useLocalSearchParams<{ ticketId?: string | string[] }>();
  const ticketIdRaw = Array.isArray(ticketIdParam) ? ticketIdParam[0] : ticketIdParam;
  const ticketIdNum = ticketIdRaw && /^\d+$/.test(ticketIdRaw) ? Number(ticketIdRaw) : null;

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const keyboardOpenRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const keyboardInset = useKeyboardBottomInset();

  const authToken = useAuthStore((s) => s.session?.accessToken ?? null);
  const customerSub = useAuthStore((s) => s.session?.userId ?? null);
  const setCustomerSub = useCustomerSupportReadStore((s) => s.setCustomerSub);
  const markTicketRead = useCustomerSupportReadStore((s) => s.markTicketRead);

  useEffect(() => {
    setCustomerSub(customerSub);
  }, [customerSub, setCustomerSub]);

  useFocusEffect(
    useCallback(() => {
      useScreenChromeStore.setState({
        statusBarBackground: SUPPORT_PAGE_BG,
        statusBarStyle: "dark",
        hideStatusBarSpacer: false,
      });
      return () => useScreenChromeStore.getState().resetStatusBarBackground();
    }, [])
  );

  const { data, isLoading, error, refetch } = useQuery<TicketDetailResponse>({
    queryKey: ["customer-support-ticket", ticketIdNum],
    queryFn: () => customerSupportService.getTicket(ticketIdNum!),
    enabled: ticketIdNum != null,
    refetchInterval: FALLBACK_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { postgresLive } = useTicketRealtime({
    ticketNumericId: ticketIdNum,
    enabled: ticketIdNum != null && Boolean(authToken),
    authToken,
    onStale: () => {
      void refetch();
    },
  });

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  const chatImageUris = useMemo(
    () => collectChatImageUris(messages, pendingAttachments),
    [messages, pendingAttachments]
  );

  useEffect(() => {
    keyboardOpenRef.current = keyboardInset > 0;
  }, [keyboardInset]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      keyboardOpenRef.current = true;
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardOpenRef.current = false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  useEffect(() => {
    if (ticketIdNum == null || !ticket) return;
    const readAt = computeTicketReadWatermark(
      messages,
      ticket.updated_at ?? null,
      ticket.updated_at ?? null
    );
    markTicketRead(ticketIdNum, readAt);
  }, [ticketIdNum, ticket, messages, markTicketRead]);

  useEffect(() => {
    if (keyboardInset > 0) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [keyboardInset]);

  const submitRating = useCallback(async () => {
    if (!ticketIdNum || ratingValue == null || ratingValue < 1 || ratingValue > 5) return;
    setRatingSubmitting(true);
    try {
      await customerSupportService.rateTicket(
        ticketIdNum,
        ratingValue,
        ratingFeedback.trim() || undefined
      );
      setRatingValue(null);
      setRatingFeedback("");
      await refetch();
    } catch (e) {
      console.warn("rating failed", e);
      Alert.alert("Couldn't submit", "Could not save your rating. Try again later.");
    } finally {
      setRatingSubmitting(false);
    }
  }, [ticketIdNum, ratingValue, ratingFeedback, refetch]);

  const uploadPickedAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], restoreKeyboard: boolean) => {
      if (!ticketIdNum || assets.length === 0) {
        restoreComposerKeyboard(inputRef, restoreKeyboard);
        return;
      }

      const slotsLeft = MAX_CHAT_ATTACHMENTS - pendingAttachments.length;
      const picked = assets.slice(0, Math.max(0, slotsLeft));
      if (picked.length === 0) {
        Alert.alert("Limit reached", `You can attach up to ${MAX_CHAT_ATTACHMENTS} images at a time.`);
        restoreComposerKeyboard(inputRef, restoreKeyboard);
        return;
      }

      const queued: PendingAttachment[] = picked.map((asset) => ({
        id: newAttachmentId(),
        localPreviewUri: asset.uri,
        uploading: true,
      }));

      setPendingAttachments((prev) => [...prev, ...queued]);
      restoreComposerKeyboard(inputRef, restoreKeyboard);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

      let failedCount = 0;
      await Promise.all(
        picked.map(async (asset, index) => {
          const itemId = queued[index]?.id;
          if (!itemId) return;
          const filename =
            asset.fileName || asset.uri.split("/").pop() || `image-${Date.now()}.jpg`;
          const mime = asset.mimeType || "image/jpeg";
          try {
            const uploaded = await customerSupportService.uploadAttachment(ticketIdNum, {
              uri: asset.uri,
              name: filename,
              mimeType: mime,
            });
            setPendingAttachments((prev) => {
              if (!prev.some((p) => p.id === itemId)) return prev;
              return prev.map((p) =>
                p.id === itemId
                  ? {
                      ...p,
                      uploading: false,
                      storageKey: uploaded.storageKey,
                      url: uploaded.url,
                      name: uploaded.name,
                      mimeType: uploaded.mimeType,
                    }
                  : p
              );
            });
          } catch (e) {
            failedCount += 1;
            console.warn("attachment upload failed", e);
            setPendingAttachments((prev) => prev.filter((p) => p.id !== itemId));
          }
        })
      );

      if (failedCount > 0) {
        Alert.alert(
          "Upload failed",
          failedCount === 1
            ? "Could not upload 1 image. Try again."
            : `Could not upload ${failedCount} images. Try again.`
        );
      }
    },
    [ticketIdNum, pendingAttachments.length]
  );

  const pickFromGallery = useCallback(async () => {
    if (!ticketIdNum) return;
    const restoreKeyboard = keyboardOpenRef.current;
    const slotsLeft = MAX_CHAT_ATTACHMENTS - pendingAttachments.length;
    if (slotsLeft <= 0) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_CHAT_ATTACHMENTS} images at a time.`);
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow photo access to attach images.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: slotsLeft > 1,
        selectionLimit: slotsLeft,
      });

      if (res.canceled || !res.assets?.length) {
        restoreComposerKeyboard(inputRef, restoreKeyboard);
        return;
      }

      await uploadPickedAssets(res.assets, restoreKeyboard);
    } catch (e) {
      console.warn("pickFromGallery failed", e);
      Alert.alert("Upload failed", "Could not open your photo library. Try again.");
      restoreComposerKeyboard(inputRef, restoreKeyboard);
    }
  }, [ticketIdNum, uploadPickedAssets]);

  const pickFromCamera = useCallback(async () => {
    if (!ticketIdNum) return;
    const restoreKeyboard = keyboardOpenRef.current;
    if (pendingAttachments.length >= MAX_CHAT_ATTACHMENTS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_CHAT_ATTACHMENTS} images at a time.`);
      return;
    }

    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow camera access to take photos.");
        return;
      }

      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });

      if (res.canceled || !res.assets?.length) {
        restoreComposerKeyboard(inputRef, restoreKeyboard);
        return;
      }

      await uploadPickedAssets(res.assets, restoreKeyboard);
    } catch (e) {
      console.warn("pickFromCamera failed", e);
      Alert.alert("Camera failed", "Could not open the camera. Try again.");
      restoreComposerKeyboard(inputRef, restoreKeyboard);
    }
  }, [ticketIdNum, pendingAttachments.length, uploadPickedAssets]);

  const sendMessage = useCallback(async () => {
    if (!ticketIdNum) return;
    const text = draft.trim();
    const readyAttachments = pendingAttachments.filter(
      (a) => !a.uploading && a.storageKey && a.url && a.name && a.mimeType
    );
    if (!text && readyAttachments.length === 0) return;
    if (pendingAttachments.some((a) => a.uploading)) return;
    setSending(true);
    try {
      await customerSupportService.sendMessage(ticketIdNum, {
        message_text: text || "(attachment)",
        attachments: readyAttachments.map((a) => ({
          storageKey: a.storageKey!,
          url: a.url!,
          name: a.name!,
          mimeType: a.mimeType!,
        })),
      });
      setDraft("");
      setPendingAttachments([]);
      await refetch();
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      console.warn("sendMessage failed", e);
      Alert.alert("Send failed", "Could not send your message. Try again.");
    } finally {
      setSending(false);
      // Keep keyboard open after send — only dismiss when user taps outside or leaves screen.
      requestAnimationFrame(() => inputRef.current?.focus());
      setTimeout(() => inputRef.current?.focus(), 64);
    }
  }, [ticketIdNum, draft, pendingAttachments, refetch]);

  const reopen = useCallback(async () => {
    if (!ticketIdNum) return;
    try {
      await customerSupportService.reopen(ticketIdNum);
      await refetch();
    } catch (e) {
      console.warn("reopen failed", e);
      Alert.alert("Could not reopen", "Closed tickets cannot be reopened. Please raise a new one.");
    }
  }, [ticketIdNum, refetch]);

  const canSend = useMemo(() => {
    if (sending || pendingAttachments.some((a) => a.uploading)) return false;
    const readyCount = pendingAttachments.filter((a) => a.storageKey).length;
    return draft.trim().length > 0 || readyCount > 0;
  }, [sending, draft, pendingAttachments]);

  const attachmentsAtMax = pendingAttachments.length >= MAX_CHAT_ATTACHMENTS;

  const ratingSummary = useMemo(() => {
    if (!ticket || ticket.satisfaction_rating == null || Number.isNaN(Number(ticket.satisfaction_rating))) {
      return null;
    }
    const numeric = Number(ticket.satisfaction_rating);
    const opt = RATING_OPTIONS.find((o) => o.value === numeric);
    let submittedAt = "";
    if (ticket.satisfaction_collected_at) {
      try {
        const d = new Date(ticket.satisfaction_collected_at);
        if (!Number.isNaN(d.getTime())) {
          submittedAt = d.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch {
        submittedAt = "";
      }
    }
    return {
      numeric,
      label: opt?.label ?? `Rated ${numeric}/5`,
      emoji: opt?.emoji ?? "⭐",
      feedback: ticket.satisfaction_feedback ?? "",
      submittedAt,
    };
  }, [ticket]);

  const statusNorm = ticket ? ticketStatusNormalized(ticket.status) : "";
  const isTerminal = statusNorm === "RESOLVED" || statusNorm === "CLOSED" || statusNorm === "REJECTED";
  const showLiveIndicator = !isTerminal;
  const showRatingPrompt =
    !!ticket &&
    isTerminal &&
    (ticket.satisfaction_rating == null || Number.isNaN(Number(ticket.satisfaction_rating)));

  if (ticketIdNum == null) {
    return (
      <View style={styles.centered}>
        <AppText style={styles.errText}>Invalid ticket</AppText>
      </View>
    );
  }
  if (isLoading && !ticket) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
      </View>
    );
  }
  if (error || !ticket) {
    return (
      <View style={styles.centered}>
        <AppText style={styles.errText}>Could not load ticket</AppText>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
          <AppText style={styles.retryText}>Retry</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const sb = statusBadge(ticket.status);
  const headerSubject = ticket.subject || ticket.ticket_title || "Ticket";
  const composerBottomPad = keyboardInset > 0 ? 8 : insets.bottom + 8;
  const ratingBarBottomPad = keyboardInset > 0 ? 12 : 12 + insets.bottom;
  const screenStyle = [
    styles.screen,
    Platform.OS === "android" && keyboardInset > 0 ? { paddingBottom: keyboardInset } : null,
  ];
  const ChatShell = Platform.OS === "ios" ? KeyboardAvoidingView : View;
  const chatShellProps =
    Platform.OS === "ios"
      ? { behavior: "padding" as const, keyboardVerticalOffset: 0 }
      : {};

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor={SUPPORT_PAGE_BG} />
      <View style={screenStyle}>
        <View style={[styles.navHeader, { paddingTop: supportHeaderPaddingTop(insets.top) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <AppText style={styles.navTitle} numberOfLines={2}>
            {headerSubject}
          </AppText>
          <View style={[styles.badge, styles.navBadge, { backgroundColor: sb.bg }]}>
            <AppText style={[styles.badgeText, { color: sb.color }]}>{sb.label}</AppText>
          </View>
        </View>

        <View style={styles.headerCard}>
          <View style={styles.headerAccent} />
          <View style={styles.headerBody}>
            <View style={styles.headerMeta}>
              <View style={styles.ticketIdPill}>
                <AppText style={styles.ticketIdText}>#{ticket.ticket_id}</AppText>
              </View>
              {ticket.order_id ? (
                <View style={styles.orderLinkedPill}>
                  <Ionicons name="receipt-outline" size={11} color={GREEN} />
                  <AppText style={styles.orderLinkedText}>Order linked</AppText>
                </View>
              ) : null}
              {showLiveIndicator ? (
                <View style={[styles.live, postgresLive ? styles.liveOn : styles.liveOff]}>
                  <View style={[styles.liveDot, postgresLive ? styles.liveDotOn : styles.liveDotOff]} />
                  <AppText style={styles.liveText}>{postgresLive ? "Live" : "Reconnecting…"}</AppText>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <ChatShell style={styles.container} {...chatShellProps}>

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {/* Original description as the first "customer" message */}
        {ticket.description ? (
          <MessageBubble
            mine
            onImagePress={setViewerUri}
            message={{
              id: -1,
              message_text: ticket.description,
              message_type: "TEXT",
              sender_type: "CUSTOMER",
              sender_id: null,
              sender_name: "You",
              attachments: [],
              created_at: ticket.created_at,
            }}
          />
        ) : null}
        {messages.map((m, idx) => {
          const mine = String(m.sender_type || "").toUpperCase() === "CUSTOMER";
          const prev = messages[idx - 1];
          const prevType = prev ? String(prev.sender_type || "").toUpperCase() : "";
          const curType = String(m.sender_type || "").toUpperCase();
          // Show avatar/label only on the first message of a same-sender streak.
          const isFirstOfStreak = !prev || prevType !== curType;
          return (
            <MessageBubble
              key={m.id}
              mine={mine}
              onImagePress={setViewerUri}
              message={m}
              showSender={!mine && isFirstOfStreak}
              tightTop={!isFirstOfStreak}
            />
          );
        })}
        {isTerminal && !showRatingPrompt && !ratingSummary && (
          <View style={styles.resolvedBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#15803d" />
            <AppText style={styles.resolvedText}>
              This ticket is {statusNorm === "CLOSED" ? "closed" : "resolved"}. Reply below to reopen.
            </AppText>
          </View>
        )}
      </ScrollView>

      {!!ratingSummary && (
        <>
          <View style={styles.ratingSummaryCard}>
            <AppText style={styles.ratingExperienceTitle}>Support experience</AppText>
            <View style={styles.ratingAutoSummaryRow}>
              <AppText style={styles.ratingAutoEmoji}>{ratingSummary.emoji}</AppText>
              <AppText style={styles.ratingAutoLabel}>{ratingSummary.label}</AppText>
              <View style={styles.ratingAutoStarsRow}>
                {Array.from({ length: ratingSummary.numeric }).map((_, idx) => (
                  <Ionicons key={idx} name="star" size={14} color="#FFC107" style={styles.ratingAutoStarIcon} />
                ))}
              </View>
            </View>
            <AppText style={styles.ratingExperienceNote}>
              Thank you for rating your support interaction.
            </AppText>
            {!!ratingSummary.feedback && (
              <AppText style={styles.ratingSummaryFeedback}>{`"${ratingSummary.feedback}"`}</AppText>
            )}
            {!!ratingSummary.submittedAt && (
              <AppText style={styles.ratingSummaryMeta}>{`Submitted on: ${ratingSummary.submittedAt}`}</AppText>
            )}
          </View>

          <View style={styles.ratingAutoCard}>
            <View style={styles.ratingAutoHeaderRow}>
              <Ionicons name="information-circle" size={16} color={GREEN} style={{ marginRight: 6 }} />
              <AppText style={styles.ratingAutoTitle}>From GatiMitra Support Team</AppText>
            </View>
            {ratingSummary.numeric >= 3 ? (
              <>
                <AppText style={styles.ratingAutoBody}>Thank you for sharing your feedback with us.</AppText>
                <AppText style={styles.ratingAutoBody}>
                  We're glad that the <AppText style={styles.ratingAutoBold}>GatiMitra Support Team</AppText> was able
                  to assist you and resolve your concern.
                </AppText>
                <AppText style={styles.ratingAutoSignature}>– GatiMitra Team</AppText>
              </>
            ) : (
              <>
                <AppText style={styles.ratingAutoBody}>
                  We sincerely apologize that your experience did not meet your expectations. The{" "}
                  <AppText style={styles.ratingAutoBold}>GatiMitra Team</AppText> will review this case to improve our
                  support.
                </AppText>
                <AppText style={styles.ratingAutoBody}>
                  If you still need assistance, reply below to reopen this ticket.
                </AppText>
                <AppText style={styles.ratingAutoSignature}>– GatiMitra Team</AppText>
              </>
            )}
          </View>
        </>
      )}

      {showRatingPrompt && (
        <View style={[styles.ratingBar, { paddingBottom: ratingBarBottomPad }]}>
          <View style={styles.ratingClosedPill}>
            <Ionicons name="checkmark-circle" size={16} color="#15803d" style={{ marginRight: 6 }} />
            <AppText style={styles.ratingClosedText}>
              {statusNorm === "CLOSED"
                ? "This conversation has been closed"
                : "This conversation has been resolved"}
            </AppText>
          </View>

          <AppText style={styles.ratingHeading}>Hey there!</AppText>
          <AppText style={styles.ratingSubheading}>
            {`We just ${String(ticket.status ?? "closed").toLowerCase()} ticket ${ticket.ticket_id}.`}
          </AppText>
          <AppText style={styles.ratingSubheading}>We know you're busy, so we just have one question:</AppText>
          <AppText style={[styles.ratingSubheading, styles.ratingQuestion]}>
            Are you satisfied with the support you received in this ticket?
          </AppText>

          <View style={styles.ratingEmojisRow}>
            {RATING_OPTIONS.map((opt) => {
              const selected = ratingValue === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setRatingValue(opt.value)}
                  style={[styles.ratingEmojiWrap, selected && styles.ratingEmojiWrapSelected]}
                >
                  <AppText style={styles.ratingEmoji}>{opt.emoji}</AppText>
                  <AppText style={[styles.ratingEmojiLabel, selected && styles.ratingEmojiLabelSelected]}>
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={styles.ratingFeedbackInput}
            placeholder="Tell us more (optional)"
            placeholderTextColor={MUTED}
            value={ratingFeedback}
            onChangeText={setRatingFeedback}
            multiline
            maxLength={2000}
          />

          <Pressable
            disabled={!ratingValue || ratingSubmitting}
            onPress={submitRating}
            style={[
              styles.ratingSubmitBtn,
              (!ratingValue || ratingSubmitting) && styles.ratingSubmitBtnDisabled,
            ]}
          >
            <AppText style={styles.ratingSubmitText}>
              {ratingSubmitting ? "Submitting…" : "Submit feedback"}
            </AppText>
          </Pressable>
        </View>
      )}

      {!showRatingPrompt && (
        <>
          {pendingAttachments.length > 0 && (
            <ScrollView horizontal style={styles.attachmentsRow} showsHorizontalScrollIndicator={false}>
              {pendingAttachments.map((a) => (
                <View key={a.id} style={styles.attachmentTile}>
                  <TouchableOpacity
                    activeOpacity={0.92}
                    onPress={() => setViewerUri(a.localPreviewUri)}
                    disabled={a.uploading}
                  >
                    <Image source={{ uri: a.localPreviewUri }} style={styles.attachmentImage} />
                  </TouchableOpacity>
                  {a.uploading ? (
                    <View style={styles.attachmentUploadOverlay}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setPendingAttachments((p) => p.filter((item) => item.id !== a.id))}
                      style={styles.attachmentRemove}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          <View style={[styles.composer, { paddingBottom: composerBottomPad }]}>
            {ticket.status === "CLOSED" ? (
              <View style={styles.closedRow}>
                <AppText style={styles.closedText}>
                  This ticket is closed. To get help again, raise a new ticket.
                </AppText>
                <TouchableOpacity
                  style={styles.closedCta}
                  onPress={() =>
                    router.push({ pathname: "/support", params: { newTicket: "1" } } as never)
                  }
                >
                  <AppText style={styles.closedCtaText}>Raise new</AppText>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.waInputShell}>
                  <TextInput
                    ref={inputRef}
                    style={styles.waInput}
                    placeholder={ticket.status === "RESOLVED" ? "Reply to reopen…" : "Message"}
                    placeholderTextColor="#94A3B8"
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={5000}
                    blurOnSubmit={false}
                    onFocus={() => {
                      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
                    }}
                  />
                  <View style={styles.waInputDivider} />
                  <TouchableOpacity
                    onPress={pickFromGallery}
                    style={styles.waInputIconBtn}
                    disabled={attachmentsAtMax}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="attach-outline"
                      size={22}
                      color={attachmentsAtMax ? "#CBD5E1" : "#64748B"}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={pickFromCamera}
                    style={styles.waInputIconBtn}
                    disabled={attachmentsAtMax}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="camera-outline"
                      size={22}
                      color={attachmentsAtMax ? "#CBD5E1" : "#64748B"}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (canSend) {
                      if (ticket.status === "RESOLVED") {
                        void reopen().then(sendMessage);
                        return;
                      }
                      void sendMessage();
                      return;
                    }
                    if (!attachmentsAtMax) void pickFromCamera();
                  }}
                  disabled={sending || (attachmentsAtMax && !canSend)}
                  style={[
                    styles.waSendBtn,
                    canSend ? styles.waSendBtnActive : styles.waSendBtnIdle,
                    (sending || (attachmentsAtMax && !canSend)) && styles.waSendBtnDisabled,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : canSend ? (
                    <Ionicons name="send" size={18} color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}

        </ChatShell>
      </View>
      <ChatImageViewerModal
        visible={viewerUri != null}
        uris={chatImageUris.length > 0 ? chatImageUris : viewerUri ? [viewerUri] : []}
        initialUri={viewerUri}
        onClose={() => setViewerUri(null)}
      />
    </>
  );
}

function MessageBubble({
  message,
  mine,
  showSender = true,
  tightTop = false,
  onImagePress,
}: {
  message: TicketMessage;
  mine: boolean;
  showSender?: boolean;
  tightTop?: boolean;
  onImagePress?: (uri: string) => void;
}) {
  const senderType = String(message.sender_type || "").toUpperCase();
  if (senderType === "SYSTEM") {
    return (
      <View style={styles.systemRow}>
        <AppText style={styles.systemText}>{formatTicketMessageText(message.message_text)}</AppText>
      </View>
    );
  }

  const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
    .map(resolveAttachmentUrl)
    .filter((a): a is { name: string; url: string; isImage: boolean } => !!a);
  const rawText = formatTicketMessageText(message.message_text);
  const bodyText =
    rawText && rawText.trim() !== "(attachment)" && rawText.trim() !== "(Attachment)"
      ? rawText
      : "";
  const imageAttachments = attachments.filter((a) => a.isImage);
  const fileAttachments = attachments.filter((a) => !a.isImage);
  const timestamp = formatTime(message.created_at);

  const rowProps = (index: number, isFirstInGroup: boolean) => ({
    mine,
    showSender: !mine && showSender && isFirstInGroup,
    tightTop: tightTop || (!isFirstInGroup && index > 0),
  });

  const renderTimestamp = (isLast: boolean, onImage = false) =>
    isLast ? (
      <AppText
        style={[
          styles.timestamp,
          mine && styles.timestampMine,
          onImage && styles.timestampOnImage,
          onImage && mine && styles.timestampOnImageMine,
        ]}
      >
        {timestamp}
      </AppText>
    ) : null;

  type BubblePart =
    | { kind: "text" }
    | { kind: "image"; attachment: { name: string; url: string; isImage: boolean } }
    | { kind: "files" };

  const parts: BubblePart[] = [];
  if (bodyText) parts.push({ kind: "text" });
  imageAttachments.forEach((attachment) => parts.push({ kind: "image", attachment }));
  if (fileAttachments.length > 0) parts.push({ kind: "files" });

  if (parts.length === 0) return null;

  return (
    <>
      {parts.map((part, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === parts.length - 1;
        const row = rowProps(idx, isFirst);

        if (part.kind === "text") {
          return (
            <MessageBubbleRow key={`text-${idx}`} {...row}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!mine && showSender && isFirst ? (
                  <AppText style={styles.supportLabel}>Support</AppText>
                ) : null}
                <AppText
                  style={[
                    styles.bubbleText,
                    mine && styles.bubbleTextMine,
                    !mine && styles.bubbleTextTheirs,
                  ]}
                >
                  {bodyText}
                </AppText>
                {renderTimestamp(isLast)}
              </View>
            </MessageBubbleRow>
          );
        }

        if (part.kind === "image") {
          return (
            <MessageBubbleRow key={`img-${idx}-${part.attachment.url}`} {...row}>
              <View
                style={[
                  styles.bubble,
                  styles.bubbleImageOnly,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() =>
                    onImagePress ? onImagePress(part.attachment.url) : Linking.openURL(part.attachment.url)
                  }
                >
                  <Image
                    source={{ uri: part.attachment.url }}
                    style={styles.bubbleImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                {renderTimestamp(isLast, true)}
              </View>
            </MessageBubbleRow>
          );
        }

        return (
          <MessageBubbleRow key={`files-${idx}`} {...row}>
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!mine && showSender && isFirst ? (
                <AppText style={styles.supportLabel}>Support</AppText>
              ) : null}
              <View style={styles.attachmentsInline}>
                {fileAttachments.map((a, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => Linking.openURL(a.url)}
                    style={[
                      styles.attachmentInlineFile,
                      mine && { backgroundColor: "rgba(20, 83, 45, 0.08)" },
                    ]}
                  >
                    <Ionicons
                      name="document-attach"
                      size={18}
                      color={mine ? MINE_BUBBLE_TEXT : GatiMitraColors.emerald}
                    />
                    <AppText
                      style={[styles.attachmentInlineFileText, mine && { color: MINE_BUBBLE_TEXT }]}
                      numberOfLines={1}
                    >
                      {a.name}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
              {renderTimestamp(isLast)}
            </View>
          </MessageBubbleRow>
        );
      })}
    </>
  );
}

function MessageBubbleRow({
  mine,
  showSender,
  tightTop,
  children,
}: {
  mine: boolean;
  showSender: boolean;
  tightTop: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.row,
        mine ? styles.rowMine : styles.rowTheirs,
        tightTop && styles.rowTight,
      ]}
    >
      {!mine ? (
        showSender ? (
          <View style={styles.supportAvatar}>
            <Ionicons name="headset" size={14} color="#fff" />
          </View>
        ) : (
          <View style={styles.supportAvatarSpacer} />
        )
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SUPPORT_PAGE_BG },
  navHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: SUPPORT_PAGE_BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBEBEB",
  },
  navSide: { width: 40, alignItems: "flex-start" },
  navTitle: {
    flex: 1,
    textAlign: "left",
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: TEXT,
    lineHeight: 21,
    paddingRight: 8,
  },
  navBadge: { alignSelf: "flex-start", marginTop: 2 },
  container: { flex: 1, backgroundColor: SUPPORT_PAGE_BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: SUPPORT_PAGE_BG },
  errText: { color: GatiMitraColors.textSecondary, marginBottom: 12 },
  retryBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  headerCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EBEBEB",
    overflow: "hidden",
  },
  headerAccent: {
    width: 4,
    backgroundColor: GREEN,
  },
  headerBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  ticketIdPill: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ticketIdText: { fontSize: 11, fontFamily: StoreFonts.poppinsBold, color: MUTED },
  orderLinkedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  orderLinkedText: { fontSize: 11, fontFamily: StoreFonts.loraBold, color: GREEN },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: {
    fontSize: 10,
    fontFamily: StoreFonts.poppinsBold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  live: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  liveOn: {},
  liveOff: { opacity: 0.6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveDotOn: { backgroundColor: "#15803d" },
  liveDotOff: { backgroundColor: "#9ca3af" },
  liveText: { fontSize: 11, fontFamily: StoreFonts.loraBold, color: GatiMitraColors.textSecondary },
  thread: { flex: 1 },
  row: { width: "100%", marginBottom: 10, flexDirection: "row", alignItems: "flex-end" },
  rowMine: { justifyContent: "flex-end", paddingRight: 6 },
  rowTheirs: { justifyContent: "flex-start", gap: 6, paddingRight: 8 },
  /** Pulls the bubble closer to the previous one when we suppress the avatar+label. */
  rowTight: { marginBottom: 3, marginTop: -2 },
  /** Small circular icon next to support replies — generic, never shows the agent's name. */
  supportAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  /** Invisible placeholder to keep follow-up bubbles aligned with the streak's first bubble. */
  supportAvatarSpacer: { width: 26, height: 1 },
  bubble: {
    maxWidth: "76%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: MINE_BUBBLE_BG,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  bubbleImageOnly: {
    padding: 0,
    overflow: "hidden",
    borderRadius: 10,
  },
  bubbleImage: {
    width: 216,
    height: 216,
    borderRadius: 9,
    backgroundColor: "#e5e7eb",
  },
  bubbleTheirs: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  /** Generic "Support" label above agent messages — never shows the agent's personal name. */
  supportLabel: {
    fontSize: 11,
    fontFamily: StoreFonts.loraBold,
    color: GREEN,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  bubbleText: { fontSize: 14, fontFamily: StoreFonts.loraRegular, color: GatiMitraColors.textPrimary, lineHeight: 21 },
  bubbleTextMine: { color: MINE_BUBBLE_TEXT },
  bubbleTextTheirs: { color: "#1f2937" },
  timestamp: {
    fontSize: 10,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: GatiMitraColors.textSecondary,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  timestampMine: { color: MINE_BUBBLE_TIME, opacity: 0.72 },
  timestampOnImage: {
    position: "absolute",
    right: 8,
    bottom: 8,
    marginTop: 0,
    alignSelf: "auto",
    backgroundColor: "rgba(15, 23, 42, 0.52)",
    color: "#fff",
    opacity: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  timestampOnImageMine: {
    backgroundColor: "rgba(20, 83, 45, 0.58)",
    color: "#fff",
    opacity: 1,
  },
  systemRow: { width: "100%", alignItems: "center", paddingVertical: 6 },
  systemText: {
    fontSize: 11,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontStyle: "italic",
  },
  attachmentsInline: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  attachmentInlineImage: { width: 140, height: 100, borderRadius: 10, backgroundColor: "#e5e7eb" },
  attachmentInlineFile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: 200,
  },
  attachmentInlineFileText: { fontSize: 12, color: GatiMitraColors.textPrimary, fontWeight: "600" },
  resolvedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  resolvedText: { flex: 1, fontSize: 12, color: "#15803d", fontWeight: "600" },
  attachmentsRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#ECEFF1",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D8DEE4",
    maxHeight: 92,
  },
  attachmentTile: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginRight: 8,
    position: "relative",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D8DEE4",
  },
  attachmentImage: { width: "100%", height: "100%" },
  attachmentUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 8,
    backgroundColor: "#ECEFF1",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D8DEE4",
  },
  waInputShell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 44,
    maxHeight: 132,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  waInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingVertical: 8,
    paddingRight: 4,
    color: GatiMitraColors.textPrimary,
    fontSize: 16,
    fontFamily: StoreFonts.loraRegular,
  },
  waInputDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
    marginHorizontal: 2,
  },
  waInputIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  waSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  waSendBtnActive: {
    backgroundColor: GatiMitraColors.emerald,
  },
  waSendBtnIdle: {
    backgroundColor: GatiMitraColors.emerald,
  },
  waSendBtnDisabled: {
    opacity: 0.45,
  },
  closedRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
  },
  closedText: { flex: 1, fontSize: 13, color: GatiMitraColors.textSecondary },
  closedCta: {
    backgroundColor: GREEN,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closedCtaText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  ratingBar: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#EBEBEB",
    backgroundColor: "#fff",
  },
  ratingClosedPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    marginBottom: 8,
  },
  ratingClosedText: { fontSize: 11, fontWeight: "600", color: MUTED },
  ratingHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
    marginBottom: 2,
  },
  ratingSubheading: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 18,
  },
  ratingQuestion: { fontWeight: "600", marginBottom: 10 },
  ratingEmojisRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  ratingEmojiWrap: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    marginHorizontal: 2,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EBEBEB",
  },
  ratingEmojiWrapSelected: {
    backgroundColor: "#ECFDF5",
    borderColor: GREEN,
  },
  ratingEmoji: { fontSize: 20, marginBottom: 2 },
  ratingEmojiLabel: { fontSize: 10, color: MUTED, textAlign: "center" },
  ratingEmojiLabelSelected: { fontWeight: "600", color: GREEN },
  ratingFeedbackInput: {
    minHeight: 60,
    maxHeight: 100,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EBEBEB",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: TEXT,
    marginBottom: 10,
  },
  ratingSubmitBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GREEN,
  },
  ratingSubmitBtnDisabled: { opacity: 0.5 },
  ratingSubmitText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  ratingSummaryCard: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#EBEBEB",
  },
  ratingExperienceTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT,
    marginBottom: 6,
  },
  ratingAutoSummaryRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  ratingAutoEmoji: { fontSize: 18, marginRight: 6 },
  ratingAutoLabel: { fontSize: 13, fontWeight: "600", color: TEXT, marginRight: 6 },
  ratingAutoStarsRow: { flexDirection: "row", alignItems: "center" },
  ratingAutoStarIcon: { marginRight: 2 },
  ratingExperienceNote: { marginTop: 4, fontSize: 11, color: MUTED },
  ratingSummaryFeedback: { fontSize: 12, color: MUTED, marginTop: 8, fontStyle: "italic" },
  ratingSummaryMeta: { marginTop: 6, fontSize: 11, color: "#9CA3AF" },
  ratingAutoCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EBEBEB",
  },
  ratingAutoHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  ratingAutoTitle: { fontSize: 12, fontWeight: "600", color: TEXT },
  ratingAutoBody: { fontSize: 12, color: MUTED, lineHeight: 18, marginTop: 2 },
  ratingAutoBold: { fontWeight: "600", color: TEXT },
  ratingAutoSignature: {
    fontSize: 12,
    color: MUTED,
    marginTop: 8,
    fontStyle: "italic",
  },
});
