import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Keyboard,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Image,
  Linking,
  Modal,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { Ionicons } from "@expo/vector-icons";

import { router, useLocalSearchParams, useFocusEffect } from "expo-router";

import { useTranslation } from "react-i18next";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  riderSupportService,
  guessPhotoFileMeta,
  type RiderTicketMessage,
} from "@/src/services/riderSupport.service";
import type { ResolvedTicketAttachment } from "@/src/lib/ticket-attachment";

import { extractApiErrorMessage } from "@/src/services/http";

import { formatNotificationTime } from "@/src/lib/format-notification-time";

import { colors } from "@/src/theme";
import { formatTicketMessageText } from "@/src/lib/formatTicketMessage";
import { resolveTicketAttachmentList } from "@/src/lib/ticket-attachment";

const BRAND = colors.primary[600];

const BUBBLE_RIDER = "#3EB489";

const H_PAD = 16;

const CARD_RADIUS = 12;

const POLL_MS = 4000;

const RATING_OPTIONS = [
  { value: 1, label: "Very poor", emoji: "😡" },

  { value: 2, label: "Poor", emoji: "🙁" },

  { value: 3, label: "Neutral", emoji: "😐" },

  { value: 4, label: "Good", emoji: "🙂" },

  { value: 5, label: "Excellent", emoji: "😍" },
] as const;

function paramId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;

  if (!v || !/^\d+$/.test(v)) return null;

  const n = Number(v);

  return Number.isInteger(n) && n > 0 ? n : null;
}

function ticketStatusNormalized(status: string): string {
  return String(status ?? "")
    .trim()
    .toUpperCase();
}

function statusBadge(status: string) {
  const s = ticketStatusNormalized(status);

  if (s === "OPEN" || s === "REOPENED") {
    return {
      label: s === "REOPENED" ? "Reopened" : "Open",
      color: "#1D4ED8",
      bg: "#DBEAFE",
    };
  }

  if (s === "IN_PROGRESS")
    return { label: "In progress", color: "#7C3AED", bg: "#EDE9FE" };

  if (s === "RESOLVED")
    return { label: "Resolved", color: "#15803D", bg: "#DCFCE7" };

  if (s === "CLOSED")
    return { label: "Closed", color: "#374151", bg: "#E5E7EB" };

  return { label: status, color: "#374151", bg: "#F3F4F6" };
}

function isRiderMessage(m: RiderTicketMessage): boolean {
  return String(m.sender_type ?? "").toUpperCase() === "RIDER";
}

const AGENT_TEAM_LABEL = "GatiMitra team";

function agentTimeLabel(createdAt: string): string {
  return formatNotificationTime(new Date(createdAt).getTime());
}

function riderTimeLabel(createdAt: string): string {
  return formatNotificationTime(new Date(createdAt).getTime());
}

type ComposerPendingAttachment = {
  id: string;
  uri: string;
  fileName?: string;
  mimeType?: string;
};

function isAttachmentPlaceholderText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "shared attachments" || normalized === "shared an attachment";
}

function guessChatFileMeta(
  uri: string,
  index: number,
  fileName?: string,
  mimeType?: string,
): { name: string; mimeType: string } {
  if (fileName?.trim() && mimeType?.trim()) {
    return { name: fileName.trim(), mimeType: mimeType.trim() };
  }
  return guessPhotoFileMeta(uri, index);
}

