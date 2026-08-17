/**
 * Dedicated ticket intake screen — description + photos after issue selection in support chat.
 */

import { useCallback } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerSupportTicketIntakeForm } from "@/components/orders/CustomerSupportTicketIntakeForm";
import { customerSupportService } from "@/services/customerSupport.service";
import {
  isOrderSupportTicketWindowOpen,
  resolveOrderSupportAnchorAt,
} from "@/lib/order-support-ticket-window";
import { resolveTopSafeInset } from "@/constants/layout";

const PAGE_BG = "#F5F5F5";
const CARD = "#FFFFFF";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const BORDER = "#E8E8E8";

function paramOne(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default function SupportTicketSubmitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    chatSessionId?: string | string[];
    coreOrderId?: string | string[];
    displayOrderId?: string | string[];
    ticketTitleId?: string | string[];
    optionLabel?: string | string[];
    sectionCode?: string | string[];
    isRideOrder?: string | string[];
  }>();

  const chatSessionId = Number(paramOne(params.chatSessionId));
  const coreOrderId = Number(paramOne(params.coreOrderId));
  const displayOrderId =
    paramOne(params.displayOrderId)?.trim() ||
    (Number.isFinite(coreOrderId) && coreOrderId > 0 ? String(coreOrderId) : "");
  const ticketTitleId = Number(paramOne(params.ticketTitleId));
  const optionLabel = paramOne(params.optionLabel) ?? "Help request";
  const sectionCode = paramOne(params.sectionCode) ?? "orders";
  const isRideOrder = paramOne(params.isRideOrder) === "1";

  const submitMutation = useMutation({
    mutationFn: async (payload: { description: string; photoUris: string[] }) => {
      if (!Number.isFinite(coreOrderId) || coreOrderId < 1) {
        throw new Error("Could not link this order. Go back and try again.");
      }
      if (!Number.isFinite(ticketTitleId) || ticketTitleId < 1) {
        throw new Error("Please pick a topic from chat.");
      }

      const resolvedOrder = await customerSupportService.resolveOrderForTicket(String(coreOrderId));
      const anchor = resolveOrderSupportAnchorAt({
        status: resolvedOrder?.status,
        currentStatus: resolvedOrder?.current_status,
        deliveredAt: resolvedOrder?.delivered_at,
        cancelledAt: resolvedOrder?.cancelled_at ?? null,
      });
      if (!isOrderSupportTicketWindowOpen(anchor)) {
        throw new Error(
          "Some time has passed since your order was delivered or cancelled. Please email order@gatimitra.com with your Order ID and issue details."
        );
      }

      if (Number.isFinite(chatSessionId) && chatSessionId > 0) {
        await customerSupportService.patchSupportChatSession(chatSessionId, {
          ticket_title_id: ticketTitleId,
          selected_issue_label: optionLabel,
        });
      }

      const subject = `${isRideOrder ? "Ride" : "Order"} #${displayOrderId} — ${optionLabel}`;
      // Never persist the catalog issue title as the ticket description body.
      const description =
        payload.description.trim() === optionLabel.trim() ? "" : payload.description.trim();
      if (description.length < 10) {
        throw new Error("Please describe what happened in a few more words.");
      }
      return customerSupportService.createTicketWithPhotos({
        ticket_title_id: ticketTitleId,
        section_code: sectionCode,
        subject,
        description,
        order_id: coreOrderId,
        display_order_id: displayOrderId || null,
        selected_issue_label: optionLabel,
        photo_uris: payload.photoUris,
        chat_session_id:
          Number.isFinite(chatSessionId) && chatSessionId > 0 ? chatSessionId : undefined,
      });
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["support-chat-session"] });
      router.replace({
        pathname: "/orders/raise-ticket",
        params: {
          coreOrderId: String(coreOrderId),
          orderId: displayOrderId,
          chat: "1",
          ...(Number.isFinite(chatSessionId) && chatSessionId > 0
            ? { chatSessionId: String(chatSessionId) }
            : {}),
          ...(ticket.ticket_id ? { ticketDisplayId: ticket.ticket_id } : {}),
          ...(ticket.id ? { ticketId: String(ticket.id) } : {}),
        },
      });
    },
    onError: (err) => {
      const apiErr = err as Error & { response?: { data?: { message?: string; error?: string } } };
      const message =
        apiErr.response?.data?.message ??
        (apiErr.response?.data?.error === "invalid_ticket_title"
          ? "Could not classify this issue. Go back and pick the topic again."
          : apiErr instanceof Error
            ? apiErr.message
            : "Please try again.");
      Alert.alert("Could not raise ticket", message);
    },
  });

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: resolveTopSafeInset(insets.top) + 6 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <AppText style={styles.headerTitle}>Share details</AppText>
            {displayOrderId ? (
              <AppText style={styles.headerSubtitle}>
                {isRideOrder ? "Ride" : "Order"} #{displayOrderId}
              </AppText>
            ) : null}
          </View>
          <View style={styles.headerSide} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AppText style={styles.lead}>Please share a few more details so we can help.</AppText>
            <CustomerSupportTicketIntakeForm
              issueTitle={optionLabel}
              initialDescription=""
              submitting={submitMutation.isPending}
              onSubmit={(payload) => submitMutation.mutate(payload)}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 6,
    minHeight: 44,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerSide: { width: 36, alignItems: "flex-start" },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },
  headerSubtitle: {
    marginTop: 2,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT,
    marginBottom: 12,
  },
});
