import { useEffect, useState, useCallback, useMemo } from "react";
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
  const [showTicketCreatedModal, setShowTicketCreatedModal] = useState(false);

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
    if (s === "IN_PROGRESS" || s === "WAITING_FOR_USER") return styles.statusInProgress;
    return styles.statusOpen;
  }, [ticket?.status]);

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

  const closeAndGoToMyTickets = useCallback(() => {
    setShowTicketCreatedModal(false);
    router.replace("/(tabs)/profile" as any);
  }, [router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const quickOptions = useMemo(() => {
    const id = typeof sectionId === "string" ? sectionId.toLowerCase() : "";
    return QUICK_OPTIONS_BY_SECTION[id] ?? DEFAULT_QUICK_OPTIONS;
  }, [sectionId]);

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
        setShowTicketCreatedModal(true);
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Opening support chat…</Text>
      </View>
    );
  }

  if (activeTicketId != null && (!ticket || !storeId || error)) {
    return (
      <View style={styles.centered}>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={40}
          color={GatiMitraMerchant.textTertiary}
        />
        <Text style={styles.errorText}>{error ?? "Ticket not found."}</Text>
      </View>
    );
  }

  const keyboardOffset = Platform.OS === "ios" ? insets.top + 8 : 0;

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
              {ticket?.ticket_id ? `Ticket ${ticket.ticket_id}` : (sectionTitle ?? "New conversation")}
            </Text>
          </View>
          <View style={[styles.statusPill, statusStyle]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

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
          const agentLabel =
            !isMerchant && (m.sender_name?.trim() || "GatiMitra support");
          const timeLabel = (() => {
            try {
              const d = new Date(m.created_at);
              if (Number.isNaN(d.getTime())) return "";
              return d.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              });
            } catch {
              return "";
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
                {!!timeLabel && (
                  <Text
                    style={[
                      styles.timeText,
                      isMerchant ? styles.timeTextMerchant : styles.timeTextAgent,
                    ]}
                  >
                    {timeLabel}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
        </ScrollView>

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
                  <Text style={styles.quickChipText}>{q}</Text>
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

        <Modal
          visible={showTicketCreatedModal}
          transparent
          animationType="fade"
          onRequestClose={closeAndGoToMyTickets}
        >
          <Pressable style={styles.modalOverlay} onPress={closeAndGoToMyTickets}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="checkmark-circle" size={48} color={GatiMitraMerchant.statusCompleted} />
              </View>
              <Text style={styles.modalTitle}>Ticket created</Text>
              <Text style={styles.modalMessage}>
                Your ticket has been created successfully. Please wait, our team will connect soon.
                Track your ticket in My tickets section.
              </Text>
              <Pressable
                onPress={closeAndGoToMyTickets}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalCloseBtnPressed]}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
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
    backgroundColor: GatiMitraMerchant.statusPending,
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
    maxWidth: "82%",
    flexShrink: 1,
  },
  bubble: {
    maxWidth: "80%",
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignSelf: "flex-start",
  },
  quickChipPressed: {
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
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
    marginTop: 2,
    fontSize: 10,
    color: GatiMitraMerchant.textTertiary,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: H_PADDING,
  },
  modalCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 20,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  modalIconWrap: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalCloseBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  modalCloseBtnPressed: {
    opacity: 0.9,
  },
  modalCloseBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});

