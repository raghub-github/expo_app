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
 *  - CSAT sheet appears when status flips to RESOLVED/CLOSED (one-time per ticket).
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
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  customerSupportService,
  type TicketDetailResponse,
  type TicketMessage,
  type TicketAttachment,
} from "@/services/customerSupport.service";
import { useTicketRealtime } from "@/hooks/useTicketRealtime";
import { getConfig } from "@/config/env";
import { GatiMitraColors } from "@/constants/gatimitra";

const FALLBACK_POLL_MS = 4_000;

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
  const [csatVisible, setCsatVisible] = useState(false);
  const [csatRating, setCsatRating] = useState(0);
  const [csatFeedback, setCsatFeedback] = useState("");
  const [csatSubmitting, setCsatSubmitting] = useState(false);
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

  // Show CSAT once when status flips to RESOLVED/CLOSED if no rating yet
  useEffect(() => {
    if (!ticket) return;
    const isTerminal = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
    const alreadyRated = ticket.satisfaction_rating != null;
    if (isTerminal && !alreadyRated && !csatVisible) {
      setCsatVisible(true);
    }
  }, [ticket?.status, ticket?.satisfaction_rating]);

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
        attachments: pendingAttachments.map((a) => a.storageKey),
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

  const submitCsat = useCallback(async () => {
    if (!ticketIdNum || csatRating < 1 || csatRating > 5) return;
    setCsatSubmitting(true);
    try {
      await customerSupportService.rateTicket(ticketIdNum, csatRating, csatFeedback.trim() || undefined);
      setCsatVisible(false);
      await refetch();
    } catch (e) {
      console.warn("csat failed", e);
      Alert.alert("Couldn't submit", "Could not save your rating. Try again later.");
    } finally {
      setCsatSubmitting(false);
    }
  }, [ticketIdNum, csatRating, csatFeedback, refetch]);

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
  const isTerminal = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.headerSubject} numberOfLines={2}>
            {ticket.subject || ticket.ticket_title || "Ticket"}
          </Text>
          <View style={[styles.badge, { backgroundColor: sb.bg }]}>
            <Text style={[styles.badgeText, { color: sb.color }]}>{sb.label}</Text>
          </View>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.ref}>#{ticket.ticket_id}</Text>
          {ticket.order_id ? (
            <Text style={styles.ref}> • Order linked</Text>
          ) : null}
          <View style={[styles.live, postgresLive ? styles.liveOn : styles.liveOff]}>
            <View style={[styles.liveDot, postgresLive ? styles.liveDotOn : styles.liveDotOff]} />
            <Text style={styles.liveText}>{postgresLive ? "Live" : "Reconnecting…"}</Text>
          </View>
        </View>
      </View>

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
        {isTerminal && (
          <View style={styles.resolvedBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#15803d" />
            <Text style={styles.resolvedText}>
              This ticket is {ticket.status === "CLOSED" ? "closed" : "resolved"}. Reply to reopen, or rate your experience above.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Pending attachments preview row */}
      {pendingAttachments.length > 0 && (
        <ScrollView horizontal style={styles.attachmentsRow} showsHorizontalScrollIndicator={false}>
          {pendingAttachments.map((a, idx) => (
            <View key={idx} style={styles.attachmentTile}>
              {a.localPreviewUri ? (
                <Image source={{ uri: a.localPreviewUri }} style={styles.attachmentImage} />
              ) : (
                <View style={styles.attachmentFile}>
                  <Ionicons name="document" size={22} color={GatiMitraColors.emerald} />
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
            <Text style={styles.closedText}>This ticket is closed. To get help again, raise a new ticket.</Text>
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
              onPress={ticket.status === "RESOLVED" ? () => void reopen().then(sendMessage) : sendMessage}
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

      {/* CSAT sheet */}
      {csatVisible && (
        <Pressable style={styles.csatBackdrop} onPress={csatSubmitting ? undefined : () => setCsatVisible(false)}>
          <Pressable style={styles.csatSheet} onPress={() => {}}>
            <Text style={styles.csatTitle}>How did we do?</Text>
            <Text style={styles.csatSub}>Rate your experience on this ticket.</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setCsatRating(s)}>
                  <Ionicons
                    name={s <= csatRating ? "star" : "star-outline"}
                    size={36}
                    color={s <= csatRating ? "#f59e0b" : "#cbd5e1"}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              placeholder="Anything you'd like to add? (optional)"
              placeholderTextColor={GatiMitraColors.textSecondary}
              value={csatFeedback}
              onChangeText={setCsatFeedback}
              multiline
              style={styles.csatInput}
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.csatSubmit, csatRating < 1 && styles.sendBtnDisabled]}
              onPress={submitCsat}
              disabled={csatRating < 1 || csatSubmitting}
            >
              {csatSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.csatSubmitText}>Submit</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCsatVisible(false)} style={styles.csatSkip}>
              <Text style={styles.csatSkipText}>Skip for now</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}
    </KeyboardAvoidingView>
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
        <Text style={styles.systemText}>{message.message_text}</Text>
      </View>
    );
  }
  const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
    .map(resolveAttachmentUrl)
    .filter((a): a is { name: string; url: string; isImage: boolean } => !!a);

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
        {message.message_text ? (
          <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.message_text}</Text>
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
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  errText: { color: GatiMitraColors.textSecondary, marginBottom: 12 },
  retryBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  headerCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headerSubject: { flex: 1, fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  headerMeta: { flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 },
  ref: { fontSize: 12, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
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
    backgroundColor: GatiMitraColors.emerald,
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
  bubbleMine: { backgroundColor: GatiMitraColors.emerald, borderBottomRightRadius: 4 },
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
    color: GatiMitraColors.emerald,
    marginBottom: 3,
    letterSpacing: 0.2,
  },
  bubbleText: { fontSize: 14, color: GatiMitraColors.textPrimary, lineHeight: 20 },
  bubbleTextMine: { color: "#fff" },
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
    backgroundColor: GatiMitraColors.emerald,
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
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closedCtaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  csatBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  csatSheet: { backgroundColor: "#fff", borderRadius: 18, padding: 20 },
  csatTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraColors.textPrimary },
  csatSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4, marginBottom: 12 },
  starRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 8 },
  csatInput: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 70,
    color: GatiMitraColors.textPrimary,
    marginTop: 8,
  },
  csatSubmit: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  csatSubmitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  csatSkip: { paddingVertical: 10, alignItems: "center" },
  csatSkipText: { color: GatiMitraColors.textSecondary, fontSize: 13 },
});
