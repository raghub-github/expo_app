/**
 * Raise a new ticket — order-context-aware wizard.
 *
 * Steps:
 *   1. Context → "About an order" vs "Not about an order"
 *   2. (if About an order) Order picker — 3 recent orders at a time + Load more
 *   3. Concerns — server returns ONLY status-relevant titles for the picked
 *      order (or NO_ORDER titles when not-about-an-order); user picks one or
 *      taps "Show all topics" to browse the full catalog.
 *   4. Subject + description → submit.
 *
 * All status→concerns mapping is admin-curated via
 * `ticket_titles.applicable_order_statuses`. Adding new entries in the
 * super-admin Titles UI makes them appear here automatically.
 */

import React, { useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  customerSupportService,
  type HelpSection,
  type RecentOrder,
} from "@/services/customerSupport.service";
import { GatiMitraColors } from "@/constants/gatimitra";

type Step = "context" | "pick_order" | "concerns" | "details";

function statusLabel(status: string, current_status: string | null): { label: string; color: string; bg: string } {
  const s = String(status || "").toLowerCase();
  if (s === "delivered") return { label: "Delivered", color: "#15803d", bg: "#dcfce7" };
  if (s === "cancelled") return { label: "Cancelled", color: "#b91c1c", bg: "#fee2e2" };
  if (s === "failed") return { label: "Failed", color: "#b91c1c", bg: "#fee2e2" };
  if (s === "picked_up" || s === "in_transit") return { label: current_status || "On the way", color: "#1d4ed8", bg: "#dbeafe" };
  if (s === "accepted" || s === "reached_store") return { label: current_status || "Preparing", color: "#b45309", bg: "#fef3c7" };
  if (s === "assigned") return { label: "Placed", color: "#7c3aed", bg: "#ede9fe" };
  return { label: status, color: "#374151", bg: "#e5e7eb" };
}