export function RiderTicketChatScreen() {
  const { t } = useTranslation();

  const queryClient = useQueryClient();

  const insets = useSafeAreaInsets();

  const scrollRef = useRef<ScrollView>(null);
  const stickChatToEndRef = useRef(true);
  const messagesScrollTailRef = useRef<string | null>(null);
  const messageScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentSizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draft, setDraft] = useState("");
  const [chatFocused, setChatFocused] = useState(true);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [ratingValue, setRatingValue] = useState<number | null>(null);

  const [ratingFeedback, setRatingFeedback] = useState("");

  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const [hasTappedChatAgain, setHasTappedChatAgain] = useState(false);

  const [pendingAttachments, setPendingAttachments] = useState<ComposerPendingAttachment[]>([]);

  const [previewAttachmentUri, setPreviewAttachmentUri] = useState<string | null>(null);

  const { width: windowWidth } = useWindowDimensions();

  const attachmentImageWidth = Math.min(240, Math.max(160, Math.floor(windowWidth * 0.68)));

  const params = useLocalSearchParams<{ id?: string }>();

  const ticketId = paramId(params.id);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";

    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );

    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();

      hideSub.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setChatFocused(true);
      if (ticketId != null) {
        void queryClient.refetchQueries({
          queryKey: ["rider-support-ticket", ticketId],
          type: "active",
        });
      }
      return () => setChatFocused(false);
    }, [ticketId, queryClient]),
  );

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["rider-support-ticket", ticketId],

    queryFn: () => riderSupportService.getTicket(ticketId!),

    enabled: ticketId != null,

    placeholderData: keepPreviousData,

    refetchInterval: chatFocused ? POLL_MS : false,

    refetchIntervalInBackground: true,

    refetchOnWindowFocus: chatFocused,
  });

  const ticket = data?.ticket;

  const messages = data?.messages ?? [];

  const statusNorm = ticket ? ticketStatusNormalized(ticket.status) : "";

  const isResolvedOrClosed =
    statusNorm === "RESOLVED" || statusNorm === "CLOSED";

  const showRatingPrompt =
    !!ticket &&
    isResolvedOrClosed &&
    (ticket.satisfaction_rating == null ||
      Number.isNaN(ticket.satisfaction_rating)) &&
    !hasTappedChatAgain;

  const showComposer = !showRatingPrompt;

  const canSend =
    (draft.trim().length >= 1 || pendingAttachments.length > 0) &&
    showComposer &&
    (!isResolvedOrClosed || hasTappedChatAgain);

  const ratingSummary = useMemo(() => {
    if (
      !ticket ||
      ticket.satisfaction_rating == null ||
      Number.isNaN(ticket.satisfaction_rating)
    ) {
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

  const sendMutation = useMutation({
    mutationFn: async (payload: {
      text: string;
      localAttachments: ComposerPendingAttachment[];
    }) => {
      if (ticket && ticketId && isResolvedOrClosed && hasTappedChatAgain) {
        try {
          await riderSupportService.reopenTicket(ticketId);
        } catch {
          // Message POST also reopens; continue on failure.
        }
      }

      const uploaded: Array<{
        storageKey: string;
        name: string;
        mimeType: string;
        url: string;
      }> = [];

      for (let i = 0; i < payload.localAttachments.length; i++) {
        const att = payload.localAttachments[i];
        const meta = guessChatFileMeta(att.uri, i, att.fileName, att.mimeType);
        try {
          const row = await riderSupportService.uploadAttachment(ticketId!, {
            uri: att.uri,
            name: meta.name,
            mimeType: meta.mimeType,
          });
          uploaded.push({
            storageKey: row.storageKey,
            name: row.name || meta.name,
            mimeType: row.mimeType || meta.mimeType,
            url: row.url,
          });
        } catch {
          // Continue with other uploads.
        }
      }

      const trimmed = payload.text.trim();
      const messageText =
        trimmed ||
        (uploaded.length > 1
          ? "Shared attachments"
          : uploaded.length === 1
            ? "Shared an attachment"
            : trimmed);

      if (!messageText && uploaded.length === 0) {
        throw new Error("Nothing to send");
      }

      return riderSupportService.sendMessage(ticketId!, {
        message_text: messageText,
        attachments: uploaded.length ? uploaded : undefined,
      });
    },

    onSuccess: () => {
      setDraft("");
      setPendingAttachments([]);

      queryClient.invalidateQueries({
        queryKey: ["rider-support-ticket", ticketId],
      });

      queryClient.invalidateQueries({ queryKey: ["rider-support-tickets"] });
    },

    onError: (err) => {
      Alert.alert(
        t("profile.supportChat.sendFailed", "Could not send"),

        extractApiErrorMessage(err, "Try again"),
      );
    },
  });

  const onSend = useCallback(() => {
    const text = draft.trim();

    if ((!text && pendingAttachments.length === 0) || !ticketId || sendMutation.isPending || !canSend) {
      return;
    }

    sendMutation.mutate({
      text,
      localAttachments: pendingAttachments,
    });
  }, [draft, pendingAttachments, ticketId, sendMutation, canSend]);

  const openAttachmentPicker = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.status !== "undetermined") {
        Alert.alert(
          t("profile.supportFlow.photoPermission", "Permission needed"),
          t(
            "profile.supportFlow.photoPermissionMsg",
            "Allow photo access to attach proof.",
          ),
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.85,
        ...(Platform.OS === "android" ? { legacy: true } : {}),
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets
        .map((a) => ({
          uri: typeof a.uri === "string" ? a.uri.trim() : "",
          fileName: typeof a.fileName === "string" ? a.fileName : undefined,
          mimeType: typeof a.mimeType === "string" ? a.mimeType : undefined,
        }))
        .filter((x) => x.uri.length > 0);
      if (picked.length === 0) return;
      setPendingAttachments((prev) => {
        const merged = [...prev];
        for (const asset of picked) {
          merged.push({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            uri: asset.uri,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
          });
        }
        return merged.slice(0, 5);
      });
    } catch {
      Alert.alert(
        t("profile.supportChat.attachFailed", "Attachment failed"),
        t("profile.supportChat.attachFailedMsg", "Could not open gallery. Please try again."),
      );
    }
  }, [t]);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmitRating = async () => {
    if (!ticketId || !ticket || ratingSubmitting || !ratingValue) return;

    try {
      setRatingSubmitting(true);

      await riderSupportService.rateTicket(
        ticketId,
        ratingValue,
        ratingFeedback,
      );

      queryClient.invalidateQueries({
        queryKey: ["rider-support-ticket", ticketId],
      });

      queryClient.invalidateQueries({ queryKey: ["rider-support-tickets"] });
    } catch (err) {
      Alert.alert(
        t("profile.supportChat.ratingFailed", "Rating failed"),

        extractApiErrorMessage(
          err,
          "Could not submit rating. Please try again.",
        ),
      );
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleChatWithUs = () => {
    setHasTappedChatAgain(true);
  };

  const scrollChatToEndOnce = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const onChatScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const threshold = 160;
    const bottomMax = Math.max(0, contentSize.height - layoutMeasurement.height);
    stickChatToEndRef.current = bottomMax <= 8 || contentOffset.y >= bottomMax - threshold;
  }, []);

  const onChatContentSizeChange = useCallback(() => {
    if (!stickChatToEndRef.current) return;
    if (contentSizeDebounceRef.current) clearTimeout(contentSizeDebounceRef.current);
    contentSizeDebounceRef.current = setTimeout(() => {
      contentSizeDebounceRef.current = null;
      scrollChatToEndOnce(false);
    }, 120);
  }, [scrollChatToEndOnce]);

  /** Scroll only when the message tail changes — not on silent background refresh. */
  useEffect(() => {
    if (messages.length === 0) {
      messagesScrollTailRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    const tail = `${last.id}|${last.created_at}|${(last.attachments ?? []).length}`;
    const prevTail = messagesScrollTailRef.current;
    if (prevTail === tail) return;

    stickChatToEndRef.current = true;
    if (messageScrollDebounceRef.current) clearTimeout(messageScrollDebounceRef.current);
    const animated = prevTail != null;
    messageScrollDebounceRef.current = setTimeout(() => {
      messageScrollDebounceRef.current = null;
      scrollChatToEndOnce(animated);
      messagesScrollTailRef.current = tail;
    }, animated ? 52 : 0);
  }, [messages, scrollChatToEndOnce]);

  useEffect(() => {
    return () => {
      if (messageScrollDebounceRef.current) clearTimeout(messageScrollDebounceRef.current);
      if (contentSizeDebounceRef.current) clearTimeout(contentSizeDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (showRatingPrompt || ratingSummary) {
      requestAnimationFrame(() => scrollChatToEndOnce(true));
    }
  }, [showRatingPrompt, ratingSummary, scrollChatToEndOnce]);

  if (ticketId == null) {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.center}>
          <Text style={styles.errText}>
            {t("profile.supportChat.invalidTicket", "Invalid ticket")}
          </Text>

          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>{t("common.back", "Back")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const sb = ticket ? statusBadge(ticket.status) : null;

  const displayMessages: RiderTicketMessage[] = (() => {
    const list = [...messages];

    if (
      ticket?.description?.trim() &&
      !list.some((m) => m.message_text.trim() === ticket.description?.trim())
    ) {
      list.unshift({
        id: 0,

        message_text: ticket.description.trim(),

        message_type: "TEXT",

        sender_type: "RIDER",

        sender_id: null,

        sender_name: null,

        attachments: [],

        created_at: ticket.created_at,
      });
    }

    return list;
  })();

  const composerBottomPad = 8 + insets.bottom;

  const ratingBarBottomPad = 12 + insets.bottom;

  const keyboardPad = Platform.OS === "android" ? keyboardHeight : 0;

  return (
    <KeyboardAvoidingView
      style={[
        styles.flex,
        keyboardPad > 0 ? { paddingBottom: keyboardPad } : null,
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.flex} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </Pressable>

          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {ticket?.subject ||
                ticket?.ticket_title ||
                t("profile.supportChat.title", "Support chat")}
            </Text>

            {ticket ? (
              <Text style={styles.headerSub} numberOfLines={1}>
                #{ticket.ticket_id}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerTrailing}>
            <View style={styles.headerSyncSlot}>
              {isRefetching && !isLoading ? (
                <ActivityIndicator size="small" color={BRAND} />
              ) : null}
            </View>
            {sb ? (
              <View style={[styles.statusPill, { backgroundColor: sb.bg }]}>
                <Text style={[styles.statusPillText, { color: sb.color }]}>
                  {sb.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={BRAND} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errText}>
              {extractApiErrorMessage(
                error,
                t("profile.myQueueError", "Could not load tickets."),
              )}
            </Text>

            <Pressable onPress={() => refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>{t("common.retry", "Retry")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.body}>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.messagesContent}
              keyboardShouldPersistTaps="handled"
              onScroll={onChatScroll}
              scrollEventThrottle={64}
              onContentSizeChange={onChatContentSizeChange}
            >
              <View style={styles.introCard}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color={BRAND}
                />

                <Text style={styles.introText}>
                  {t(
                    "profile.supportChat.agentHint",

                    "GatiMitra support will reply here. You can send follow-up messages below.",
                  )}
                </Text>
              </View>

              {displayMessages.map((m, idx) => {
                const mine = isRiderMessage(m);
                const bodyText = formatTicketMessageText(m.message_text);
                const attachments = resolveTicketAttachmentList(m.attachments);
                const imageAttachments = attachments.filter((a) => a.isImage);
                const fileAttachments = attachments.filter((a) => !a.isImage);
                const showTextBubble =
                  !!bodyText &&
                  !(attachments.length > 0 && isAttachmentPlaceholderText(bodyText));
                const showRiderMeta =
                  mine && (showTextBubble || attachments.length === 0);

                const renderAttachmentCard = (
                  att: ResolvedTicketAttachment,
                  attIdx: number,
                  showMeta: boolean,
                ) =>
                  att.isImage ? (
                    <Pressable
                      key={`${m.id}-att-${attIdx}`}
                      onPress={() => setPreviewAttachmentUri(att.url)}
                      style={[
                        styles.attachmentCard,
                        mine ? styles.attachmentCardRider : styles.attachmentCardAgent,
                      ]}
                    >
                      <Image
                        source={{ uri: att.url }}
                        style={[
                          styles.attachmentImage,
                          { width: attachmentImageWidth },
                        ]}
                        resizeMode="cover"
                      />
                      {showMeta ? (
                        <View style={styles.attachmentCardMeta}>
                          <Ionicons
                            name="checkmark-done"
                            size={13}
                            color="rgba(255,255,255,0.9)"
                          />
                        </View>
                      ) : null}
                    </Pressable>
                  ) : (
                    <TouchableOpacity
                      key={`${m.id}-att-${attIdx}`}
                      onPress={() => void Linking.openURL(att.url)}
                      style={[
                        styles.attachmentCard,
                        mine ? styles.attachmentCardRider : styles.attachmentCardAgent,
                        styles.attachmentFileCard,
                      ]}
                    >
                      <Ionicons
                        name="document-attach-outline"
                        size={18}
                        color={mine ? "#FFFFFF" : BRAND}
                      />
                      <Text
                        style={[
                          styles.attachmentFileText,
                          mine ? styles.attachmentFileTextMine : null,
                        ]}
                        numberOfLines={1}
                      >
                        {att.name}
                      </Text>
                      {showMeta ? (
                        <View style={styles.attachmentCardMeta}>
                          <Ionicons
                            name="checkmark-done"
                            size={13}
                            color="rgba(255,255,255,0.9)"
                          />
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );

                return (
                  <View
                    key={m.id ? `m-${m.id}` : `seed-${idx}`}
                    style={[
                      styles.bubbleRow,
                      mine ? styles.bubbleRowRight : styles.bubbleRowLeft,
                    ]}
                  >
                    {!mine ? (
                      <View style={styles.avatar}>
                        <Ionicons
                          name="headset-outline"
                          size={16}
                          color="#9ED8C0"
                        />
                      </View>
                    ) : null}

                    <View
                      style={[
                        styles.bubbleColumn,
                        mine ? styles.bubbleColumnRight : null,
                        attachments.length > 0 ? styles.bubbleColumnWithMedia : null,
                      ]}
                    >
                      {!mine ? (
                        <View style={styles.agentLabelRow}>
                          <Text style={styles.agentLabel} numberOfLines={1}>
                            {AGENT_TEAM_LABEL}
                          </Text>
                        </View>
                      ) : null}

                      {showTextBubble ? (
                        <View
                          style={[
                            styles.bubble,
                            mine ? styles.bubbleRider : styles.bubbleAgent,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bubbleText,
                              mine
                                ? styles.bubbleTextRider
                                : styles.bubbleTextAgent,
                            ]}
                          >
                            {bodyText}
                          </Text>
                          {showRiderMeta ? (
                            <View style={styles.bubbleMetaRow}>
                              <Ionicons
                                name="checkmark-done"
                                size={13}
                                color="rgba(255,255,255,0.9)"
                              />
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {imageAttachments.length > 0 ? (
                        <View style={styles.attachmentStack}>
                          {imageAttachments.map((att, attIdx) =>
                            renderAttachmentCard(
                              att,
                              attIdx,
                              mine &&
                                !showTextBubble &&
                                attIdx === imageAttachments.length - 1 &&
                                fileAttachments.length === 0,
                            ),
                          )}
                        </View>
                      ) : null}

                      {fileAttachments.length > 0 ? (
                        <View style={styles.attachmentStack}>
                          {fileAttachments.map((att, attIdx) =>
                            renderAttachmentCard(
                              att,
                              imageAttachments.length + attIdx,
                              mine &&
                                !showTextBubble &&
                                attIdx === fileAttachments.length - 1,
                            ),
                          )}
                        </View>
                      ) : null}

                      <Text
                        style={[
                          styles.timeText,
                          mine ? styles.timeTextRider : styles.timeTextAgent,
                        ]}
                      >
                        {mine
                          ? riderTimeLabel(m.created_at)
                          : agentTimeLabel(m.created_at)}
                      </Text>
                    </View>

                    {mine ? (
                      <View style={[styles.avatar, styles.avatarRider]}>
                        <Ionicons
                          name="person-outline"
                          size={16}
                          color="#FFFFFF"
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}

            </ScrollView>

            {!!ratingSummary && (
              <>
                <View style={styles.ratingSummaryCard}>
                  <Text style={styles.ratingExperienceTitle}>
                    {t(
                      "profile.supportChat.experienceTitle",
                      "Support experience",
                    )}
                  </Text>

                  <View style={styles.ratingAutoSummaryRow}>
                    <Text style={styles.ratingAutoEmoji}>
                      {ratingSummary.emoji}
                    </Text>

                    <Text style={styles.ratingAutoLabel}>
                      {ratingSummary.label}
                    </Text>

                    <View style={styles.ratingAutoStarsRow}>
                      {Array.from({ length: ratingSummary.numeric }).map(
                        (_, i) => (
                          <Ionicons
                            key={i}
                            name="star"
                            size={14}
                            color="#FFC107"
                            style={styles.ratingAutoStarIcon}
                          />
                        ),
                      )}
                    </View>
                  </View>

                  <Text style={styles.ratingExperienceNote}>
                    {t(
                      "profile.supportChat.ratingThanks",

                      "Thank you for rating your support interaction.",
                    )}
                  </Text>

                  {!!ratingSummary.feedback && (
                    <Text
                      style={styles.ratingSummaryFeedback}
                    >{`"${ratingSummary.feedback}"`}</Text>
                  )}

                  {!!ratingSummary.submittedAt && (
                    <Text
                      style={styles.ratingSummaryMeta}
                    >{`Submitted on: ${ratingSummary.submittedAt}`}</Text>
                  )}
                </View>

                <View style={styles.ratingAutoCard}>
                  <View style={styles.ratingAutoHeaderRow}>
                    <Ionicons
                      name="information-circle"
                      size={16}
                      color={BRAND}
                      style={{ marginRight: 6 }}
                    />

                    <Text style={styles.ratingAutoTitle}>
                      {t(
                        "profile.supportChat.fromTeam",
                        "From GatiMitra Support Team",
                      )}
                    </Text>
                  </View>

                  {ratingSummary.numeric >= 3 ? (
                    <>
                      <Text style={styles.ratingAutoBody}>
                        {t(
                          "profile.supportChat.ratingPositive1",
                          "Thank you for sharing your feedback with us.",
                        )}
                      </Text>

                      <Text style={styles.ratingAutoBody}>
                        {t(
                          "profile.supportChat.ratingPositive2",

                          "We're glad the GatiMitra Support Team was able to assist you.",
                        )}
                      </Text>

                      <Text style={styles.ratingAutoSignature}>
                        – GatiMitra Team
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.ratingAutoBody}>
                        {t(
                          "profile.supportChat.ratingNegative1",

                          "We apologize that your experience did not meet your expectations.",
                        )}
                      </Text>

                      <Text style={styles.ratingAutoBody}>
                        {t(
                          "profile.supportChat.ratingNegative2",

                          "If you still need assistance, please contact us again.",
                        )}
                      </Text>

                      <Text style={styles.ratingAutoSignature}>
                        – GatiMitra Team
                      </Text>
                    </>
                  )}
                </View>
              </>
            )}

            {showRatingPrompt && ticket ? (
              <View
                style={[
                  styles.ratingBar,
                  { paddingBottom: ratingBarBottomPad },
                ]}
              >
                <View style={styles.ratingClosedPill}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color="#15803D"
                    style={{ marginRight: 6 }}
                  />

                  <Text style={styles.ratingClosedText}>
                    {statusNorm === "CLOSED"
                      ? t(
                          "profile.supportChat.convClosed",
                          "This conversation has been closed",
                        )
                      : t(
                          "profile.supportChat.convResolved",
                          "This conversation has been resolved",
                        )}
                  </Text>
                </View>

                <Text style={styles.ratingHeading}>
                  {t("profile.supportChat.ratingHey", "Hey there!")}
                </Text>

                <Text style={styles.ratingSubheading}>
                  {t(
                    "profile.supportChat.ratingClosedTicket",
                    "We just {{status}} ticket {{id}}.",
                    {
                      status: String(ticket.status ?? "closed").toLowerCase(),

                      id: ticket.ticket_id,
                    },
                  )}
                </Text>

                <Text style={styles.ratingSubheading}>
                  {t(
                    "profile.supportChat.ratingOneQuestion",
                    "We know you're busy, so we just have one question:",
                  )}
                </Text>

                <Text
                  style={[styles.ratingSubheading, styles.ratingQuestionBold]}
                >
                  {t(
                    "profile.supportChat.ratingSatisfied",

                    "Are you satisfied with the support you received in this ticket?",
                  )}
                </Text>

                <View style={styles.ratingEmojisRow}>
                  {RATING_OPTIONS.map((opt) => {
                    const selected = ratingValue === opt.value;

                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setRatingValue(opt.value)}
                        style={[
                          styles.ratingEmojiWrap,
                          selected && styles.ratingEmojiWrapSelected,
                        ]}
                      >
                        <Text style={styles.ratingEmoji}>{opt.emoji}</Text>

                        <Text
                          style={[
                            styles.ratingEmojiLabel,
                            selected && styles.ratingEmojiLabelSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.ratingFeedbackInput}
                  placeholder={t(
                    "profile.supportChat.ratingFeedbackPh",
                    "Share your feedback (optional)…",
                  )}
                  placeholderTextColor="#94A3B8"
                  value={ratingFeedback}
                  onChangeText={setRatingFeedback}
                  multiline
                />

                <Pressable
                  onPress={handleSubmitRating}
                  disabled={!ratingValue || ratingSubmitting}
                  style={[
                    styles.ratingSubmitBtn,
                    (!ratingValue || ratingSubmitting) &&
                      styles.ratingSubmitBtnDisabled,
                  ]}
                >
                  <Text style={styles.ratingSubmitText}>
                    {ratingSubmitting
                      ? t("profile.supportChat.ratingSubmitting", "Submitting…")
                      : t(
                          "profile.supportChat.ratingSubmit",
                          "Submit feedback",
                        )}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleChatWithUs}
                  style={styles.chatWithUsBtn}
                >
                  <Ionicons
                    name="chatbubbles-outline"
                    size={16}
                    color={BRAND}
                    style={{ marginRight: 6 }}
                  />

                  <Text style={styles.chatWithUsText}>
                    {t("profile.supportChat.chatAgain", "Chat with us again")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {showComposer ? (
              <View
                style={[
                  styles.composerBar,
                  { paddingBottom: composerBottomPad },
                ]}
              >
                {pendingAttachments.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.pendingAttachmentsRow}
                    contentContainerStyle={styles.pendingAttachmentsContent}
                  >
                    {pendingAttachments.map((att) => (
                      <View key={att.id} style={styles.pendingThumbWrap}>
                        <Pressable onPress={() => setPreviewAttachmentUri(att.uri)}>
                          <Image source={{ uri: att.uri }} style={styles.pendingThumb} />
                        </Pressable>
                        <Pressable
                          onPress={() => removePendingAttachment(att.id)}
                          style={styles.pendingRemoveBtn}
                          hitSlop={8}
                        >
                          <Ionicons name="close-circle" size={20} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.composerRow}>
                  <Pressable
                    onPress={openAttachmentPicker}
                    disabled={sendMutation.isPending}
                    style={({ pressed }) => [
                      styles.attachBtn,
                      pressed && styles.attachBtnPressed,
                      sendMutation.isPending && styles.attachBtnDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      "profile.supportChat.attachMedia",
                      "Attach photo",
                    )}
                  >
                    <Ionicons name="image-outline" size={22} color={BRAND} />
                  </Pressable>
                  <TextInput
                    style={styles.composerInput}
                    placeholder={t(
                      "profile.supportChat.placeholder",
                      "Type your message…",
                    )}
                    placeholderTextColor="#94A3B8"
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={2000}
                    editable={
                      !sendMutation.isPending &&
                      (!isResolvedOrClosed || hasTappedChatAgain)
                    }
                  />

                  <TouchableOpacity
                    onPress={onSend}
                    disabled={!canSend || sendMutation.isPending}
                    activeOpacity={0.85}
                    style={[
                      styles.sendCircle,

                      (!canSend || sendMutation.isPending) &&
                        styles.sendCircleDisabled,
                    ]}
                  >
                    {sendMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="send" size={20} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        )}
        <Modal
          visible={previewAttachmentUri != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewAttachmentUri(null)}
        >
          <View style={styles.previewBackdrop}>
            <Pressable
              style={[styles.previewCloseBtn, { top: insets.top + 12 }]}
              onPress={() => setPreviewAttachmentUri(null)}
              accessibilityRole="button"
              accessibilityLabel={t("common.close", "Close")}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
            {previewAttachmentUri ? (
              <Image
                source={{ uri: previewAttachmentUri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FFFFFF" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  errText: { fontSize: 14, color: "#64748B", textAlign: "center" },

  backLink: { marginTop: 12 },

  backLinkText: { fontSize: 15, fontWeight: "700", color: BRAND },

  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: BRAND,
    borderRadius: 8,
  },

  retryText: { color: "#FFFFFF", fontWeight: "700" },

  headerTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  headerSyncSlot: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: H_PAD,

    paddingVertical: 12,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: "#E2E8F0",

    backgroundColor: "#FFFFFF",

    gap: 10,
  },

  backBtn: {
    width: 40,

    height: 40,

    borderRadius: 20,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor: "#F1F5F9",
  },

  headerText: { flex: 1, minWidth: 0 },

  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },

  headerSub: { marginTop: 2, fontSize: 12, color: "#64748B" },

  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },

  statusPillText: { fontSize: 11, fontWeight: "700" },

  body: { flex: 1, minHeight: 0 },

  scroll: { flex: 1, minHeight: 0, backgroundColor: "#FFFFFF" },

  messagesContent: {
    paddingHorizontal: H_PAD,
    paddingVertical: 12,
    paddingBottom: 20,
  },

  introCard: {
    flexDirection: "row",

    alignItems: "flex-start",

    gap: 8,

    padding: 12,

    borderRadius: CARD_RADIUS,

    backgroundColor: colors.primary[50],

    borderWidth: 1,

    borderColor: colors.primary[100],

    marginBottom: 8,
  },

  introText: { flex: 1, fontSize: 12, color: "#334155", lineHeight: 18 },

  bubbleRow: { flexDirection: "row", marginBottom: 8, flexShrink: 1 },

  bubbleRowLeft: { justifyContent: "flex-start" },

  bubbleRowRight: { justifyContent: "flex-end", paddingRight: 4 },

  avatar: {
    width: 28,

    height: 28,

    borderRadius: 14,

    backgroundColor: "#F1F5F9",

    alignItems: "center",

    justifyContent: "center",

    marginRight: 6,
  },

  avatarRider: {
    marginRight: 0,

    marginLeft: 6,

    backgroundColor: BRAND,
  },

  bubbleColumn: { width: "80%", maxWidth: "80%", flexShrink: 1 },

  bubbleColumnRight: { alignItems: "flex-end" },

  bubbleColumnWithMedia: { gap: 6 },

  bubble: {
    maxWidth: "100%",

    minWidth: 96,

    borderRadius: 16,

    paddingHorizontal: 12,

    paddingVertical: 9,
  },

  bubbleRider: {
    backgroundColor: BUBBLE_RIDER,

    shadowColor: "#000",

    shadowOpacity: 0.08,

    shadowRadius: 4,

    shadowOffset: { width: 0, height: 2 },

    elevation: 2,
  },

  bubbleAgent: {
    backgroundColor: "#FFFFFF",

    borderWidth: 1,

    borderColor: "#E2E8F0",
  },

  bubbleText: { fontSize: 14, lineHeight: 20 },

  bubbleTextRider: { color: "#FFFFFF" },

  bubbleTextAgent: { color: "#0F172A" },

  attachmentStack: {
    gap: 8,
    width: "100%",
  },
  attachmentCard: {
    borderRadius: 14,
    overflow: "hidden",
    maxWidth: "100%",
  },
  attachmentCardRider: {
    backgroundColor: BUBBLE_RIDER,
    alignSelf: "flex-end",
  },
  attachmentCardAgent: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignSelf: "flex-start",
  },
  attachmentImage: {
    height: 180,
    backgroundColor: "#E2E8F0",
  },
  attachmentCardMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 4,
  },
  attachmentFileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 160,
  },
  attachmentFileText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  attachmentFileTextMine: {
    color: "#FFFFFF",
  },
  pendingAttachmentsRow: {
    marginBottom: 8,
    maxHeight: 88,
  },
  pendingAttachmentsContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  pendingThumbWrap: {
    position: "relative",
  },
  pendingThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
  },
  pendingRemoveBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  attachBtnPressed: { opacity: 0.85, backgroundColor: "#CCFBF1" },
  attachBtnDisabled: { opacity: 0.5 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: H_PAD,
  },
  previewCloseBtn: {
    position: "absolute",
    right: H_PAD,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "78%",
  },

  bubbleMetaRow: {
    marginTop: 4,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "flex-end",
  },

  agentLabelRow: { flexDirection: "row", marginBottom: 2, marginLeft: 4 },

  agentLabel: { fontSize: 11, fontWeight: "600", color: BRAND, flexShrink: 1 },

  timeText: { marginTop: 4, fontSize: 10, color: "#64748B" },

  timeTextRider: { alignSelf: "flex-end" },

  timeTextAgent: { alignSelf: "flex-start" },

  composerBar: {
    flexShrink: 0,

    paddingHorizontal: H_PAD,

    paddingTop: 8,

    borderTopWidth: StyleSheet.hairlineWidth,

    borderTopColor: "#E2E8F0",

    backgroundColor: "#FFFFFF",
  },

  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },

  composerInput: {
    flex: 1,

    minWidth: 0,

    minHeight: 40,

    maxHeight: 100,

    borderWidth: 1,

    borderColor: "#E2E8F0",

    borderRadius: 22,

    paddingHorizontal: 16,

    paddingVertical: Platform.OS === "ios" ? 10 : 8,

    fontSize: 15,

    color: "#0F172A",

    backgroundColor: "#F8FAFC",
  },

  sendCircle: {
    width: 44,

    height: 44,

    borderRadius: 22,

    backgroundColor: BRAND,

    alignItems: "center",

    justifyContent: "center",

    flexShrink: 0,
  },

  sendCircleDisabled: { backgroundColor: colors.primary[200] },

  ratingBar: {
    paddingHorizontal: H_PAD,

    paddingVertical: 12,

    borderTopWidth: 1,

    borderTopColor: "#E2E8F0",

    backgroundColor: "#FFFFFF",
  },

  ratingClosedPill: {
    flexDirection: "row",

    alignItems: "center",

    alignSelf: "center",

    paddingHorizontal: 12,

    paddingVertical: 4,

    borderRadius: 999,

    backgroundColor: "#F1F5F9",

    marginBottom: 8,
  },

  ratingClosedText: { fontSize: 11, fontWeight: "600", color: "#64748B" },

  ratingHeading: {
    fontSize: 13,

    fontWeight: "700",

    color: "#0F172A",

    textAlign: "center",

    marginBottom: 2,
  },

  ratingSubheading: {
    fontSize: 12,

    color: "#64748B",

    textAlign: "center",

    marginBottom: 6,
  },

  ratingQuestionBold: { fontWeight: "600", marginBottom: 10 },

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

    borderRadius: CARD_RADIUS,

    backgroundColor: "#F8FAFC",

    borderWidth: 1,

    borderColor: "#E2E8F0",
  },

  ratingEmojiWrapSelected: {
    backgroundColor: "#ecfdf3",

    borderColor: BRAND,
  },

  ratingEmoji: { fontSize: 20, marginBottom: 2 },

  ratingEmojiLabel: { fontSize: 10, color: "#64748B", textAlign: "center" },

  ratingEmojiLabelSelected: { fontWeight: "600", color: BRAND },

  ratingFeedbackInput: {
    minHeight: 60,

    maxHeight: 100,

    borderRadius: CARD_RADIUS,

    borderWidth: 1,

    borderColor: "#E2E8F0",

    backgroundColor: "#FFFFFF",

    paddingHorizontal: 10,

    paddingVertical: 8,

    fontSize: 13,

    color: "#0F172A",

    marginBottom: 10,
  },

  ratingSubmitBtn: {
    alignSelf: "flex-end",

    paddingHorizontal: 16,

    paddingVertical: 8,

    borderRadius: 999,

    backgroundColor: BRAND,
  },

  ratingSubmitBtnDisabled: { opacity: 0.5 },

  ratingSubmitText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },

  chatWithUsBtn: {
    flexDirection: "row",

    alignItems: "center",

    alignSelf: "center",

    marginTop: 8,

    paddingHorizontal: 14,

    paddingVertical: 6,

    borderRadius: 999,

    borderWidth: 1,

    borderColor: BRAND,

    backgroundColor: "#F8FAFC",
  },

  chatWithUsText: { fontSize: 12, fontWeight: "600", color: BRAND },

  ratingSummaryCard: {
    marginHorizontal: H_PAD,

    marginTop: 4,

    marginBottom: 6,

    paddingHorizontal: 14,

    paddingVertical: 12,

    borderRadius: CARD_RADIUS,

    backgroundColor: "#FFFFFF",

    borderWidth: 1,

    borderColor: "#E2E8F0",
  },

  ratingExperienceTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 6,
  },

  ratingAutoSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  ratingAutoEmoji: { fontSize: 18, marginRight: 6 },

  ratingAutoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    marginRight: 6,
  },

  ratingAutoStarsRow: { flexDirection: "row", alignItems: "center" },

  ratingAutoStarIcon: { marginRight: 2 },

  ratingExperienceNote: { marginTop: 4, fontSize: 11, color: "#64748B" },

  ratingSummaryFeedback: { fontSize: 12, color: "#64748B", marginTop: 8 },

  ratingSummaryMeta: { marginTop: 6, fontSize: 11, color: "#94A3B8" },

  ratingAutoCard: {
    marginHorizontal: H_PAD,

    marginBottom: 8,

    paddingHorizontal: 13,

    paddingVertical: 10,

    borderRadius: CARD_RADIUS,

    backgroundColor: "#F8FAFC",

    borderWidth: 1,

    borderColor: "#E2E8F0",
  },

  ratingAutoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  ratingAutoTitle: { fontSize: 12, fontWeight: "600", color: "#0F172A" },

  ratingAutoBody: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
    marginTop: 2,
  },

  ratingAutoSignature: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 8,
    fontStyle: "italic",
  },
});
