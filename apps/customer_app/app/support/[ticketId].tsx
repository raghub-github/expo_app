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
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { formatTicketMessageText } from "@/lib/formatTicketMessage";
import {
  customerSupportService,
  type TicketDetailResponse,
  type TicketMessage,
  type TicketAttachment,
} from "@/services/customerSupport.service";
import { useTicketRealtime } from "@/hooks/useTicketRealtime";
import { getConfig } from "@/config/env";
import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const FALLBACK_POLL_MS = 4_000;

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
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ storageKey: string; url: string; name: string; mimeType: string; localPreviewUri?: string }>
  >([]);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const prevMessageCountRef = useRef(0);

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
    enabled: ticketIdNum != null,
    onStale: () => {
      void refetch();
    },
  });

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

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

  const pickImage = useCallback(async () => {
    if (!ticketIdNum) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow photo access to attach images.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const filename =
        asset.fileName || asset.uri.split("/").pop() || `image-${Date.now()}.jpg`;
      const mime = asset.mimeType || "image/jpeg";
      setSending(true);
      const uploaded = await customerSupportService.uploadAttachment(ticketIdNum, {
        uri: asset.uri,
        name: filename,
        mimeType: mime,
      });
      setPendingAttachments((prev) => [
        ...prev,
        {
          storageKey: uploaded.storageKey,
          url: uploaded.url,
          name: uploaded.name,
          mimeType: uploaded.mimeType,
          localPreviewUri: asset.uri,
        },
      ]);
    } catch (e) {
      console.warn("pickImage failed", e);
      Alert.alert("Upload failed", "Could not upload image. Try again.");
    } finally {
      setSending(false);
    }
  }, [ticketIdNum]);

  const sendMessage = useCallback(async () => {
    if (!ticketIdNum) return;
    const text = draft.trim();
    if (!text && pendingAttachments.length === 0) return;
    setSending(true);
    try {
      await customerSupportService.sendMessage(ticketIdNum, {
        message_text: text || "(attachment)",
        attachments: pendingAttachments.map((a) => ({
          storageKey: a.storageKey,
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
        })),
      });
      setDraft("");
      setPendingAttachments([]);
      await refetch();
    } catch (e) {
      console.warn("sendMessage failed", e);
      Alert.alert("Send failed", "Could not send your message. Try again.");
    } finally {
      setSending(false);
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

  const canSend = useMemo(
    () => !sending && (draft.trim().length > 0 || pendingAttachments.length > 0),
    [sending, draft, pendingAttachments.length]
  );

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
  const isTerminal = statusNorm === "RESOLVED" || statusNorm === "CLOSED";
  const showRatingPrompt =
    !!ticket &&
    isTerminal &&
    (ticket.satisfaction_rating == null || Number.isNaN(Number(ticket.satisfaction_rating)));

  if (ticketIdNum == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errText}>Invalid ticket</Text>
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
        <Text style={styles.errText}>Could not load ticket</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sb = statusBadge(ticket.status);
  const ratingBarBottomPad = 12 + insets.bottom;

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.screen}>
        <View style={[styles.navHeader, { paddingTop: Math.max(insets.top - 8, 0) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.navSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Support chat</Text>
          <View style={styles.navSide} />
        </View>

        <View style={styles.headerCard}>
          <View style={styles.headerAccent} />
          <View style={styles.headerBody}>
            <View style={styles.headerTop}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="chatbubbles-outline" size={18} color={GREEN} />
              </View>
              <Text style={styles.headerSubject} numberOfLines={2}>
                {ticket.subject || ticket.ticket_title || "Ticket"}
              </Text>
              <View style={[styles.badge, { backgroundColor: sb.bg }]}>
                <Text style={[styles.badgeText, { color: sb.color }]}>{sb.label}</Text>
              </View>
            </View>
            <View style={styles.headerMeta}>
              <View style={styles.ticketIdPill}>
                <Text style={styles.ticketIdText}>#{ticket.ticket_id}</Text>
              </View>
              {ticket.order_id ? (
                <View style={styles.orderLinkedPill}>
                  <Ionicons name="receipt-outline" size={11} color={GREEN} />
                  <Text style={styles.orderLinkedText}>Order linked</Text>
                </View>
              ) : null}
              <View style={[styles.live, postgresLive ? styles.liveOn : styles.liveOff]}>
                <View style={[styles.liveDot, postgresLive ? styles.liveDotOn : styles.liveDotOff]} />
                <Text style={styles.liveText}>{postgresLive ? "Live" : "Reconnecting…"}</Text>
              </View>
            </View>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {/* Original description as the first "customer" message */}
        {ticket.description ? (
          <MessageBubble
            mine
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
              message={m}
              showSender={!mine && isFirstOfStreak}
              tightTop={!isFirstOfStreak}
            />
          );
        })}
        {isTerminal && !showRatingPrompt && !ratingSummary && (
          <View style={styles.resolvedBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#15803d" />
            <Text style={styles.resolvedText}>
              This ticket is {statusNorm === "CLOSED" ? "closed" : "resolved"}. Reply below to reopen.
            </Text>
          </View>
        )}
      </ScrollView>

      {!!ratingSummary && (
        <>
          <View style={styles.ratingSummaryCard}>
            <Text style={styles.ratingExperienceTitle}>Support experience</Text>
            <View style={styles.ratingAutoSummaryRow}>
              <Text style={styles.ratingAutoEmoji}>{ratingSummary.emoji}</Text>
              <Text style={styles.ratingAutoLabel}>{ratingSummary.label}</Text>
              <View style={styles.ratingAutoStarsRow}>
                {Array.from({ length: ratingSummary.numeric }).map((_, idx) => (
                  <Ionicons key={idx} name="star" size={14} color="#FFC107" style={styles.ratingAutoStarIcon} />
                ))}
              </View>
            </View>
            <Text style={styles.ratingExperienceNote}>
              Thank you for rating your support interaction.
            </Text>
            {!!ratingSummary.feedback && (
              <Text style={styles.ratingSummaryFeedback}>{`"${ratingSummary.feedback}"`}</Text>
            )}
            {!!ratingSummary.submittedAt && (
              <Text style={styles.ratingSummaryMeta}>{`Submitted on: ${ratingSummary.submittedAt}`}</Text>
            )}
          </View>

          <View style={styles.ratingAutoCard}>
            <View style={styles.ratingAutoHeaderRow}>
              <Ionicons name="information-circle" size={16} color={GREEN} style={{ marginRight: 6 }} />
              <Text style={styles.ratingAutoTitle}>From GatiMitra Support Team</Text>
            </View>
            {ratingSummary.numeric >= 3 ? (
              <>
                <Text style={styles.ratingAutoBody}>Thank you for sharing your feedback with us.</Text>
                <Text style={styles.ratingAutoBody}>
                  We're glad that the <Text style={styles.ratingAutoBold}>GatiMitra Support Team</Text> was able
                  to assist you and resolve your concern.
                </Text>
                <Text style={styles.ratingAutoSignature}>– GatiMitra Team</Text>
              </>
            ) : (
              <>
                <Text style={styles.ratingAutoBody}>
                  We sincerely apologize that your experience did not meet your expectations. The{" "}
                  <Text style={styles.ratingAutoBold}>GatiMitra Team</Text> will review this case to improve our
                  support.
                </Text>
                <Text style={styles.ratingAutoBody}>
                  If you still need assistance, reply below to reopen this ticket.
                </Text>
                <Text style={styles.ratingAutoSignature}>– GatiMitra Team</Text>
              </>
            )}
          </View>
        </>
      )}

      {showRatingPrompt && (
        <View style={[styles.ratingBar, { paddingBottom: ratingBarBottomPad }]}>
          <View style={styles.ratingClosedPill}>
            <Ionicons name="checkmark-circle" size={16} color="#15803d" style={{ marginRight: 6 }} />
            <Text style={styles.ratingClosedText}>
              {statusNorm === "CLOSED"
                ? "This conversation has been closed"
                : "This conversation has been resolved"}
            </Text>
          </View>

          <Text style={styles.ratingHeading}>Hey there!</Text>
          <Text style={styles.ratingSubheading}>
            {`We just ${String(ticket.status ?? "closed").toLowerCase()} ticket ${ticket.ticket_id}.`}
          </Text>
          <Text style={styles.ratingSubheading}>We know you're busy, so we just have one question:</Text>
          <Text style={[styles.ratingSubheading, styles.ratingQuestion]}>
            Are you satisfied with the support you received in this ticket?
          </Text>

          <View style={styles.ratingEmojisRow}>
            {RATING_OPTIONS.map((opt) => {
              const selected = ratingValue === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setRatingValue(opt.value)}
                  style={[styles.ratingEmojiWrap, selected && styles.ratingEmojiWrapSelected]}
                >
                  <Text style={styles.ratingEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.ratingEmojiLabel, selected && styles.ratingEmojiLabelSelected]}>
                    {opt.label}
                  </Text>
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
            <Text style={styles.ratingSubmitText}>
              {ratingSubmitting ? "Submitting…" : "Submit feedback"}
            </Text>
          </Pressable>
        </View>
      )}

      {!showRatingPrompt && (
        <>
          {pendingAttachments.length > 0 && (
            <ScrollView horizontal style={styles.attachmentsRow} showsHorizontalScrollIndicator={false}>
              {pendingAttachments.map((a, idx) => (
                <View key={idx} style={styles.attachmentTile}>
                  {a.localPreviewUri ? (
                    <Image source={{ uri: a.localPreviewUri }} style={styles.attachmentImage} />
                  ) : (
                    <View style={styles.attachmentFile}>
                      <Ionicons name="document" size={22} color={GREEN} />
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => setPendingAttachments((p) => p.filter((_, i) => i !== idx))}
                    style={styles.attachmentRemove}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
            {ticket.status === "CLOSED" ? (
              <View style={styles.closedRow}>
                <Text style={styles.closedText}>
                  This ticket is closed. To get help again, raise a new ticket.
                </Text>
                <TouchableOpacity style={styles.closedCta} onPress={() => router.push("/support/new")}>
                  <Text style={styles.closedCtaText}>Raise new</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity onPress={pickImage} style={styles.composerIconBtn} disabled={sending}>
                  <Ionicons name="image-outline" size={22} color={GatiMitraColors.textSecondary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.composerInput}
                  placeholder={ticket.status === "RESOLVED" ? "Reply to reopen…" : "Type your reply…"}
                  placeholderTextColor={GatiMitraColors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={5000}
                  editable={!sending}
                />
                <TouchableOpacity
                  onPress={
                    ticket.status === "RESOLVED" ? () => void reopen().then(sendMessage) : sendMessage
                  }
                  disabled={!canSend}
                  style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}

        </KeyboardAvoidingView>
      </View>
    </>
  );
}

function MessageBubble({
  message,
  mine,
  showSender = true,
  tightTop = false,
}: {
  message: TicketMessage;
  mine: boolean;
  showSender?: boolean;
  tightTop?: boolean;
}) {
  const senderType = String(message.sender_type || "").toUpperCase();
  if (senderType === "SYSTEM") {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{formatTicketMessageText(message.message_text)}</Text>
      </View>
    );
  }
  const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
    .map(resolveAttachmentUrl)
    .filter((a): a is { name: string; url: string; isImage: boolean } => !!a);
  const bodyText = formatTicketMessageText(message.message_text);

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
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!mine && showSender ? <Text style={styles.supportLabel}>Support</Text> : null}
        {bodyText ? (
          <Text
            style={[
              styles.bubbleText,
              mine && styles.bubbleTextMine,
              !mine && styles.bubbleTextTheirs,
            ]}
          >
            {bodyText}
          </Text>
        ) : null}
        {attachments.length > 0 && (
          <View style={styles.attachmentsInline}>
            {attachments.map((a, i) =>
              a.isImage ? (
                <TouchableOpacity key={i} onPress={() => Linking.openURL(a.url)}>
                  <Image source={{ uri: a.url }} style={styles.attachmentInlineImage} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={i}
                  onPress={() => Linking.openURL(a.url)}
                  style={[
                    styles.attachmentInlineFile,
                    mine && { backgroundColor: "rgba(255,255,255,0.18)" },
                  ]}
                >
                  <Ionicons
                    name="document-attach"
                    size={18}
                    color={mine ? "#fff" : GatiMitraColors.emerald}
                  />
                  <Text
                    style={[
                      styles.attachmentInlineFileText,
                      mine && { color: "#fff" },
                    ]}
                    numberOfLines={1}
                  >
                    {a.name}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}
        <Text style={[styles.timestamp, mine && styles.timestampMine]}>{formatTime(message.created_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F5F5" },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBEBEB",
  },
  navSide: { width: 40, alignItems: "flex-start" },
  navTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: TEXT,
  },
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#F5F5F5" },
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
    padding: 12,
    paddingLeft: 10,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  headerSubject: { flex: 1, fontSize: 15, fontWeight: "700", color: TEXT, lineHeight: 20 },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 6,
  },
  ticketIdPill: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ticketIdText: { fontSize: 11, color: MUTED, fontWeight: "700" },
  orderLinkedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  orderLinkedText: { fontSize: 11, color: GREEN, fontWeight: "700" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  live: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" },
  liveOn: {},
  liveOff: { opacity: 0.6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveDotOn: { backgroundColor: "#15803d" },
  liveDotOff: { backgroundColor: "#9ca3af" },
  liveText: { fontSize: 11, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  thread: { flex: 1 },
  row: { width: "100%", marginBottom: 10, flexDirection: "row", alignItems: "flex-end" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start", gap: 6 },
  /** Pulls the bubble closer to the previous one when we suppress the avatar+label. */
  rowTight: { marginBottom: 3 },
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
    maxWidth: "78%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: GREEN, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  /** Generic "Support" label above agent messages — never shows the agent's personal name. */
  supportLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: GREEN,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  bubbleText: { fontSize: 14, color: GatiMitraColors.textPrimary, lineHeight: 21 },
  bubbleTextMine: { color: "#fff" },
  bubbleTextTheirs: { color: "#1f2937" },
  timestamp: { fontSize: 10, color: GatiMitraColors.textSecondary, marginTop: 4, alignSelf: "flex-end" },
  timestampMine: { color: "#e0f2f1" },
  systemRow: { width: "100%", alignItems: "center", paddingVertical: 6 },
  systemText: {
    fontSize: 11,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    maxHeight: 80,
  },
  attachmentTile: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    marginRight: 8,
    position: "relative",
    overflow: "hidden",
  },
  attachmentImage: { width: "100%", height: "100%" },
  attachmentFile: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
  },
  composerIconBtn: { padding: 8 },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    color: GatiMitraColors.textPrimary,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: GREEN,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.5 },
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