function whenPlaced(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function RaiseTicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("context");
  const [pickedOrder, setPickedOrder] = useState<RecentOrder | null>(null);
  /** True once the user picked "not about an order" — drives concerns filter. */
  const [noOrderMode, setNoOrderMode] = useState(false);
  const [orderPage, setOrderPage] = useState(0);
  const [accumulatedOrders, setAccumulatedOrders] = useState<RecentOrder[]>([]);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<HelpSection | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  // Recent orders — paginated 3 at a time
  const PAGE = 3;
  const recentOrdersQ = useQuery({
    queryKey: ["customer-recent-orders", orderPage],
    queryFn: () => customerSupportService.getRecentOrders({ limit: PAGE, offset: orderPage * PAGE }),
    enabled: step === "pick_order",
    staleTime: 30_000,
  });
  useEffect(() => {
    if (recentOrdersQ.data && step === "pick_order") {
      setAccumulatedOrders((prev) => {
        if (orderPage === 0) return recentOrdersQ.data!.orders;
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...recentOrdersQ.data!.orders.filter((o) => !seen.has(o.id))];
      });
    }
  }, [recentOrdersQ.data, orderPage, step]);

  /** Server-side status filter to return only relevant concerns. */
  const concernsFilter = useMemo(() => {
    if (noOrderMode) return "NO_ORDER";
    if (pickedOrder) return pickedOrder.status;
    return undefined;
  }, [noOrderMode, pickedOrder]);

  const concernsQ = useQuery({
    queryKey: ["customer-support-help-sections", concernsFilter, showAllTopics],
    queryFn: () =>
      customerSupportService.getHelpSections(showAllTopics ? undefined : concernsFilter),
    enabled: step === "concerns",
    staleTime: 60_000,
  });

  // Group titles for the "show all" view
  const groupedAll = useMemo(() => {
    if (!showAllTopics || !concernsQ.data) return null;
    const map = new Map<string, HelpSection[]>();
    for (const t of concernsQ.data) {
      const k = t.section_id || "general";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    const order = ["orders", "payments", "account", "app", "general"];
    const out: Array<{ key: string; items: HelpSection[] }> = [];
    for (const k of order) if (map.has(k)) out.push({ key: k, items: map.get(k)! });
    for (const [k, v] of map) if (!order.includes(k)) out.push({ key: k, items: v });
    return out;
  }, [concernsQ.data, showAllTopics]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTitle) throw new Error("Please pick a topic.");
      const subj = subject.trim() || selectedTitle.title_text || "Support request";
      const desc = description.trim();
      if (desc.length < 10) throw new Error("Please describe the issue in at least 10 characters.");
      return customerSupportService.createTicket({
        ticket_title_id: selectedTitle.ticket_title_id,
        section_code: selectedTitle.section_id ?? undefined,
        subject: subj,
        description: desc,
        order_id: pickedOrder?.id ?? null,
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

  /* ─────────────── Step rendering ─────────────── */

  if (step === "context") {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }}
      >
        <AppText style={styles.h1}>What's this about?</AppText>
        <AppText style={styles.h2}>Tell us if your issue is about a specific order so we can pull up the details.</AppText>
        <View style={{ marginTop: 18, gap: 12 }}>
          <TouchableOpacity
            style={styles.bigChoice}
            activeOpacity={0.85}
            onPress={() => {
              setNoOrderMode(false);
              setStep("pick_order");
            }}
          >
            <View style={[styles.bigIcon, { backgroundColor: "#FEE2E215" }]}>
              <Ionicons name="receipt" size={26} color="#dc2626" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.bigTitle}>About an order</AppText>
              <AppText style={styles.bigSub}>Cancel, refund, damaged, delay, missing item, wrong item, rider issue…</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bigChoice}
            activeOpacity={0.85}
            onPress={() => {
              setNoOrderMode(true);
              setPickedOrder(null);
              setStep("concerns");
            }}
          >
            <View style={[styles.bigIcon, { backgroundColor: "#DBEAFE15" }]}>
              <Ionicons name="help-circle" size={26} color="#1d4ed8" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.bigTitle}>Not about an order</AppText>
              <AppText style={styles.bigSub}>Account, payments, app issues, feedback, general help…</AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (step === "pick_order") {
    const loading = recentOrdersQ.isLoading && accumulatedOrders.length === 0;
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }}
      >
        <TouchableOpacity onPress={() => setStep("context")} style={styles.backRow}>
          <Ionicons name="chevron-back" size={18} color={GatiMitraColors.emerald} />
          <AppText style={styles.backText}>Back</AppText>
        </TouchableOpacity>
        <AppText style={styles.h1}>Which order is this about?</AppText>
        <AppText style={styles.h2}>Pick the order — the agent will see everything about it.</AppText>

        {loading ? (
          <ActivityIndicator color={GatiMitraColors.emerald} style={{ marginTop: 30 }} />
        ) : accumulatedOrders.length === 0 ? (
          <View style={{ marginTop: 24 }}>
            <AppText style={styles.emptyText}>You haven't placed any orders yet.</AppText>
            <TouchableOpacity
              onPress={() => {
                setNoOrderMode(true);
                setPickedOrder(null);
                setStep("concerns");
              }}
              style={[styles.bigChoice, { marginTop: 12 }]}
            >
              <AppText style={styles.bigTitle}>Raise a general ticket instead</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ marginTop: 14, gap: 10 }}>
            {accumulatedOrders.map((o) => {
              const sb = statusLabel(o.status, o.current_status);
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => {
                    setPickedOrder(o);
                    setNoOrderMode(false);
                    setShowAllTopics(false);
                    setSelectedTitle(null);
                    setStep("concerns");
                  }}
                  style={styles.orderCard}
                  activeOpacity={0.85}
                >
                  <View style={styles.orderHeaderRow}>
                    <AppText style={styles.orderRef}>#{o.order_id ?? o.id}</AppText>
                    <View style={[styles.badge, { backgroundColor: sb.bg }]}>
                      <AppText style={[styles.badgeText, { color: sb.color }]}>{sb.label}</AppText>
                    </View>
                  </View>
                  <AppText style={styles.orderStore} numberOfLines={1}>
                    {o.merchant_store_name ?? "Order"}
                  </AppText>
                  <View style={styles.orderFooter}>
                    <AppText style={styles.orderWhen}>{whenPlaced(o.placed_at)}</AppText>
                    {o.grand_total != null ? (
                      <AppText style={styles.orderTotal}>₹{o.grand_total.toFixed(0)}</AppText>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            {recentOrdersQ.data?.hasMore ? (
              <TouchableOpacity
                onPress={() => setOrderPage((p) => p + 1)}
                style={styles.loadMore}
                disabled={recentOrdersQ.isFetching}
              >
                {recentOrdersQ.isFetching ? (
                  <ActivityIndicator color={GatiMitraColors.emerald} size="small" />
                ) : (
                  <>
                    <AppText style={styles.loadMoreText}>Load more orders</AppText>
                    <Ionicons name="chevron-down" size={16} color={GatiMitraColors.emerald} />
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                setNoOrderMode(true);
                setPickedOrder(null);
                setShowAllTopics(false);
                setSelectedTitle(null);
                setStep("concerns");
              }}
              style={[styles.bigChoice, { marginTop: 8 }]}
            >
              <View style={[styles.bigIcon, { backgroundColor: "#F1F5F9" }]}>
                <Ionicons name="help-circle-outline" size={22} color={GatiMitraColors.textSecondary} />
              </View>
              <AppText style={[styles.bigTitle, { flex: 1 }]}>None of these — general help</AppText>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    );
  }

  if (step === "concerns") {
    const titles = concernsQ.data ?? [];
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }}
      >
        <TouchableOpacity
          onPress={() => setStep(noOrderMode ? "context" : "pick_order")}
          style={styles.backRow}
        >
          <Ionicons name="chevron-back" size={18} color={GatiMitraColors.emerald} />
          <AppText style={styles.backText}>Back</AppText>
        </TouchableOpacity>

        {pickedOrder ? (
          <View style={styles.contextChip}>
            <Ionicons name="receipt-outline" size={16} color="#15803d" />
            <AppText style={styles.contextChipText} numberOfLines={1}>
              Order #{pickedOrder.order_id ?? pickedOrder.id} · {statusLabel(pickedOrder.status, pickedOrder.current_status).label}
            </AppText>
          </View>
        ) : (
          <View style={styles.contextChip}>
            <Ionicons name="help-circle-outline" size={16} color="#15803d" />
            <AppText style={styles.contextChipText}>Not about a specific order</AppText>
          </View>
        )}

        <AppText style={styles.h1}>{showAllTopics ? "All help topics" : "Common concerns"}</AppText>
        <AppText style={styles.h2}>
          {showAllTopics
            ? "Browse the full list."
            : pickedOrder
              ? "These are the most likely issues for this order's stage."
              : "Pick what best matches your issue."}
        </AppText>

        {concernsQ.isLoading ? (
          <ActivityIndicator color={GatiMitraColors.emerald} style={{ marginTop: 30 }} />
        ) : showAllTopics && groupedAll ? (
          <View style={{ marginTop: 12 }}>
            {groupedAll.map((g) => (
              <View key={g.key} style={{ marginBottom: 18 }}>
                <AppText style={styles.sectionHead}>{g.key.replace(/_/g, " ").toUpperCase()}</AppText>
                {g.items.map((t) => (
                  <TouchableOpacity
                    key={t.ticket_title_id}
                    onPress={() => {
                      setSelectedTitle(t);
                      setSubject(t.title_text ?? "");
                      setStep("details");
                    }}
                    style={styles.titleCard}
                  >
                    <AppText style={styles.titleCardText}>{t.title_text}</AppText>
                    <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        ) : titles.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            {titles.map((t) => (
              <TouchableOpacity
                key={t.ticket_title_id}
                onPress={() => {
                  setSelectedTitle(t);
                  setSubject(
                    pickedOrder && t.title_text
                      ? `Order #${pickedOrder.order_id ?? pickedOrder.id} — ${t.title_text}`
                      : t.title_text ?? ""
                  );
                  setStep("details");
                }}
                style={styles.titleCard}
                activeOpacity={0.85}
              >
                <AppText style={styles.titleCardText}>{t.title_text}</AppText>
                <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <AppText style={styles.emptyText}>No matching topics. Tap "Show all topics" below.</AppText>
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
          <AppText style={styles.showAllText}>
            {showAllTopics ? "Show only relevant topics" : "Show all topics"}
          </AppText>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // step === "details"
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={() => setStep("concerns")} style={styles.backRow}>
        <Ionicons name="chevron-back" size={18} color={GatiMitraColors.emerald} />
        <AppText style={styles.backText}>Change topic</AppText>
      </TouchableOpacity>
      <View style={styles.selectedBox}>
        <AppText style={styles.selectedLabel}>You picked</AppText>
        <AppText style={styles.selectedText}>{selectedTitle?.title_text}</AppText>
        {pickedOrder ? (
          <AppText style={styles.selectedGroup}>For order #{pickedOrder.order_id ?? pickedOrder.id}</AppText>
        ) : null}
        {selectedTitle?.group_name ? (
          <AppText style={styles.selectedGroup}>Routed to: {selectedTitle.group_name}</AppText>
        ) : null}
      </View>

      <AppText style={styles.fieldLabel}>Subject</AppText>
      <TextInput
        value={subject}
        onChangeText={setSubject}
        style={styles.input}
        placeholder="Brief title for your issue"
        placeholderTextColor={GatiMitraColors.textSecondary}
        maxLength={500}
      />

      <AppText style={styles.fieldLabel}>Describe the problem</AppText>
      <TextInput
        value={description}
        onChangeText={setDescription}
        style={[styles.input, styles.textarea]}
        placeholder="Tell us what happened. Photos can be attached in the chat after submission."
        placeholderTextColor={GatiMitraColors.textSecondary}
        multiline
        maxLength={10000}
      />
      <AppText style={styles.charCount}>{description.length}/10000</AppText>

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
            <AppText style={styles.submitText}>Raise ticket</AppText>
          </>
        )}
      </TouchableOpacity>
      <AppText style={styles.note}>
        An agent from the right team will be assigned automatically. You can chat and attach photos on the next screen.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  h1: { fontSize: 22, fontWeight: "800", color: GatiMitraColors.textPrimary },
  h2: { fontSize: 14, color: GatiMitraColors.textSecondary, marginTop: 4 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  backText: { color: GatiMitraColors.emerald, fontWeight: "700" },
  bigChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  bigIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  bigTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  bigSub: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 2 },
  orderCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  orderHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderRef: { fontSize: 14, fontWeight: "800", color: GatiMitraColors.textPrimary },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  orderStore: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  orderWhen: { fontSize: 12, color: GatiMitraColors.textSecondary },
  orderTotal: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.textPrimary },
  loadMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    backgroundColor: "#fff",
  },
  loadMoreText: { color: GatiMitraColors.emerald, fontWeight: "700", fontSize: 14 },
  emptyText: { color: GatiMitraColors.textSecondary, padding: 20, textAlign: "center", fontStyle: "italic" },
  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignSelf: "flex-start",
  },
  contextChipText: { color: "#15803d", fontWeight: "700", fontSize: 12 },
  sectionHead: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 4,
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
});
