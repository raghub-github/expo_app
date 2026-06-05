/**
 * Order-linked support ticket — opened from order detail "Support".
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
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  customerSupportService,
  type HelpSection,
  type RecentOrder,
} from "@/services/customerSupport.service";
import { orderService } from "@/services/order.service";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { isPersonRideOrder } from "@/lib/customer-order-status-display";
import { getRideHistoryStatusLabel, getRideServiceLabel, formatRideFare } from "@/lib/ride-order-display";
import { resolvePlaceDisplayName } from "@/services/location.service";

const GREEN = "#22C55E";
const PAGE_BG = "#F5F5F5";
const CARD = "#FFFFFF";
const BORDER = "#EBEBEB";
const TEXT = "#1C1C1C";
const MUTED = "#828282";

type Step = "topics" | "details";

function paramOne(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function statusForHelpFilter(status: string | null | undefined): string | undefined {
  const raw = (status ?? "").trim();
  if (!raw) return undefined;
  return raw.toLowerCase();
}

function statusBadge(status: string, isRide: boolean): { label: string; color: string; bg: string } {
  if (isRide) {
    const label = getRideHistoryStatusLabel(status);
    const s = status.toUpperCase();
    if (s.includes("CANCEL") || s.includes("FAIL")) return { label, color: "#B91C1C", bg: "#FEE2E2" };
    if (s.includes("DELIVER")) return { label, color: "#15803d", bg: "#DCFCE7" };
    return { label, color: "#1D4ED8", bg: "#DBEAFE" };
  }
  const s = status.toUpperCase();
  if (s.includes("DELIVER")) return { label: "Delivered", color: "#15803d", bg: "#DCFCE7" };
  if (s.includes("CANCEL") || s.includes("FAIL")) return { label: "Cancelled", color: "#B91C1C", bg: "#FEE2E2" };
  if (s.includes("PICK") || s.includes("TRANSIT") || s.includes("DELIVERY"))
    return { label: "On the way", color: "#1D4ED8", bg: "#DBEAFE" };
  if (s.includes("PREPAR") || s.includes("ACCEPT"))
    return { label: "Preparing", color: "#B45309", bg: "#FEF3C7" };
  return { label: status.replace(/_/g, " "), color: "#374151", bg: "#F3F4F6" };
}

export default function OrderRaiseTicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    orderId?: string | string[];
    orderRef?: string | string[];
    coreOrderId?: string | string[];
  }>();

  const orderIdParam = paramOne(params.orderId)?.trim() ?? "";
  const orderRefParam = paramOne(params.orderRef)?.trim() ?? "";
  const coreOrderIdParam = paramOne(params.coreOrderId)?.trim() ?? "";

  const lookupRefs = useMemo(() => {
    const refs = [coreOrderIdParam, orderIdParam, orderRefParam].filter(Boolean);
    return [...new Set(refs)];
  }, [coreOrderIdParam, orderIdParam, orderRefParam]);

  const [step, setStep] = useState<Step>("topics");
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<HelpSection | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const resolvedOrderQ = useQuery({
    queryKey: ["raise-ticket-resolve", ...lookupRefs],
    queryFn: async (): Promise<RecentOrder | null> => {
      for (const ref of lookupRefs) {
        const hit = await customerSupportService.resolveOrderForTicket(ref);
        if (hit) return hit;
      }
      return null;
    },
    enabled: lookupRefs.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const resolved = resolvedOrderQ.data;
  const coreOrderId = resolved?.id ?? null;
  const canonicalOrderId = resolved?.order_id ?? orderIdParam;
  const displayOrderId = resolved?.formatted_order_id ?? orderRefParam ?? canonicalOrderId;

  const orderDetailQ = useQuery({
    queryKey: ["order", canonicalOrderId, displayOrderId],
    queryFn: async () => {
      if (canonicalOrderId) {
        try {
          return await orderService.getOrder(canonicalOrderId);
        } catch {
          /* fall through */
        }
      }
      if (displayOrderId && displayOrderId !== canonicalOrderId) {
        return orderService.getOrder(displayOrderId);
      }
      throw new Error("Order not found");
    },
    enabled: !!resolved && (!!canonicalOrderId || !!displayOrderId),
    staleTime: 30_000,
  });

  const order = orderDetailQ.data;
  const isRideOrder = useMemo(() => {
    if (order && isPersonRideOrder(order)) return true;
    if ((resolved?.order_type ?? "").trim().toLowerCase() === "person_ride") return true;
    const ref = (resolved?.formatted_order_id ?? resolved?.order_id ?? orderRefParam ?? orderIdParam).trim().toUpperCase();
    return /^GMP\d*/.test(ref);
  }, [order, resolved, orderRefParam, orderIdParam]);

  const statusForTopics = statusForHelpFilter(
    order?.status ?? resolved?.current_status ?? resolved?.status
  );
  const helpServiceType = isRideOrder ? "person_ride" : "food";
  const badge = statusBadge(String(order?.status ?? resolved?.current_status ?? resolved?.status ?? ""), isRideOrder);

  const concernsQ = useQuery({
    queryKey: ["customer-support-help-sections", statusForTopics, showAllTopics, coreOrderId, helpServiceType],
    queryFn: () =>
      customerSupportService.getHelpSections(
        showAllTopics ? undefined : statusForTopics,
        helpServiceType
      ),
    enabled: coreOrderId != null && step === "topics",
    staleTime: 60_000,
  });

  const concerns = concernsQ.data ?? [];
  const groupedAll = useMemo(() => {
    if (!showAllTopics || concerns.length === 0) return null;
    const map = new Map<string, HelpSection[]>();
    for (const t of concerns) {
      const k = t.section_id || "general";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    const orderKeys = ["orders", "rides", "payments", "account", "app", "general"];
    const out: Array<{ key: string; items: HelpSection[] }> = [];
    for (const k of orderKeys) if (map.has(k)) out.push({ key: k, items: map.get(k)! });
    for (const [k, v] of map) if (!orderKeys.includes(k)) out.push({ key: k, items: v });
    return out;
  }, [concerns, showAllTopics]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (coreOrderId == null) throw new Error("Could not link this order. Go back and try again.");
      if (!selectedTitle) throw new Error("Please pick a topic.");
      const subj =
        subject.trim() ||
        (selectedTitle.title_text
          ? `${isRideOrder ? "Ride" : "Order"} #${displayOrderId} — ${selectedTitle.title_text}`
          : `${isRideOrder ? "Ride" : "Order"} #${displayOrderId} help`);
      const desc = description.trim();
      if (desc.length < 10) throw new Error("Please describe the issue in at least 10 characters.");
      return customerSupportService.createTicket({
        ticket_title_id: selectedTitle.ticket_title_id,
        section_code: selectedTitle.section_id ?? "orders",
        subject: subj,
        description: desc,
        order_id: coreOrderId,
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

  const merchantName =
    order?.merchantPublicName ??
    order?.merchantName ??
    resolved?.merchant_store_name ??
    "Restaurant";
  const rideLabel = getRideServiceLabel(order?.rideType);
  const totalAmount = order?.totalAmount ?? resolved?.grand_total ?? null;
  const itemPreview = (order?.items ?? []).slice(0, 3);
  const moreItems = Math.max(0, (order?.items?.length ?? 0) - itemPreview.length);
  const ridePickup = resolvePlaceDisplayName({
    primary: order?.merchantAddress,
    fullAddress: order?.merchantAddress,
  });
  const rideDrop = resolvePlaceDisplayName({
    primary: order?.deliveryAddress,
    fullAddress: order?.deliveryAddress,
  });

  const renderBody = () => {
    if (lookupRefs.length === 0) {
      return (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={MUTED} />
          <Text style={styles.errTitle}>Missing order</Text>
          <Text style={styles.errText}>Open support from an order details page.</Text>
        </View>
      );
    }

    if (resolvedOrderQ.isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Finding your order…</Text>
        </View>
      );
    }

    if (coreOrderId == null) {
      return (
        <View style={styles.centered}>
          <Ionicons name="receipt-outline" size={40} color={MUTED} />
          <Text style={styles.errTitle}>Order not found</Text>
          <Text style={styles.errText}>
            We couldn't find order #{orderRefParam || orderIdParam} in your account.
          </Text>
          <TouchableOpacity style={styles.errBtn} onPress={() => router.back()}>
            <Text style={styles.errBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orderCard}>
          <View style={styles.orderCardTop}>
            <View style={[styles.orderIconWrap, isRideOrder && styles.rideIconWrap]}>
              <Ionicons
                name={isRideOrder ? "bicycle-outline" : "restaurant-outline"}
                size={20}
                color={isRideOrder ? "#2563EB" : GREEN}
              />
            </View>
            <View style={styles.orderCardMeta}>
              <Text style={styles.merchantName} numberOfLines={1}>
                {isRideOrder ? rideLabel : merchantName}
              </Text>
              <Text style={styles.orderIdLine}>
                {isRideOrder ? "Ride" : "Order"} #{displayOrderId}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>

          {isRideOrder ? (
            ridePickup || rideDrop ? (
              <View style={styles.itemsPreview}>
                {ridePickup ? (
                  <Text style={styles.itemLine} numberOfLines={1}>
                    Pickup · {ridePickup}
                  </Text>
                ) : null}
                {rideDrop ? (
                  <Text style={styles.itemLine} numberOfLines={1}>
                    Drop · {rideDrop}
                  </Text>
                ) : null}
              </View>
            ) : null
          ) : itemPreview.length > 0 ? (
            <View style={styles.itemsPreview}>
              {itemPreview.map((item, idx) => (
                <Text key={`${item.name}-${idx}`} style={styles.itemLine} numberOfLines={1}>
                  {item.quantity} × {item.name}
                </Text>
              ))}
              {moreItems > 0 ? (
                <Text style={styles.moreItems}>
                  +{moreItems} more item{moreItems > 1 ? "s" : ""}
                </Text>
              ) : null}
            </View>
          ) : null}

          {totalAmount != null ? (
            <Text style={styles.totalLine}>
              {isRideOrder ? "Fare" : "Total paid"} · {formatRideFare(totalAmount)}
            </Text>
          ) : null}
        </View>

        <View style={styles.stepRow}>
          <View style={[styles.stepDot, step === "topics" && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === "details" && styles.stepDotActive]} />
          <Text style={styles.stepLabel}>{step === "topics" ? "Pick a topic" : "Describe issue"}</Text>
        </View>

        {step === "topics" ? (
          <View style={styles.section}>
            <Text style={styles.h1}>What went wrong?</Text>
            <Text style={styles.h2}>
              {showAllTopics
                ? "Browse all help topics for this order."
                : "Topics matched to your order's current status."}
            </Text>

            {concernsQ.isLoading ? (
              <ActivityIndicator color={GREEN} style={{ marginTop: 28 }} />
            ) : showAllTopics && groupedAll ? (
              <View style={styles.topicList}>
                {groupedAll.map((g) => (
                  <View key={g.key} style={styles.topicGroup}>
                    <Text style={styles.groupHead}>{g.key.replace(/_/g, " ")}</Text>
                    {g.items.map((t) => (
                      <TopicRow
                        key={t.ticket_title_id}
                        title={t.title_text ?? "Help"}
                        onPress={() => {
                          setSelectedTitle(t);
                          setSubject(`${isRideOrder ? "Ride" : "Order"} #${displayOrderId} — ${t.title_text ?? "Help"}`);
                          setStep("details");
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : concerns.length > 0 ? (
              <View style={styles.topicList}>
                {concerns.map((t) => (
                  <TopicRow
                    key={t.ticket_title_id}
                    title={t.title_text ?? "Help"}
                    onPress={() => {
                      setSelectedTitle(t);
                      setSubject(`${isRideOrder ? "Ride" : "Order"} #${displayOrderId} — ${t.title_text ?? "Help"}`);
                      setStep("details");
                    }}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No status-specific topics available.</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => setShowAllTopics((s) => !s)}
              style={styles.toggleBtn}
              activeOpacity={0.85}
            >
              <Ionicons name={showAllTopics ? "filter" : "list"} size={18} color={GREEN} />
              <Text style={styles.toggleText}>
                {showAllTopics ? "Show relevant topics only" : "Show all topics"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={() => {
                setStep("topics");
                setSelectedTitle(null);
              }}
              style={styles.backRow}
            >
              <Ionicons name="chevron-back" size={18} color={GREEN} />
              <Text style={styles.backText}>Change topic</Text>
            </TouchableOpacity>

            {selectedTitle ? (
              <View style={styles.pickedBox}>
                <Ionicons name="checkmark-circle" size={18} color={GREEN} />
                <Text style={styles.pickedText}>{selectedTitle.title_text}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              style={styles.input}
              placeholder="Brief title for your issue"
              placeholderTextColor={MUTED}
              maxLength={500}
            />

            <Text style={styles.fieldLabel}>Tell us what happened</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              style={[styles.input, styles.textarea]}
              placeholder="Describe the issue in detail. You can attach photos in chat after submitting."
              placeholderTextColor={MUTED}
              multiline
              maxLength={10000}
            />
            <Text style={styles.charCount}>{description.length}/10000</Text>

            <TouchableOpacity
              disabled={createMutation.isPending}
              onPress={() => createMutation.mutate()}
              style={[styles.submitBtn, createMutation.isPending && styles.submitBtnDisabled]}
              activeOpacity={0.9}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="headset" size={18} color="#fff" />
                  <Text style={styles.submitText}>Submit ticket</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.note}>
              Our support team will review your order and assign the right agent. You can chat and
              share photos on the next screen.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Get help</Text>
          <View style={styles.headerSide} />
        </View>
        {renderBody()}
      </View>
    </>
  );
}

function TopicRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.topicRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.topicIcon}>
        <Ionicons name="help-buoy-outline" size={18} color={GREEN} />
      </View>
      <Text style={styles.topicText}>{title}</Text>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerSide: { width: 40, alignItems: "flex-start" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: TEXT,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: { marginTop: 12, color: MUTED, fontSize: 14 },
  errTitle: { marginTop: 12, fontSize: 17, fontWeight: "700", color: TEXT },
  errText: { marginTop: 6, color: MUTED, fontSize: 14, textAlign: "center", lineHeight: 20 },
  errBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GREEN,
  },
  errBtnText: { color: GREEN, fontWeight: "700", fontSize: 14 },

  orderCard: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  orderCardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  orderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  rideIconWrap: {
    backgroundColor: "#EFF6FF",
  },
  orderCardMeta: { flex: 1 },
  merchantName: { fontSize: 15, fontWeight: "700", color: TEXT },
  orderIdLine: { fontSize: 12, color: MUTED, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  itemsPreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    gap: 4,
  },
  itemLine: { fontSize: 13, color: "#4B5563" },
  moreItems: { fontSize: 12, color: MUTED, marginTop: 2 },
  totalLine: { marginTop: 10, fontSize: 13, fontWeight: "700", color: TEXT },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  stepDotActive: { backgroundColor: GREEN, width: 10, height: 10, borderRadius: 5 },
  stepLine: { width: 24, height: 2, backgroundColor: "#E5E7EB" },
  stepLabel: { marginLeft: 4, fontSize: 12, color: MUTED, fontWeight: "600" },

  section: { paddingHorizontal: 16, paddingTop: 4 },
  h1: { fontSize: 20, fontWeight: "800", color: TEXT },
  h2: { fontSize: 14, color: MUTED, marginTop: 4, lineHeight: 20 },

  topicList: { marginTop: 16, gap: 8 },
  topicGroup: { marginBottom: 12 },
  groupHead: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 10,
  },
  topicIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  topicText: { flex: 1, fontSize: 14, fontWeight: "600", color: TEXT },

  emptyBox: {
    marginTop: 20,
    padding: 16,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyText: { textAlign: "center", color: MUTED, fontSize: 14 },

  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GREEN,
    backgroundColor: CARD,
  },
  toggleText: { color: GREEN, fontWeight: "700", fontSize: 14 },

  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  backText: { color: GREEN, fontWeight: "700", fontSize: 14 },
  pickedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  pickedText: { flex: 1, fontSize: 14, fontWeight: "700", color: TEXT },

  fieldLabel: { fontSize: 13, fontWeight: "700", color: TEXT, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TEXT,
    backgroundColor: CARD,
  },
  textarea: { minHeight: 120, textAlignVertical: "top" },
  charCount: { textAlign: "right", fontSize: 11, color: MUTED, marginTop: 4 },

  submitBtn: {
    backgroundColor: GREEN,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.65 },
  submitText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  note: {
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
