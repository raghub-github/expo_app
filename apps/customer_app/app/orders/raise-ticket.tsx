/**
 * Order-linked ticket raise — opened from an order detail's "Need help with
 * this order?" button. Skips the order-picker step and jumps straight to
 * status-aware concerns for the specific order.
 *
 * Route: /orders/raise-ticket?orderId=<orders_core.id>&orderRef=<GM…>
 */

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  customerSupportService,
  type HelpSection,
  type RecentOrder,
} from "@/services/customerSupport.service";
import { GatiMitraColors } from "@/constants/gatimitra";

export default function OrderRaiseTicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    orderId?: string | string[];
    orderRef?: string | string[];
  }>();
  const orderIdRaw = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const orderRef = Array.isArray(params.orderRef) ? params.orderRef[0] : params.orderRef;
  const orderId = orderIdRaw && /^\d+$/.test(orderIdRaw) ? Number(orderIdRaw) : null;

  const [showAllTopics, setShowAllTopics] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<HelpSection | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  // Find this order in the customer's recent list to get its status.
  // We over-fetch up to 50 entries because the user might be raising a
  // ticket on an older order. (Endpoint maxes at 20 per call, so we ask
  // for that and hope the order is in the most recent window — if not
  // we just send no `order_status` filter and fall back to "show all".)
  const recentOrdersQ = useQuery({
    queryKey: ["customer-recent-orders-prefetch"],
    queryFn: () => customerSupportService.getRecentOrders({ limit: 20, offset: 0 }),
    enabled: orderId != null,
    staleTime: 30_000,
  });
  const thisOrder: RecentOrder | null = useMemo(() => {
    if (!recentOrdersQ.data) return null;
    return recentOrdersQ.data.orders.find((o) => o.id === orderId) ?? null;
  }, [recentOrdersQ.data, orderId]);

  const concernsQ = useQuery({
    queryKey: ["customer-support-help-sections", thisOrder?.status, showAllTopics],
    queryFn: () =>
      customerSupportService.getHelpSections(showAllTopics ? undefined : thisOrder?.status),
    enabled: orderId != null && (thisOrder != null || showAllTopics),
    staleTime: 60_000,
  });

  const concerns = concernsQ.data ?? [];
  const groupedAll = useMemo(() => {
    if (!showAllTopics || !concerns) return null;
    const map = new Map<string, HelpSection[]>();
    for (const t of concerns) {
      const k = t.section_id || "general";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    const order = ["orders", "payments", "account", "app", "general"];
    const out: Array<{ key: string; items: HelpSection[] }> = [];
    for (const k of order) if (map.has(k)) out.push({ key: k, items: map.get(k)! });
    for (const [k, v] of map) if (!order.includes(k)) out.push({ key: k, items: v });
    return out;
  }, [concerns, showAllTopics]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (orderId == null) throw new Error("Invalid order");
      if (!selectedTitle) throw new Error("Please pick a topic.");
      const subj =
        subject.trim() ||
        (selectedTitle.title_text
          ? `Order #${orderRef ?? orderId} — ${selectedTitle.title_text}`
          : `Order #${orderRef ?? orderId} help`);
      const desc = description.trim();
      if (desc.length < 10) throw new Error("Please describe the issue in at least 10 characters.");
      return customerSupportService.createTicket({
        ticket_title_id: selectedTitle.ticket_title_id,
        section_code: selectedTitle.section_id ?? "orders",
        subject: subj,
        description: desc,
        order_id: orderId,
      });
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] });
      router.replace({ pathname: "/support/[ticketId]", params: { ticketId: String(ticket.id) } });
    },
    onError: (err) => {
      Alert.alert("Could not raise ticket", err instanceof Error ? err.message : "Try again.");
    },
  });

  if (orderId == null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errText}>Invalid order reference.</Text>
      </View>
    );
  }

  const loadingInitial = (!thisOrder && recentOrdersQ.isLoading) || (concernsQ.isLoading && !concerns.length);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.contextChip}>
        <Ionicons name="receipt-outline" size={16} color="#15803d" />
        <Text style={styles.contextChipText} numberOfLines={1}>
          Order #{orderRef ?? orderId}
          {thisOrder ? ` · ${thisOrder.current_status ?? thisOrder.status}` : ""}
        </Text>
      </View>

      {!selectedTitle ? (
        <>
          <Text style={styles.h1}>What's the problem with this order?</Text>
          <Text style={styles.h2}>
            {showAllTopics
              ? "All help topics."
              : "These are the most likely issues for this order's current stage."}
          </Text>

          {loadingInitial ? (
            <ActivityIndicator color={GatiMitraColors.emerald} style={{ marginTop: 30 }} />
          ) : showAllTopics && groupedAll ? (
            <View style={{ marginTop: 14 }}>
              {groupedAll.map((g) => (
                <View key={g.key} style={{ marginBottom: 16 }}>
                  <Text style={styles.sectionHead}>{g.key.replace(/_/g, " ").toUpperCase()}</Text>
                  {g.items.map((t) => (
                    <TouchableOpacity
                      key={t.ticket_title_id}
                      onPress={() => {
                        setSelectedTitle(t);
                        setSubject(`Order #${orderRef ?? orderId} — ${t.title_text}`);
                      }}
                      style={styles.titleCard}
                    >
                      <Text style={styles.titleCardText}>{t.title_text}</Text>
                      <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          ) : concerns.length > 0 ? (
            <View style={{ marginTop: 14, gap: 8 }}>
              {concerns.map((t) => (
                <TouchableOpacity
                  key={t.ticket_title_id}
                  onPress={() => {
                    setSelectedTitle(t);
                    setSubject(`Order #${orderRef ?? orderId} — ${t.title_text}`);
                  }}
                  style={styles.titleCard}
                  activeOpacity={0.85}
                >
                  <Text style={styles.titleCardText}>{t.title_text}</Text>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              No status-specific topics. Tap "Show all topics" below.
            </Text>
          )}

          <TouchableOpacity
            onPress={() => setShowAllTopics((s) => !s)}
            style={styles.showAllBtn}
          >
            <Ionicons
              name={showAllTopics ? "filter-circle" : "list"}
              size={18}
              color={GatiMitraColors.emerald}
            />
            <Text style={styles.showAllText}>
              {showAllTopics ? "Show only relevant topics" : "Show all topics"}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity onPress={() => setSelectedTitle(null)} style={styles.backRow}>
            <Ionicons name="chevron-back" size={18} color={GatiMitraColors.emerald} />
            <Text style={styles.backText}>Change topic</Text>
          </TouchableOpacity>
          <View style={styles.selectedBox}>
            <Text style={styles.selectedLabel}>You picked</Text>
            <Text style={styles.selectedText}>{selectedTitle.title_text}</Text>
            {selectedTitle.group_name ? (
              <Text style={styles.selectedGroup}>Routed to: {selectedTitle.group_name}</Text>
            ) : null}
          </View>

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
            placeholder="Brief title for your issue"
            placeholderTextColor={GatiMitraColors.textSecondary}
            maxLength={500}
          />

          <Text style={styles.fieldLabel}>Describe what happened</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            placeholder="Tell us what went wrong. Photos can be attached in the chat after submission."
            placeholderTextColor={GatiMitraColors.textSecondary}
            multiline
            maxLength={10000}
          />
          <Text style={styles.charCount}>{description.length}/10000</Text>

          <TouchableOpacity
            disabled={createMutation.isPending}
            onPress={() => createMutation.mutate()}
            style={[styles.submitBtn, createMutation.isPending && { opacity: 0.6 }]}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={18} color="#fff" />
                <Text style={styles.submitText}>Raise ticket for this order</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.note}>
            An agent from the right team will be assigned automatically. You'll be able to chat and attach photos on the next screen.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errText: { color: GatiMitraColors.textSecondary, fontSize: 14 },
  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignSelf: "flex-start",
  },
  contextChipText: { fontSize: 13, fontWeight: "700", color: "#15803d" },
  h1: { fontSize: 22, fontWeight: "800", color: GatiMitraColors.textPrimary },
  h2: { fontSize: 14, color: GatiMitraColors.textSecondary, marginTop: 4 },
  sectionHead: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  titleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    marginBottom: 6,
  },
  titleCardText: { flex: 1, fontSize: 14, color: GatiMitraColors.textPrimary, fontWeight: "600" },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  backText: { color: GatiMitraColors.emerald, fontWeight: "700" },
  showAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraColors.emerald,
    backgroundColor: "#fff",
  },
  showAllText: { color: GatiMitraColors.emerald, fontWeight: "700", fontSize: 13 },
  selectedBox: {
    backgroundColor: "#ECFDF5",
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  selectedLabel: { fontSize: 11, color: "#15803d", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  selectedText: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 2 },
  selectedGroup: { fontSize: 12, color: "#15803d", marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.textPrimary, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    backgroundColor: "#fff",
  },
  textarea: { minHeight: 130, textAlignVertical: "top" },
  charCount: { textAlign: "right", fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 4 },
  submitBtn: {
    backgroundColor: GatiMitraColors.emerald,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  note: { fontSize: 12, color: GatiMitraColors.textSecondary, textAlign: "center", marginTop: 10, lineHeight: 18 },
  emptyText: { color: GatiMitraColors.textSecondary, padding: 16, textAlign: "center", fontStyle: "italic" },
});
