/**
 * Zomato-style order support chat — default messages + selectable issue options.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, ScrollView, StyleSheet, Linking, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
  buildEmailFallbackMessage,
  buildChatResumeMessages,
  buildInitialChatMessages,
  buildMainIssueOptionsMessage,
  buildMoreMenuMessage,
  buildOrderPickerMessage,
  buildTicketSubmittedMessage,
  buildTicketWindowExpiredMessage,
  CHAT_MORE_OPTION_LABEL,
  formatChatTime,
  isAnotherOrderHelpLabel,
  orderPickerSubtitle,
  orderPickerTitle,
  orderStatusLabel,
  SUPPORT_CONTACT_EMAIL,
  supportChatMessageFromRow,
  supportChatMessageToPayload,
  type SupportChatMessage,
  type SupportChatOption,
} from "@/lib/order-support-chat";
import {
  customerSupportService,
  type HelpSection,
  type RecentOrder,
} from "@/services/customerSupport.service";

const PAGE_BG = "#FFFFFF";
const BOT_BG = "#F0F2F7";
const USER_BG = "#F5F5F5";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const LINK_BLUE = "#2563EB";
const GREEN = "#16A34A";
const RED = "#DC2626";
const BORDER = "#E8E8E8";

type Props = {
  firstName: string;
  merchantName: string;
  itemHint?: string | null;
  chatTopics: HelpSection[];
  linkedCoreOrderId: number | null;
  linkedDisplayOrderId: string;
  isRideOrder: boolean;
  ticketWindowOpen: boolean;
  pendingTicketDisplayId?: string | null;
  onEndChat: () => void;
  onSwitchOrder: (order: RecentOrder) => void;
};

function BotMessageText({ text, onEmailPress }: { text: string; onEmailPress: () => void }) {
  const email = SUPPORT_CONTACT_EMAIL;
  if (!text.includes(email)) {
    return <AppText style={styles.botText}>{text}</AppText>;
  }

  const parts = text.split(email);
  return (
    <AppText style={styles.botText}>
      {parts.map((part, index) => (
        <AppText key={`${index}-${part.slice(0, 8)}`}>
          {part}
          {index < parts.length - 1 ? (
            <AppText style={styles.botEmailLink} onPress={onEmailPress}>
              {email}
            </AppText>
          ) : null}
        </AppText>
      ))}
    </AppText>
  );
}

function UserBubble({ message }: { message: SupportChatMessage }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <AppText style={styles.userText}>{message.text}</AppText>
        <View style={styles.userMeta}>
          <AppText style={styles.userTime}>{formatChatTime(message.sentAt)}</AppText>
          <Ionicons name="checkmark-done" size={14} color={LINK_BLUE} />
        </View>
      </View>
    </View>
  );
}

function BotBubble({
  message,
  onOptionPress,
  onOrderPress,
  onEmailPress,
  itemHint,
}: {
  message: SupportChatMessage;
  onOptionPress: (option: SupportChatOption) => void;
  onOrderPress: (order: RecentOrder) => void;
  onEmailPress: () => void;
  itemHint?: string | null;
}) {
  return (
    <View style={styles.botRow}>
      <View style={styles.botBubble}>
        <BotMessageText text={message.text} onEmailPress={onEmailPress} />
        <AppText style={styles.botTime}>{formatChatTime(message.sentAt)}</AppText>

        {message.orders?.length ? (
          <View style={styles.optionsCard}>
            {message.orders.map((order, index) => {
              const status = orderStatusLabel(order.current_status ?? order.status);
              return (
                <View key={String(order.id)}>
                  {index > 0 ? <View style={styles.optionDivider} /> : null}
                  <TouchableOpacity
                    style={styles.orderRow}
                    activeOpacity={0.85}
                    onPress={() => onOrderPress(order)}
                  >
                    <AppText style={styles.orderTitle}>{orderPickerTitle(order)}</AppText>
                    <AppText style={styles.orderSub}>{orderPickerSubtitle(order, itemHint)}</AppText>
                    <AppText
                      style={[
                        styles.orderStatus,
                        status.tone === "success" && styles.orderStatusSuccess,
                        status.tone === "danger" && styles.orderStatusDanger,
                      ]}
                    >
                      {status.text}
                    </AppText>
                  </TouchableOpacity>
                </View>
              );
            })}
            {message.options?.map((option) => (
              <View key={option.id}>
                <View style={styles.optionDivider} />
                <TouchableOpacity
                  style={styles.optionRow}
                  activeOpacity={0.85}
                  onPress={() => onOptionPress(option)}
                >
                  <AppText style={styles.optionText}>{option.label}</AppText>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : message.options?.length ? (
          <View style={styles.optionsCard}>
            {message.options.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <View style={styles.optionDivider} /> : null}
                <TouchableOpacity
                  style={styles.optionRow}
                  activeOpacity={0.85}
                  onPress={() => onOptionPress(option)}
                >
                  <AppText style={styles.optionText}>{option.label}</AppText>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function OrderSupportChatFlow({
  firstName,
  merchantName,
  itemHint,
  chatTopics,
  linkedCoreOrderId,
  linkedDisplayOrderId,
  isRideOrder,
  ticketWindowOpen,
  pendingTicketDisplayId,
  onEndChat,
  onSwitchOrder,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const bootstrapRef = useRef(false);
  const [chatSessionId, setChatSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>(() =>
    buildInitialChatMessages({ firstName, merchantName, chatTopics: [] })
  );
  const [orderOffset, setOrderOffset] = useState(0);

  const chatSessionQ = useQuery({
    queryKey: ["support-chat-session", linkedCoreOrderId, firstName, merchantName],
    queryFn: () =>
      customerSupportService.ensureSupportChatSession({
        order_id: linkedCoreOrderId,
        metadata: {
          first_name: firstName,
          merchant_name: merchantName,
          item_hint: itemHint ?? null,
          source: "CUSTOMER_APP",
        },
      }),
    enabled: linkedCoreOrderId != null,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });

  useEffect(() => {
    const data = chatSessionQ.data;
    if (!data) return;
    setChatSessionId(data.session.id);

    if (data.messages.length > 0) {
      const loaded = data.messages.map(supportChatMessageFromRow);
      const ticketFromPayload = data.messages
        .map((row) => row.payload?.ticket_id)
        .find((value): value is string => typeof value === "string" && value.trim().length > 0)
        ?.trim();
      const ticketDisplayId =
        typeof data.session.metadata?.ticket_display_id === "string"
          ? data.session.metadata.ticket_display_id.trim()
          : ticketFromPayload ?? "";
      const hasTicketIdMessage = loaded.some((message) => /ticket ID is/i.test(message.text));
      if (ticketDisplayId && !hasTicketIdMessage) {
        loaded.push(buildTicketSubmittedMessage(ticketDisplayId));
      }
      setMessages(loaded);
      bootstrapRef.current = true;
      return;
    }

    if (bootstrapRef.current) return;
    bootstrapRef.current = true;

    const initial = buildInitialChatMessages({
      firstName,
      merchantName,
      chatTopics,
    });
    setMessages(initial);

    void (async () => {
      for (const message of initial) {
        try {
          await customerSupportService.appendSupportChatMessage(data.session.id, {
            client_message_id: message.id,
            role: message.role,
            message_text: message.text,
            menu_level: message.menuLevel ?? null,
            payload: supportChatMessageToPayload(message),
          });
        } catch {
          /* best-effort sync */
        }
      }
    })();
  }, [chatSessionQ.data, chatTopics, firstName, itemHint, merchantName]);

  useEffect(() => {
    const ticketDisplayId = pendingTicketDisplayId?.trim();
    if (!ticketDisplayId) return;
    setMessages((prev) => {
      if (prev.some((message) => /ticket ID is/i.test(message.text))) return prev;
      return [...prev, buildTicketSubmittedMessage(ticketDisplayId)];
    });
  }, [pendingTicketDisplayId]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.some((message) => message.role === "user")) return prev;
      if (chatSessionQ.data?.messages.length) return prev;
      return buildInitialChatMessages({
        firstName,
        merchantName,
        chatTopics,
      });
    });
  }, [chatSessionQ.data?.messages.length, chatTopics, firstName, merchantName]);

  const recentOrdersQ = useQuery({
    queryKey: ["customer-support-recent-orders", orderOffset],
    queryFn: () => customerSupportService.getRecentOrders({ limit: 4, offset: orderOffset }),
    staleTime: 30_000,
  });

  const persistMessage = useCallback(
    (message: SupportChatMessage) => {
      if (!chatSessionId) return;
      void customerSupportService
        .appendSupportChatMessage(chatSessionId, {
          client_message_id: message.id,
          role: message.role,
          message_text: message.text,
          menu_level: message.menuLevel ?? null,
          payload: supportChatMessageToPayload(message),
        })
        .catch(() => {
          /* offline / transient — local UI still works */
        });
    },
    [chatSessionId]
  );

  const appendUser = useCallback(
    (text: string) => {
      const message: SupportChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text,
        sentAt: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      persistMessage(message);
    },
    [persistMessage]
  );

  const appendBot = useCallback(
    (message: SupportChatMessage) => {
      setMessages((prev) => [...prev, message]);
      persistMessage(message);
    },
    [persistMessage]
  );

  const openTicketSubmit = useCallback(
    (section: HelpSection, optionLabel: string) => {
      if (linkedCoreOrderId == null || !chatSessionId) return;
      if (!ticketWindowOpen) {
        appendBot(buildTicketWindowExpiredMessage());
        return;
      }
      router.push({
        pathname: "/orders/support-ticket-submit",
        params: {
          chatSessionId: String(chatSessionId),
          coreOrderId: String(linkedCoreOrderId),
          displayOrderId: linkedDisplayOrderId,
          ticketTitleId: String(section.ticket_title_id),
          optionLabel,
          sectionCode: section.section_id ?? "orders",
          isRideOrder: isRideOrder ? "1" : "0",
        },
      });
    },
    [appendBot, chatSessionId, isRideOrder, linkedCoreOrderId, linkedDisplayOrderId, router, ticketWindowOpen]
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages]);

  const handleOptionPress = useCallback(
    (option: SupportChatOption, message: SupportChatMessage) => {
      appendUser(option.label);

      if (option.label === CHAT_MORE_OPTION_LABEL) {
        appendBot(buildMoreMenuMessage());
        return;
      }

      if (option.label === "← Go back") {
        if (message.menuLevel === "orders") {
          appendBot(buildMoreMenuMessage());
        } else if (chatTopics.length > 0) {
          appendBot(buildMainIssueOptionsMessage(chatTopics));
        }
        return;
      }

      if (isAnotherOrderHelpLabel(option.label)) {
        const orders = recentOrdersQ.data?.orders ?? [];
        if (orders.length === 0) {
          appendBot({
            id: `bot-empty-${Date.now()}`,
            role: "bot",
            text: "We couldn't find other recent orders on your account.",
            sentAt: new Date(),
            menuLevel: "more",
            options: [{ id: "back-home", label: "← Go back" }],
          });
          return;
        }
        appendBot(buildOrderPickerMessage(orders));
        return;
      }

      if (option.label === "Other previous orders") {
        if (recentOrdersQ.data?.hasMore) {
          setOrderOffset((value) => value + 4);
          return;
        }
        appendBot({
          id: `bot-no-more-${Date.now()}`,
          role: "bot",
          text: "Those are all the recent orders we could find.",
          sentAt: new Date(),
          menuLevel: "orders",
          options: [{ id: "back-home", label: "← Go back" }],
        });
        return;
      }

      if (option.label === "My order is not listed here") {
        appendBot(buildEmailFallbackMessage());
        return;
      }

      if (message.orders?.length) {
        return;
      }

      if (option.section) {
        if (!ticketWindowOpen) {
          appendBot(buildTicketWindowExpiredMessage());
          return;
        }
        if (chatSessionId) {
          void customerSupportService
            .patchSupportChatSession(chatSessionId, {
              ticket_title_id: option.section.ticket_title_id,
              selected_issue_label: option.label,
            })
            .catch(() => undefined);
        }
        openTicketSubmit(option.section, option.label);
        return;
      }
    },
    [
      appendBot,
      appendUser,
      chatSessionId,
      chatTopics,
      openTicketSubmit,
      recentOrdersQ.data?.hasMore,
      recentOrdersQ.data?.orders,
      ticketWindowOpen,
    ]
  );

  useEffect(() => {
    if (orderOffset <= 0 || !recentOrdersQ.data?.orders?.length) return;
    appendBot(buildOrderPickerMessage(recentOrdersQ.data.orders));
  }, [appendBot, orderOffset, recentOrdersQ.data?.orders]);

  const handleOrderPress = useCallback(
    (order: RecentOrder) => {
      appendUser(orderPickerTitle(order));
      onSwitchOrder(order);
      if (chatSessionId) {
        void customerSupportService
          .patchSupportChatSession(chatSessionId, { order_id: order.id })
          .catch(() => undefined);
      }
      if (chatTopics.length > 0) {
        appendBot(buildMainIssueOptionsMessage(chatTopics));
      }
    },
    [appendBot, appendUser, chatSessionId, chatTopics, onSwitchOrder]
  );

  const showChatWithUsFooter = useMemo(() => {
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "bot" && last.menuLevel === "email" && !last.options?.length;
  }, [messages]);

  const openSupportEmail = useCallback(() => {
    const mailto = `mailto:${SUPPORT_CONTACT_EMAIL}`;
    Linking.canOpenURL(mailto)
      .then((supported) => {
        if (supported) return Linking.openURL(mailto);
        return Linking.openURL(`https://mail.google.com/mail/?view=cm&to=${SUPPORT_CONTACT_EMAIL}`);
      })
      .catch(() => {
        Alert.alert(
          "Contact support",
          `Please email us at ${SUPPORT_CONTACT_EMAIL} with your Order ID and issue details.`
        );
      });
  }, []);

  const resumeSupportChat = useCallback(async () => {
    if (chatSessionId) {
      try {
        await customerSupportService.patchSupportChatSession(chatSessionId, { status: "active" });
      } catch {
        /* best-effort — local resume still works */
      }
    }

    const resumeMessages = buildChatResumeMessages({
      firstName,
      merchantName,
      chatTopics,
    });
    for (const message of resumeMessages) {
      appendBot(message);
    }
  }, [appendBot, chatSessionId, chatTopics, firstName, merchantName]);

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
        <TouchableOpacity onPress={onEndChat} style={styles.headerSide} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>GatiMitra Support</AppText>
        <TouchableOpacity onPress={onEndChat} style={styles.headerEnd} hitSlop={12}>
          <AppText style={styles.endChatText}>End chat</AppText>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.chatContent,
            { paddingBottom: insets.bottom + 12 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} message={message} />
            ) : (
              <BotBubble
                key={message.id}
                message={message}
                itemHint={itemHint}
                onEmailPress={openSupportEmail}
                onOptionPress={(option) => handleOptionPress(option, message)}
                onOrderPress={handleOrderPress}
              />
            )
          )}

          {recentOrdersQ.isFetching && orderOffset > 0 ? (
            <ActivityIndicator color={LINK_BLUE} style={{ marginTop: 12 }} />
          ) : null}
        </ScrollView>

        {showChatWithUsFooter ? (
          <View
            style={[
              styles.footerBar,
              { paddingBottom: Math.max(insets.bottom + 16, 28) },
            ]}
          >
            <AppText style={styles.footerNote}>Still having an issue? </AppText>
            <TouchableOpacity
              onPress={() => void resumeSupportChat()}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <AppText style={styles.footerLink}>Chat with us</AppText>
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: PAGE_BG },
  flex: { flex: 1 },
  chatContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingTop: 8,
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 6,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerSide: { width: 36, alignItems: "flex-start" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },
  headerEnd: { minWidth: 72, alignItems: "flex-end" },
  endChatText: { color: RED, fontSize: 13, fontWeight: "700" },
  botRow: { paddingHorizontal: 12, marginBottom: 10, alignItems: "flex-start" },
  userRow: { paddingHorizontal: 12, marginBottom: 10, alignItems: "flex-end" },
  botBubble: {
    maxWidth: "88%",
    backgroundColor: BOT_BG,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  userBubble: {
    maxWidth: "78%",
    backgroundColor: USER_BG,
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  botText: { fontSize: 15, lineHeight: 21, color: TEXT },
  botEmailLink: {
    fontSize: 15,
    lineHeight: 21,
    color: TEXT,
    textDecorationLine: "underline",
  },
  userText: { fontSize: 15, lineHeight: 21, color: TEXT },
  botTime: {
    marginTop: 6,
    fontSize: 11,
    color: MUTED,
    alignSelf: "flex-end",
  },
  userMeta: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  userTime: { fontSize: 11, color: MUTED },
  optionsCard: {
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: -2,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  optionRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionText: {
    fontSize: 14,
    lineHeight: 20,
    color: LINK_BLUE,
    fontWeight: "500",
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
  },
  orderRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  orderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT,
  },
  orderSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: TEXT,
  },
  orderStatus: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
  },
  orderStatusSuccess: { color: GREEN },
  orderStatusDanger: { color: RED },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 14,
    marginBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: PAGE_BG,
  },
  footerNote: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
  },
  footerLink: {
    color: GREEN,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
