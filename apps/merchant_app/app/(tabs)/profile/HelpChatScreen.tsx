import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
  RefreshControl,
  Modal,
  Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getTicketMessages,
  postTicketMessage,
  createStoreTicket,
  rateTicket,
  reopenTicket,
  type TicketMessage,
  type TicketSummary,
} from "@/services/ticketApi";

const QUICK_OPTIONS_BY_SECTION: Record<string, string[]> = {
  outlet_status: [
    "I want to go online",
    "I want to go offline",
    "My store status is stuck",
    "Visibility or restriction issue",
    "Other",
  ],
  orders: [
    "I am not receiving orders",
    "Order got cancelled by mistake",
    "Delivery delay issue",
    "Wrong order received",
    "Other",
  ],
  restaurant: [
    "Update timings or contacts",
    "FSSAI or documents",
    "Bank account or KYC",
    "Other",
  ],
  address: [
    "Update my outlet address",
    "Map location is wrong",
    "Coverage area issue",
    "Other",
  ],
  menu: [
    "I want to update my menu",
    "Item photos or prices",
    "Availability or charges",
    "Other",
  ],
  payments: [
    "Payout not received",
    "Wrong amount credited",
    "Settlement or invoice query",
    "Other",
  ],
  taxes: [
    "GST or TCS query",
    "TDS or tax reports",
    "Compliance issue",
    "Other",
  ],
  ads: [
    "Promotions or boosts",
    "Visibility or campaigns",
    "Other",
  ],
  branding: [
    "Standees or stickers",
    "Marketing materials",
    "Other",
  ],
  reports: [
    "Analytics or performance",
    "Ratings or insights",
    "Other",
  ],
  hygiene_audit: [
    "Upload hygiene audit report",
    "Request audit report",
    "Other",
  ],
  other: [
    "I need help with something else",
    "Other",
  ],
};

const DEFAULT_QUICK_OPTIONS = [
  "I need help with my issue",
  "Other",
];

const RATING_OPTIONS = [
  { value: 1, label: "Very poor", emoji: "😡" },
  { value: 2, label: "Poor", emoji: "🙁" },
  { value: 3, label: "Neutral", emoji: "😐" },
  { value: 4, label: "Good", emoji: "🙂" },
  { value: 5, label: "Excellent", emoji: "😍" },
] as const;

const SKELETON_BG = "#E2E8F0";

function SkeletonBubble({
  align,
  animatedValue,
}: {
  align: "left" | "right";
  animatedValue: Animated.Value;
}) {
  const isLeft = align === "left";
  return (
    <View
      style={[
        styles.skeletonBubbleRow,
        isLeft ? styles.bubbleRowLeft : styles.bubbleRowRight,
      ]}
    >
      {isLeft && <View style={styles.skeletonAvatar} />}
      <View style={styles.skeletonBubbleColumn}>
        {isLeft && (
          <Animated.View
            style={[
              styles.skeletonAgentLabel,
              { opacity: animatedValue, backgroundColor: SKELETON_BG },
            ]}
          />
        )}
        <Animated.View
          style={[
            styles.skeletonBubble,
            { opacity: animatedValue, backgroundColor: SKELETON_BG },
          ]}
        />
        <Animated.View
          style={[
            styles.skeletonTime,
            { opacity: animatedValue, backgroundColor: SKELETON_BG },
          ]}
        />
      </View>
    </View>
  );
}

