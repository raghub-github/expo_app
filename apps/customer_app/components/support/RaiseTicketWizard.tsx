/**
 * Raise-ticket wizard as a full screen (pick order → concerns → details).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Pressable,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import {
  customerSupportService,
  type HelpSection,
  type RecentOrder,
} from "@/services/customerSupport.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { formatDisplayOrderIdHash, helpServiceTypeFromOrder } from "@/lib/formatDisplayOrderId";
import { SUPPORT_PAGE_BG, supportHeaderPaddingTop } from "@/lib/supportLayout";
import { useScreenChromeStore } from "@/store/screenChromeStore";

export type RaiseTicketWizardStep = "pick_order" | "concerns" | "details";

type RaiseTicketWizardProps = {
  initialStep?: RaiseTicketWizardStep;
  initialNoOrderMode?: boolean;
};

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

function StepHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.stepHeader}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={styles.backIconBtn}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={GatiMitraColors.emerald} />
      </Pressable>
      <View style={styles.stepHeaderBody}>
        <AppText style={styles.h1}>{title}</AppText>
        {subtitle ? <AppText style={styles.h2}>{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

export function RaiseTicketWizard({
  initialStep = "pick_order",
  initialNoOrderMode = false,
}: RaiseTicketWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

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

  const [step, setStep] = useState<RaiseTicketWizardStep>(initialStep);
  const [pickedOrder, setPickedOrder] = useState<RecentOrder | null>(null);
  const [noOrderMode, setNoOrderMode] = useState(initialNoOrderMode);
  const [orderPage, setOrderPage] = useState(0);
  const [accumulatedOrders, setAccumulatedOrders] = useState<RecentOrder[]>([]);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<HelpSection | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

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

  const concernsFilter = useMemo(() => {
    if (noOrderMode) return "NO_ORDER";
    if (pickedOrder) return pickedOrder.status;
    return undefined;
  }, [noOrderMode, pickedOrder]);

  const concernsServiceType = useMemo(
    () => (noOrderMode ? undefined : helpServiceTypeFromOrder(pickedOrder)),
    [noOrderMode, pickedOrder]
  );

  const concernsQ = useQuery({
    queryKey: ["customer-support-help-sections", concernsFilter, concernsServiceType, showAllTopics],
    queryFn: () => {
      if (showAllTopics) {
        return customerSupportService.getHelpSections(
          concernsServiceType ? { serviceType: concernsServiceType } : undefined
        );
      }
      if (noOrderMode) {
        return customerSupportService.getHelpSections(concernsFilter);
      }
      return customerSupportService.getHelpSections({
        orderStatus: concernsFilter,
        serviceType: concernsServiceType,
      });
    },
    enabled: step === "concerns",
    staleTime: 60_000,
  });

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

  const exitWizard = useCallback(() => {
    router.back();
  }, [router]);

  const handleWizardBack = useCallback(() => {
    if (step === "pick_order" || (step === "concerns" && noOrderMode)) {
      exitWizard();
      return;
    }
    if (step === "concerns") {
      setStep("pick_order");
      return;
    }
    setStep("concerns");
  }, [exitWizard, noOrderMode, step]);

  const renderBody = () => {
    if (step === "pick_order") {
      const loading = recentOrdersQ.isLoading && accumulatedOrders.length === 0;
      return (
        <>
          <StepHeader
            title="Which order is this about?"
            subtitle="Pick the order — the agent will see everything about it."
            onBack={handleWizardBack}
          />
          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {loading ? (
              <ActivityIndicator color={GatiMitraColors.emerald} style={{ marginTop: 30 }} />
            ) : accumulatedOrders.length === 0 ? (
              <View style={{ marginTop: 12 }}>
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
              <>
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
                      style={[styles.orderCard, styles.choiceGap]}
                      activeOpacity={0.85}
                    >
                      <View style={styles.orderHeaderRow}>
                        <AppText style={styles.orderRef}>{formatDisplayOrderIdHash(o)}</AppText>
                        <View style={[styles.badge, { backgroundColor: sb.bg }]}>
                          <AppText style={[styles.badgeText, { color: sb.color }]}>{sb.label}</AppText>
                        </View>
                      </View>
                      <AppText style={styles.orderStore} numberOfLines={1}>
                        {o.merchant_store_name ?? "Order"}
                      </AppText>
                      {o.item_preview || o.customer_name ? (
                        <AppText style={styles.orderItems} numberOfLines={1}>
                          {[o.customer_name, o.item_preview].filter(Boolean).join(" · ")}
                        </AppText>
                      ) : null}
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
                    style={[styles.loadMore, styles.choiceGap]}
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
                  style={styles.bigChoice}
                >
                  <View style={[styles.bigIcon, { backgroundColor: "#F1F5F9" }]}>
                    <Ionicons name="help-circle-outline" size={22} color={GatiMitraColors.textSecondary} />
                  </View>
                  <AppText style={[styles.bigTitle, { flex: 1 }]}>None of these — general help</AppText>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </>
      );
    }

    if (step === "concerns") {
      const titles = concernsQ.data ?? [];
      return (
        <>
          <StepHeader
            title={showAllTopics ? "All help topics" : "Common concerns"}
            subtitle={
              showAllTopics
                ? "Browse the full list."
                : pickedOrder
                  ? "These are the most likely issues for this order's stage."
                  : "Pick what best matches your issue."
            }
            onBack={handleWizardBack}
          />
          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {pickedOrder ? (
              <View style={styles.contextChip}>
                <Ionicons name="receipt-outline" size={16} color="#15803d" />
                <AppText style={styles.contextChipText} numberOfLines={1}>
                  Order {formatDisplayOrderIdHash(pickedOrder)} ·{" "}
                  {statusLabel(pickedOrder.status, pickedOrder.current_status).label}
                </AppText>
              </View>
            ) : (
              <View style={styles.contextChip}>
                <Ionicons name="help-circle-outline" size={16} color="#15803d" />
                <AppText style={styles.contextChipText}>Not about a specific order</AppText>
              </View>
            )}

            {concernsQ.isLoading ? (
              <ActivityIndicator color={GatiMitraColors.emerald} style={{ marginTop: 30 }} />
            ) : concernsQ.isError ? (
              <View style={styles.errorBox}>
                <AppText style={styles.errorText}>
                  Could not load topics. Check your connection and try again.
                </AppText>
                <TouchableOpacity onPress={() => void concernsQ.refetch()} style={styles.retryBtn}>
                  <AppText style={styles.retryText}>Retry</AppText>
                </TouchableOpacity>
              </View>
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
                          ? `Order ${formatDisplayOrderIdHash(pickedOrder)} — ${t.title_text}`
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

            <TouchableOpacity onPress={() => setShowAllTopics((s) => !s)} style={styles.showAllBtn}>
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
        </>
      );
    }

    return (
      <>
        <StepHeader
          title="Describe your issue"
          subtitle="Add a subject and tell us what happened."
          onBack={handleWizardBack}
        />
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.selectedBox}>
            <AppText style={styles.selectedLabel}>You picked</AppText>
            <AppText style={styles.selectedText}>{selectedTitle?.title_text}</AppText>
            {pickedOrder ? (
              <AppText style={styles.selectedGroup}>For order {formatDisplayOrderIdHash(pickedOrder)}</AppText>
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
          <View style={styles.submitHintIcons} accessibilityLabel="Photos and attachments can be added in chat">
            <Ionicons name="images-outline" size={20} color={GatiMitraColors.textSecondary} />
            <Ionicons name="attach-outline" size={20} color={GatiMitraColors.textSecondary} />
          </View>
          <AppText style={styles.submitHintText}>
            You can attach images and attachments in the chat screen.
          </AppText>
        </ScrollView>
      </>
    );
  };

  return (
    <>
      <StatusBar style="dark" backgroundColor={SUPPORT_PAGE_BG} />
      <View style={[styles.page, { paddingTop: supportHeaderPaddingTop(insets.top) }]}>
        {renderBody()}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: SUPPORT_PAGE_BG,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 16, paddingTop: 4 },
  choiceGap: { marginBottom: 12 },
  stepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  backIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stepHeaderBody: { flex: 1, paddingRight: 12 },
  h1: { fontSize: 21, fontFamily: StoreFonts.loraBold, color: GatiMitraColors.textPrimary },
  h2: {
    fontSize: 14,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
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
  bigTitle: { fontSize: 15, fontFamily: StoreFonts.loraBold, color: GatiMitraColors.textPrimary },
  orderCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  orderHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderRef: { fontSize: 14, fontFamily: StoreFonts.loraBold, color: GatiMitraColors.textPrimary },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: {
    fontSize: 11,
    fontFamily: StoreFonts.poppinsBold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  orderStore: { fontSize: 13, fontFamily: StoreFonts.loraRegular, color: GatiMitraColors.textSecondary, marginTop: 4 },
  orderItems: { fontSize: 12, fontFamily: StoreFonts.poppinsSemiBold, color: GatiMitraColors.textSecondary, marginTop: 2 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  orderWhen: { fontSize: 12, fontFamily: StoreFonts.loraRegular, color: GatiMitraColors.textSecondary },
  orderTotal: { fontSize: 13, fontFamily: StoreFonts.poppinsBold, color: GatiMitraColors.textPrimary },
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
  loadMoreText: { color: GatiMitraColors.emerald, fontFamily: StoreFonts.loraBold, fontSize: 14 },
  emptyText: {
    color: GatiMitraColors.textSecondary,
    fontFamily: StoreFonts.loraRegular,
    padding: 20,
    textAlign: "center",
    fontStyle: "italic",
  },
  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignSelf: "flex-start",
  },
  contextChipText: { color: "#15803d", fontFamily: StoreFonts.loraBold, fontSize: 12 },
  sectionHead: {
    fontSize: 11,
    fontFamily: StoreFonts.poppinsBold,
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
  titleCardText: { flex: 1, fontSize: 14, fontFamily: StoreFonts.loraBold, color: GatiMitraColors.textPrimary },
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
  showAllText: { color: GatiMitraColors.emerald, fontFamily: StoreFonts.loraBold, fontSize: 13 },
  selectedBox: {
    backgroundColor: "#ECFDF5",
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  selectedLabel: {
    fontSize: 11,
    fontFamily: StoreFonts.poppinsBold,
    color: "#15803d",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedText: { fontSize: 15, fontFamily: StoreFonts.loraBold, color: "#0f172a", marginTop: 2 },
  selectedGroup: { fontSize: 12, fontFamily: StoreFonts.loraRegular, color: "#15803d", marginTop: 4 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimary,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textPrimary,
    backgroundColor: "#fff",
  },
  textarea: { minHeight: 130, textAlignVertical: "top" },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: GatiMitraColors.textSecondary,
    marginTop: 4,
  },
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
  submitText: { color: "#fff", fontFamily: StoreFonts.loraBold, fontSize: 16 },
  submitHintIcons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 12,
    opacity: 0.72,
  },
  submitHintText: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 12,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  errorBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
  },
  errorText: { color: "#B91C1C", fontSize: 14, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: GatiMitraColors.emerald,
  },
  retryText: { color: GatiMitraColors.emerald, fontWeight: "700", fontSize: 14 },
});