export default function HelpChatScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { ticketId, sectionId, sectionTitle } = useLocalSearchParams<{
    ticketId?: string;
    sectionId?: string;
    sectionTitle?: string;
  }>();
  const insets = useSafeAreaInsets();

  const [ticket, setTicket] = useState<TicketSummary | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [showQuickOptions, setShowQuickOptions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [hasTappedChatAgain, setHasTappedChatAgain] = useState(false);
  const [showTicketCreatedToast, setShowTicketCreatedToast] = useState(false);

  /** Ticket ID created in this session via Help & Support (create flow). Used to show "Request received" only then, not when opening from My Tickets. */
  const createdInThisSessionRef = useRef<number | null>(null);

  const skeletonPulse = useState(() => new Animated.Value(0.5))[0];

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [skeletonPulse]);

  const storeId = selectedStore?.id ?? null;
  const initialNumericId = ticketId ? Number(ticketId) : NaN;
  const [activeTicketId, setActiveTicketId] = useState<number | null>(
    Number.isInteger(initialNumericId) && initialNumericId > 0 ? initialNumericId : null
  );

  const statusLabel = useMemo(() => {
    if (!ticket) return "New";
    const s = (ticket.status || "").toUpperCase();
    switch (s) {
      case "OPEN":
        return "Open";
      case "IN_PROGRESS":
        return "In progress";
      case "WAITING_FOR_USER":
        return "Waiting for you";
      case "RESOLVED":
        return "Resolved";
      case "CLOSED":
        return "Closed";
      default:
        return s || "Open";
    }
  }, [ticket?.status]);

  const statusStyle = useMemo(() => {
    if (!ticket) return styles.statusOpen;
    const s = (ticket.status || "").toUpperCase();
    if (s === "RESOLVED" || s === "CLOSED") return styles.statusResolved;
    if (s === "WAITING_FOR_USER") return styles.statusWaiting;
    if (s === "IN_PROGRESS" || s === "REOPENED") {
      return styles.statusInProgress;
    }
    return styles.statusOpen;
  }, [ticket?.status]);

  const showRatingPrompt =
    !!ticket &&
    (ticket.status?.toUpperCase() === "RESOLVED" ||
      ticket.status?.toUpperCase() === "CLOSED") &&
    (ticket.satisfaction_rating == null || Number.isNaN(ticket.satisfaction_rating)) &&
    !hasTappedChatAgain;

  const ratingSummary = useMemo(() => {
    if (!ticket || ticket.satisfaction_rating == null || Number.isNaN(ticket.satisfaction_rating)) {
      return null;
    }
    const numeric = Number(ticket.satisfaction_rating);
    const opt = RATING_OPTIONS.find((o) => o.value === numeric);
    const label = opt?.label ?? `Rated ${numeric}/5`;
    const emoji = opt?.emoji ?? "⭐";

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
      label,
      emoji,
      feedback: ticket.satisfaction_feedback ?? "",
      submittedAt,
    };
  }, [ticket]);

  const load = useCallback(async () => {
    if (!token || !storeId || activeTicketId == null) return;
    setLoading(true);
    try {
      const data = await getTicketMessages(storeId, activeTicketId, token);
      setTicket(data.ticket);
      setMessages(data.messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation.");
    } finally {
      setLoading(false);
    }
  }, [storeId, token, activeTicketId]);

  useEffect(() => {
    if (activeTicketId != null) {
      void load();
    } else {
      setLoading(false);
    }
  }, [load, activeTicketId]);

  useEffect(() => {
    if (messages.length > 0) {
      setShowQuickOptions(false);
    }
  }, [messages.length]);
  useEffect(() => {
    if (!showTicketCreatedToast) return;
    const timeout = setTimeout(() => setShowTicketCreatedToast(false), 4500);
    return () => clearTimeout(timeout);
  }, [showTicketCreatedToast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const quickOptions = useMemo(() => {
    const id = typeof sectionId === "string" ? sectionId.toLowerCase() : "";
    return QUICK_OPTIONS_BY_SECTION[id] ?? DEFAULT_QUICK_OPTIONS;
  }, [sectionId]);

  const firstMerchantMessage = useMemo(
    () => messages.find((m) => m.sender_type === "MERCHANT"),
    [messages]
  );

  const sendMessage = async (textToSend: string, attachments?: string[]) => {
    const trimmed = textToSend.trim();
    if (!trimmed || !token || !storeId || sending) return;
    setSending(true);
    try {
      let ticketIdToUse = activeTicketId;
      if (ticketIdToUse == null) {
        if (!sectionId) {
          Alert.alert("Cannot start chat", "Support section missing. Please go back and try again.");
          return;
        }
        const created = await createStoreTicket(storeId, sectionId, token, {
          subject: typeof sectionTitle === "string" ? sectionTitle : undefined,
          description: trimmed,
        });
        ticketIdToUse = created.id;
        setActiveTicketId(created.id);
        setTicket(created);
        setShowTicketCreatedToast(true);
        createdInThisSessionRef.current = created.id;
      }

      // If this is an existing ticket that was previously resolved/closed and
      // the merchant chose "Chat with us again", reopen it on first reply.
      if (
        ticket &&
        ticketIdToUse != null &&
        (ticket.status?.toUpperCase() === "RESOLVED" ||
          ticket.status?.toUpperCase() === "CLOSED") &&
        hasTappedChatAgain
      ) {
        try {
          const reopened = await reopenTicket(storeId, ticket.id, token);
          setTicket(reopened);
        } catch {
          // If reopen fails, still allow the message to be sent; status will remain as-is.
        }
      }

      const temp: TicketMessage = {
        id: Date.now(),
        message_text: trimmed,
        message_type: "TEXT",
        sender_type: "MERCHANT",
        sender_id: null,
        sender_name: null,
        attachments: attachments ?? [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, temp]);
      setInput("");

      const saved = await postTicketMessage(storeId, ticketIdToUse!, trimmed, token, attachments);
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...saved } : m)));
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setInput(trimmed);
    } finally {
      setSending(false);
      setShowQuickOptions(false);
    }
  };

  const onSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    await sendMessage(trimmed);
  };

  const onQuickOptionPress = (label: string) => {
    if (label.toLowerCase().startsWith("other")) {
      setShowQuickOptions(false);
      return;
    }
    // For preset cards, send immediately instead of just filling the input.
    setInput("");
    void sendMessage(label);
  };

  const openAttachmentPicker = useCallback(async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (perm?.status !== "granted" && perm?.status !== "undetermined") {
        Alert.alert(
          "Permission needed",
          "Allow access to your gallery to attach images and files."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: (ImagePicker as any).MediaTypeOptions?.All ?? "all",
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      // For now we send the picked file as a simple attachment URL.
      await sendMessage("Shared an attachment", [uri]);
    } catch {
      Alert.alert("Attachment failed", "Could not open gallery. Please try again.");
    }
  }, [sendMessage]);

  const keyboardOffset = Platform.OS === "ios" ? insets.top + 8 : 0;

  const handleSubmitRating = async () => {
    if (!storeId || !token || !ticket || ratingSubmitting || !ratingValue) return;
    try {
      setRatingSubmitting(true);
      const updated = await rateTicket(storeId, ticket.id, ratingValue, token, ratingFeedback);
      setTicket(updated);
    } catch (e) {
      Alert.alert(
        "Rating failed",
        e instanceof Error ? e.message : "Could not submit rating. Please try again."
      );
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleChatWithUs = () => {
    // Hide the rating section for this session and show chat input only.
    setHasTappedChatAgain(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardOffset}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={GatiMitraMerchant.textPrimary}
            />
          </Pressable>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Support chat
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {ticket?.ticket_id
                ? `Ticket ${ticket.ticket_id}`
                : sectionTitle ?? "New support request"}
            </Text>
          </View>
          <View style={[styles.statusPill, statusStyle]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        {loading && (
          <Animated.View
            style={[
              styles.ticketToast,
              { opacity: skeletonPulse },
            ]}
          >
            <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
            <Text style={styles.ticketToastText}>Opening support chat…</Text>
          </Animated.View>
        )}

        {showTicketCreatedToast && !loading && (
          <View style={styles.ticketToast}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={GatiMitraMerchant.success}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.ticketToastText}>
              Ticket created successfully. Our support team will review your request shortly.
            </Text>
          </View>
        )}

        {activeTicketId != null &&
          ticket &&
          !loading &&
          createdInThisSessionRef.current === activeTicketId && (
            <View style={styles.systemInfoCard}>
              <View style={styles.systemInfoHeader}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={GatiMitraMerchant.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.systemInfoTitle}>Request received</Text>
              </View>
              <Text style={styles.systemInfoBody}>
                Your request has been submitted successfully. The GatiMitra Support Team will review your concern and
                respond shortly.
              </Text>
              {!!firstMerchantMessage?.message_text && (
                <Text style={styles.systemInfoHighlight}>
                  Selected issue: {firstMerchantMessage.message_text}
                </Text>
              )}
              <Text style={styles.systemInfoSecondary}>
                You may continue adding more details in this chat if needed.
              </Text>
            </View>
          )}

        <ScrollView
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[GatiMitraMerchant.primary]}
            />
          }
        >
        {messages.map((m) => {
          const isMerchant = m.sender_type === "MERCHANT";
          const agentLabel = (() => {
            if (isMerchant) return "";
            const raw = (m.sender_name ?? "").trim();
            if (!raw) return "GM - GatiMitra team";
            const parts = raw.split(/\s+/);
            const first = parts[0];
            const last = parts.length > 1 ? parts[parts.length - 1] : "";
            const initials =
              (first ? first.charAt(0) : "") + (last ? last.charAt(0) : "");
            return `${initials.toUpperCase() || "GM"} - GatiMitra team`;
          })();
          const timeLabel = (() => {
            const raw = m.created_at;
            if (raw == null || (typeof raw === "string" && !raw.trim())) return null;
            try {
              const d = typeof raw === "string" ? new Date(raw.replace(" ", "T")) : new Date(raw);
              if (!Number.isFinite(d.getTime())) return null;
              return d.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });
            } catch {
              return null;
            }
          })();
          const timeLabelFull = (() => {
            const raw = m.created_at;
            if (raw == null || (typeof raw === "string" && !raw.trim())) return null;
            try {
              const d = typeof raw === "string" ? new Date(raw.replace(" ", "T")) : new Date(raw);
              if (!Number.isFinite(d.getTime())) return null;
              const formatted = d.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });
              return isMerchant ? `Reply at ${formatted}` : `Responded at ${formatted}`;
            } catch {
              return null;
            }
          })();
          return (
            <View
              key={m.id}
              style={[
                styles.bubbleRow,
                isMerchant ? styles.bubbleRowRight : styles.bubbleRowLeft,
              ]}
            >
              {!isMerchant && (
                <View style={styles.avatar}>
                  <Ionicons
                    name="headset-outline"
                    size={16}
                    color={GatiMitraMerchant.primary}
                  />
                </View>
              )}
              <View style={styles.bubbleColumn}>
                {!isMerchant && (
                  <Text style={styles.agentLabel} numberOfLines={1}>
                    {agentLabel}
                  </Text>
                )}
                <View
                  style={[
                    styles.bubble,
                    isMerchant ? styles.bubbleMerchant : styles.bubbleAgent,
                  ]}
                >
                  <Text
                    style={
                      isMerchant ? styles.bubbleTextMerchant : styles.bubbleTextAgent
                    }
                  >
                    {m.message_text}
                  </Text>
                  {timeLabel != null && (
                    <Text
                      style={[
                        styles.bubbleTime,
                        isMerchant ? styles.bubbleTimeMerchant : styles.bubbleTimeAgent,
                      ]}
                      numberOfLines={1}
                    >
                      {timeLabel}
                    </Text>
                  )}
                </View>
                {!!m.attachments?.length && (
                  <View style={styles.attachmentRow}>
                    <Ionicons
                      name="attach-outline"
                      size={14}
                      color={isMerchant ? "#fff" : GatiMitraMerchant.primary}
                    />
                    <Text
                      style={
                        isMerchant
                          ? styles.attachmentTextMerchant
                          : styles.attachmentTextAgent
                      }
                      numberOfLines={1}
                    >
                      {`Attachment (${m.attachments.length})`}
                    </Text>
                  </View>
                )}
                {timeLabelFull != null && (
                  <Text
                    style={[
                      styles.timeText,
                      isMerchant ? styles.timeTextMerchant : styles.timeTextAgent,
                    ]}
                    numberOfLines={1}
                  >
                    {timeLabelFull}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
        </ScrollView>

        {!!ratingSummary && (
          <>
            <View style={styles.ratingSummaryCard}>
              <View style={styles.ratingExperienceHeaderRow}>
                <Text style={styles.ratingExperienceTitle}>Support experience</Text>
              </View>
              <View style={styles.ratingAutoSummaryRow}>
                <Text style={styles.ratingAutoEmoji}>{ratingSummary.emoji}</Text>
                <Text style={styles.ratingAutoLabel}>{ratingSummary.label}</Text>
                <View style={styles.ratingAutoStarsRow}>
                  {Array.from({ length: ratingSummary.numeric }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Ionicons
                      key={idx}
                      name="star"
                      size={14}
                      color="#FFC107"
                      style={styles.ratingAutoStarIcon}
                    />
                  ))}
                </View>
              </View>
              <Text style={styles.ratingExperienceNote}>Thank you for rating your support interaction.</Text>
              {!!ratingSummary.feedback && (
                <Text style={styles.ratingSummaryFeedback}>{`“${ratingSummary.feedback}”`}</Text>
              )}
              {!!ratingSummary.submittedAt && (
                <Text style={styles.ratingSummaryMeta}>
                  {`Submitted on: ${ratingSummary.submittedAt}`}
                </Text>
              )}
            </View>

            <View style={styles.ratingAutoCard}>
              <View style={styles.ratingAutoHeaderRow}>
                <Ionicons
                  name="information-circle"
                  size={16}
                  color={GatiMitraMerchant.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.ratingAutoTitle}>From GatiMitra Support Team</Text>
              </View>
              {ratingSummary.numeric >= 3 ? (
                <>
                  <Text style={styles.ratingAutoBody}>
                    Thank you for sharing your feedback with us.
                  </Text>
                  <Text style={styles.ratingAutoBody}>
                    We&apos;re glad that the <Text style={styles.ratingAutoBold}>GatiMitra Support Team</Text> was able
                    to assist you and resolve your concern. Your support and trust motivate us to continue improving our
                    services.
                  </Text>
                  <Text style={styles.ratingAutoSignature}>– GatiMitra Team</Text>
                </>
              ) : (
                <>
                  <Text style={styles.ratingAutoBody}>
                    We sincerely apologize that your experience with our support did not meet your expectations. Your
                    feedback is very important to us, and the <Text style={styles.ratingAutoBold}>GatiMitra Team</Text>{" "}
                    will review this case to further improve our support services.
                  </Text>
                  <Text style={styles.ratingAutoBody}>
                    If you still need assistance, please feel free to contact us again.
                  </Text>
                  <Text style={styles.ratingAutoSignature}>– GatiMitra Team</Text>
                </>
              )}
            </View>
          </>
        )}

        {showRatingPrompt && ticket && (
          <View style={styles.ratingBar}>
            <View style={styles.ratingClosedPill}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={GatiMitraMerchant.statusCompleted}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.ratingClosedText}>
                {ticket.status?.toUpperCase() === "CLOSED"
                  ? "This conversation has been closed"
                  : "This conversation has been resolved"}
              </Text>
            </View>

            <Text style={styles.ratingHeading}>Hey there!</Text>
            <Text style={styles.ratingSubheading}>
              {`We just ${ticket.status?.toLowerCase() ?? "closed"} ticket ${ticket.ticket_id}.`}
            </Text>
            <Text style={styles.ratingSubheading}>
              We know you&apos;re busy, so we just have one question:
            </Text>
            <Text style={[styles.ratingSubheading, { fontWeight: "600", marginBottom: 10 }]}>
              Are you satisfied with the support you received in this ticket?
            </Text>

            <View style={styles.ratingEmojisRow}>
              {RATING_OPTIONS.map((opt) => {
                const selected = ratingValue === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setRatingValue(opt.value)}
                    style={({ pressed }) => [
                      styles.ratingEmojiWrap,
                      selected && styles.ratingEmojiWrapSelected,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={styles.ratingEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.ratingEmojiLabel,
                        selected && styles.ratingEmojiLabelSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.ratingFeedbackInput}
              placeholder="Share your feedback (optional)…"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={ratingFeedback}
              onChangeText={setRatingFeedback}
              multiline
            />
            <Pressable
              onPress={handleSubmitRating}
              disabled={!ratingValue || ratingSubmitting}
              style={({ pressed }) => [
                styles.ratingSubmitBtn,
                (!ratingValue || ratingSubmitting) && styles.ratingSubmitBtnDisabled,
                pressed && ratingValue && !ratingSubmitting && styles.ratingSubmitBtnPressed,
              ]}
            >
              <Text style={styles.ratingSubmitText}>
                {ratingSubmitting ? "Submitting…" : "Submit feedback"}
              </Text>
            </Pressable>

            {/* While rating is pending, allow reopening instead via Chat with us */}
              <Pressable
                onPress={handleChatWithUs}
                style={({ pressed }) => [
                  styles.chatWithUsBtn,
                  pressed && styles.chatWithUsBtnPressed,
                ]}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={16}
                  color={GatiMitraMerchant.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.chatWithUsText}>Chat with us again</Text>
              </Pressable>
          </View>
        )}

        {/* Chat input visible when there is no pending rating form */}
        {!showRatingPrompt && (
          <View style={styles.inputBar}>
            {showQuickOptions && activeTicketId == null && (
              <View style={styles.quickColumn}>
                {quickOptions.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => onQuickOptionPress(q)}
                    style={({ pressed }) => [
                      styles.quickChip,
                      pressed && styles.quickChipPressed,
                    ]}
                  >
                    <View style={styles.quickChipInner}>
                      <View style={styles.quickChipBullet} />
                      <Text style={styles.quickChipText}>{q}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={GatiMitraMerchant.textTertiary}
                        style={styles.quickChipIcon}
                      />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.inputRow}>
              <Pressable
                onPress={openAttachmentPicker}
                style={({ pressed }) => [
                  styles.attachBtn,
                  pressed && styles.attachBtnPressed,
                ]}
              >
                <Ionicons
                  name="attach-outline"
                  size={18}
                  color={GatiMitraMerchant.primary}
                />
              </Pressable>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Type your message…"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                multiline
              />
              <Pressable
                onPress={onSend}
                disabled={!input.trim() || sending}
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!input.trim() || sending) && styles.sendBtnDisabled,
                  pressed && !sending && input.trim() && styles.sendBtnPressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: H_PADDING,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  backButtonPressed: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  headerLeft: { flex: 1, marginRight: 8 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  statusOpen: {
    backgroundColor: GatiMitraMerchant.info,
  },
  statusWaiting: {
    backgroundColor: GatiMitraMerchant.warning,
  },
  statusInProgress: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  statusResolved: {
    backgroundColor: GatiMitraMerchant.statusCompleted,
  },
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
  },
  bubbleRow: {
    flexDirection: "row",
    flexShrink: 1,
    marginBottom: 8,
  },
  bubbleRowLeft: {
    justifyContent: "flex-start",
  },
  bubbleRowRight: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  bubbleColumn: {
    maxWidth: "90%",
    flexShrink: 1,
  },
  bubble: {
    maxWidth: "88%",
    minWidth: 110,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMerchant: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  bubbleAgent: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  bubbleTime: {
    marginTop: 4,
    fontSize: 10,
    alignSelf: "flex-end",
  },
  bubbleTimeMerchant: {
    color: "rgba(255,255,255,0.85)",
  },
  bubbleTimeAgent: {
    color: GatiMitraMerchant.textSecondary,
  },
  bubbleTextMerchant: {
    fontSize: 14,
    color: "#fff",
  },
  bubbleTextAgent: {
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
  },
  agentLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
    marginBottom: 2,
    marginLeft: 4,
  },
  inputBar: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    marginRight: 8,
  },
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  attachBtnPressed: { opacity: 0.8 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  quickColumn: {
    flexDirection: "column",
    gap: 8,
    marginBottom: 10,
  },
  quickChip: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  quickChipPressed: {
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  quickChipInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.primary,
    marginRight: 8,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    flexShrink: 1,
  },
  quickChipIcon: {
    marginLeft: 8,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    marginLeft: 4,
    gap: 4,
  },
  attachmentTextMerchant: {
    fontSize: 11,
    color: "#e5f6e9",
  },
  attachmentTextAgent: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  timeText: {
    marginTop: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  timeTextMerchant: {
    alignSelf: "flex-end",
  },
  timeTextAgent: {
    alignSelf: "flex-start",
  },
  attachHintRow: {
    marginTop: 4,
  },
  attachHintText: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  skeletonBubbleRow: {
    flexDirection: "row",
    flexShrink: 1,
    marginBottom: 12,
  },
  skeletonAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    backgroundColor: SKELETON_BG,
  },
  skeletonBubbleColumn: {
    maxWidth: "90%",
    flexShrink: 1,
  },
  skeletonAgentLabel: {
    height: 10,
    borderRadius: 6,
    marginBottom: 4,
    marginLeft: 4,
    width: 90,
  },
  skeletonBubble: {
    height: 52,
    borderRadius: 18,
    marginBottom: 6,
  },
  skeletonTime: {
    height: 8,
    borderRadius: 4,
    width: 80,
    alignSelf: "flex-start",
  },
  skeletonStatusPill: {
    width: 64,
    height: 20,
    borderRadius: 999,
  },
  skeletonHeaderTitle: {
    height: 16,
    borderRadius: 6,
    marginBottom: 6,
    width: 140,
  },
  skeletonHeaderSubtitle: {
    height: 12,
    borderRadius: 6,
    width: 120,
  },
  skeletonInputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  skeletonAttach: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },
  skeletonInput: {
    flex: 1,
    height: 40,
    borderRadius: CARD_RADIUS,
    marginRight: 8,
  },
  skeletonSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  ratingBar: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  ratingClosedPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginBottom: 8,
  },
  ratingClosedText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  ratingSummaryCard: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  ratingSummaryTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  ratingSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingSummaryEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  ratingSummaryTextCol: {
    flex: 1,
  },
  ratingSummaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingSummarySubLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  ratingSummaryFeedback: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 8,
  },
  ratingSummaryMeta: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  ticketToast: {
    marginHorizontal: H_PADDING,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    flexDirection: "row",
    alignItems: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  ticketToastText: {
    flex: 1,
    fontSize: 11,
    color: GatiMitraMerchant.textPrimary,
  },
  systemInfoCard: {
    marginHorizontal: H_PADDING,
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  systemInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  systemInfoTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  systemInfoBody: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  systemInfoHighlight: {
    marginTop: 6,
    fontSize: 12,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "500",
  },
  systemInfoSecondary: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 6,
  },
  ratingExperienceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 6,
  },
  ratingExperienceTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingExperienceNote: {
    marginTop: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  ratingAutoCard: {
    marginTop: 2,
    marginBottom: 8,
    marginHorizontal: H_PADDING,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  ratingAutoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  ratingAutoSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingAutoEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  ratingAutoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginRight: 6,
  },
  ratingAutoStarsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingAutoStarIcon: {
    marginRight: 2,
  },
  ratingAutoTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingAutoBody: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  ratingAutoBold: {
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingAutoSignature: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
  },
  ratingHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 2,
  },
  ratingSubheading: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 10,
  },
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
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  ratingEmojiWrapSelected: {
    backgroundColor: "#ecfdf3",
    borderColor: GatiMitraMerchant.primary,
  },
  ratingEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  ratingEmojiLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  ratingEmojiLabelSelected: {
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  ratingFeedbackInput: {
    minHeight: 60,
    maxHeight: 100,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  ratingSubmitBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  ratingSubmitBtnDisabled: {
    opacity: 0.5,
  },
  ratingSubmitBtnPressed: {
    opacity: 0.85,
  },
  ratingSubmitText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  chatWithUsBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  chatWithUsBtnPressed: {
    opacity: 0.9,
  },
  chatWithUsText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
});

