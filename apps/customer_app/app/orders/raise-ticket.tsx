/**
 * Order-linked help hub — Zomato-style quick actions + support ticket flow.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
  BackHandler,
  Platform,
  type ReactNode,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import {
  customerSupportService,
  type HelpSection,
  type RecentOrder,
} from "@/services/customerSupport.service";
import { orderService } from "@/services/order.service";
import { profileService } from "@/services/profile.service";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { LegalFooter } from "@/components/LegalLinks";
import { isPersonRideOrder } from "@/lib/customer-order-status-display";
import { getRideHistoryStatusLabel, getRideServiceLabel, formatRideFare } from "@/lib/ride-order-display";
import { maskPhone } from "@/lib/order-delivery-details";
import { canCustomerUpdateAlternateContact } from "@/lib/alternate-contact";
import {
  AlternateContactFlow,
  type AlternateContactFlowRef,
} from "@/components/orders/AlternateContactFlow";
import { ReportFraudBottomSheet } from "@/components/orders/ReportFraudBottomSheet";
import { OrderSupportChatFlow } from "@/components/orders/OrderSupportChatFlow";
import {
  customerSupportChatTopicsQueryKey,
  fetchCustomerSupportChatTopics,
} from "@/lib/customer-support-chat-topics";
import {
  isOrderSupportTicketWindowOpen,
  resolveOrderSupportAnchorAt,
} from "@/lib/order-support-ticket-window";
import type { FraudReportTargetType } from "@/services/customerSupport.service";

const GREEN = "#22C55E";
const PAGE_BG = "#F5F5F5";
const CARD = "#FFFFFF";
const BORDER = "#EBEBEB";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const HERO_TOP = "#E8F3FA";
const HERO_BOTTOM = "#F7FAFC";

type Step = "hub" | "chat" | "topics" | "details";

function paramOne(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function statusForHelpFilter(status: string | null | undefined): string | undefined {
  const raw = (status ?? "").trim();
  if (!raw) return undefined;
  return raw.toLowerCase();
}

function normalizeTel(raw: string | null | undefined): string | null {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (raw?.trim().startsWith("+")) return raw.trim();
  return `+${digits}`;
}

function DashedDivider() {
  return (
    <View style={styles.dashedDividerWrap}>
      <Text style={styles.dashedDivider} numberOfLines={1} ellipsizeMode="clip">
        - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
      </Text>
    </View>
  );
}

function HelpSectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeadBar}>
          <Text style={styles.sectionHeadText}>{title}</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

function HelpActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <View style={styles.rowIconWrap}>
        <Ionicons name={icon} size={17} color={MUTED} />
      </View>
      <View style={styles.rowTextCol}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color="#BDBDBD" /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.helpRow}>{inner}</View>;
  }

  return (
    <TouchableOpacity style={styles.helpRow} onPress={onPress} activeOpacity={0.85}>
      {inner}
    </TouchableOpacity>
  );
}

export default function OrderRaiseTicketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const params = useLocalSearchParams<{
    orderId?: string | string[];
    orderRef?: string | string[];
    coreOrderId?: string | string[];
    chat?: string | string[];
    ticketDisplayId?: string | string[];
  }>();

  const orderIdParam = paramOne(params.orderId)?.trim() ?? "";
  const orderRefParam = paramOne(params.orderRef)?.trim() ?? "";
  const coreOrderIdParam = paramOne(params.coreOrderId)?.trim() ?? "";

  const lookupRefs = useMemo(() => {
    const refs = [coreOrderIdParam, orderIdParam, orderRefParam].filter(Boolean);
    return [...new Set(refs)];
  }, [coreOrderIdParam, orderIdParam, orderRefParam]);

  const chatParam = paramOne(params.chat) === "1";
  const pendingTicketDisplayId = paramOne(params.ticketDisplayId)?.trim() ?? null;

  const [step, setStep] = useState<Step>(() => (chatParam ? "chat" : "hub"));
  const [chatBootstrapped, setChatBootstrapped] = useState(chatParam);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<HelpSection | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const alternateContactFlowRef = useRef<AlternateContactFlowRef>(null);
  const [fraudSheetTarget, setFraudSheetTarget] = useState<FraudReportTargetType | null>(null);
  /** Order picked from "another order" flow — stays in chat, no navigation. */
  const [chatLinkedOrder, setChatLinkedOrder] = useState<RecentOrder | null>(null);

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

  const orderDetailQ = useQuery({
    queryKey: ["order-help", ...lookupRefs],
    queryFn: async () => {
      for (const ref of lookupRefs) {
        try {
          return await orderService.getOrder(ref);
        } catch {
          /* try next ref */
        }
      }
      throw new Error("Order not found");
    },
    enabled: lookupRefs.length > 0,
    staleTime: 30_000,
    retry: 1,
  });

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileService.getProfile(),
    staleTime: 120_000,
  });

  const resolved = resolvedOrderQ.data;
  const order = orderDetailQ.data;
  const coreOrderId = resolved?.id ?? order?.coreOrderId ?? null;
  const canonicalOrderId = order?.orderId ?? resolved?.order_id ?? orderIdParam;
  const displayOrderId =
    order?.formattedOrderId ?? resolved?.formatted_order_id ?? orderRefParam ?? canonicalOrderId;
  const linkedCoreOrderId = chatLinkedOrder?.id ?? coreOrderId;
  const linkedDisplayOrderId =
    chatLinkedOrder?.formatted_order_id ??
    chatLinkedOrder?.order_id ??
    displayOrderId;
  const isRideOrder = useMemo(() => {
    if (order && isPersonRideOrder(order)) return true;
    if ((resolved?.order_type ?? "").trim().toLowerCase() === "person_ride") return true;
    const ref = (resolved?.formatted_order_id ?? resolved?.order_id ?? orderRefParam ?? orderIdParam)
      .trim()
      .toUpperCase();
    return /^GMP\d*/.test(ref);
  }, [order, resolved, orderRefParam, orderIdParam]);

  const ticketWindowAnchor = useMemo(() => {
    if (chatLinkedOrder) {
      return resolveOrderSupportAnchorAt({
        status: chatLinkedOrder.status,
        currentStatus: chatLinkedOrder.current_status,
        deliveredAt: chatLinkedOrder.delivered_at,
        cancelledAt: chatLinkedOrder.cancelled_at ?? null,
      });
    }
    if (resolved) {
      return resolveOrderSupportAnchorAt({
        status: resolved.status,
        currentStatus: resolved.current_status,
        deliveredAt: resolved.delivered_at,
        cancelledAt: resolved.cancelled_at ?? null,
      });
    }
    if (order) {
      return resolveOrderSupportAnchorAt({
        status: order.status,
        statusHistory: order.statusHistory,
      });
    }
    return null;
  }, [chatLinkedOrder, order, resolved]);

  const ticketWindowOpen = isOrderSupportTicketWindowOpen(ticketWindowAnchor);

  const statusForTopics = statusForHelpFilter(
    order?.status ?? resolved?.current_status ?? resolved?.status
  );
  const helpServiceType = isRideOrder ? "person_ride" : "food";

  const concernsQ = useQuery({
    queryKey: ["customer-support-help-sections", statusForTopics, showAllTopics, coreOrderId, helpServiceType],
    queryFn: () =>
      customerSupportService.getHelpSections(
        showAllTopics ? undefined : statusForTopics,
        helpServiceType
      ),
    enabled: coreOrderId != null && step !== "hub",
    staleTime: 60_000,
  });

  const concerns = concernsQ.data ?? [];

  const chatTopicsQ = useQuery({
    queryKey: customerSupportChatTopicsQueryKey(statusForTopics, helpServiceType),
    queryFn: () => fetchCustomerSupportChatTopics(statusForTopics, helpServiceType),
    enabled:
      !isRideOrder &&
      (chatParam || (coreOrderId != null && (statusForTopics === "delivered" || step === "chat"))),
    staleTime: 300_000,
    placeholderData: (previousData) => previousData,
  });

  const chatTopics = chatTopicsQ.data ?? [];

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
      if (linkedCoreOrderId == null) throw new Error("Could not link this order. Go back and try again.");
      if (!selectedTitle) throw new Error("Please pick a topic.");
      const subj =
        subject.trim() ||
        (selectedTitle.title_text
          ? `${isRideOrder ? "Ride" : "Order"} #${linkedDisplayOrderId} — ${selectedTitle.title_text}`
          : `${isRideOrder ? "Ride" : "Order"} #${linkedDisplayOrderId} help`);
      const desc = description.trim();
      if (desc.length < 10) throw new Error("Please describe the issue in at least 10 characters.");
      return customerSupportService.createTicket({
        ticket_title_id: selectedTitle.ticket_title_id,
        section_code: selectedTitle.section_id ?? "orders",
        subject: subj,
        description: desc,
        order_id: linkedCoreOrderId,
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

  const merchantName = useMemo(() => {
    const fromLinked = chatLinkedOrder?.merchant_store_name?.trim();
    if (fromLinked) return fromLinked;
    return (
      order?.merchantPublicName ??
      order?.merchantName ??
      resolved?.merchant_store_name ??
      "Restaurant"
    );
  }, [
    chatLinkedOrder?.merchant_store_name,
    order?.merchantPublicName,
    order?.merchantName,
    resolved?.merchant_store_name,
  ]);
  const rideLabel = getRideServiceLabel(order?.rideType);
  const hasRider = Boolean(order?.rider?.name || order?.rider?.phone);

  const hasAlternateContact = Boolean(order?.alternateContactSetAt);
  const canUpdateAlternateContact = canCustomerUpdateAlternateContact(
    order?.status ?? resolved?.current_status ?? resolved?.status
  );

  const alternateContactLine = useMemo(() => {
    const name =
      order?.deliveryContactName?.trim() ||
      profileQ.data?.full_name?.trim() ||
      "";
    const phone =
      order?.deliveryContactPhone?.trim() ||
      profileQ.data?.mobile_number?.trim() ||
      "";
    if (name && phone) return `${name}, ${maskPhone(phone)}`;
    if (name) return name;
    if (phone) return maskPhone(phone);
    return null;
  }, [
    order?.deliveryContactName,
    order?.deliveryContactPhone,
    profileQ.data?.full_name,
    profileQ.data?.mobile_number,
  ]);

  const handlePickAlternateContact = useCallback(() => {
    if (!canonicalOrderId || isRideOrder) return;
    alternateContactFlowRef.current?.open();
  }, [canonicalOrderId, isRideOrder]);

  const openDialer = useCallback((raw: string | null | undefined, unavailableMessage: string) => {
    const tel = normalizeTel(raw);
    if (!tel) {
      Alert.alert("Unavailable", unavailableMessage);
      return;
    }
    Linking.openURL(`tel:${tel}`).catch(() => {
      Alert.alert("Could not open dialer", "Please try again.");
    });
  }, []);

  const handleCallRestaurant = useCallback(() => {
    const tel = normalizeTel(order?.merchantPhone);
    if (!tel) {
      const storeId = order?.merchantPublicStoreId;
      if (storeId) {
        router.push({ pathname: "/home/merchant/[id]", params: { id: storeId } });
        return;
      }
      Alert.alert("Unavailable", "Restaurant phone number is not available for this order.");
      return;
    }
    void Linking.openURL(`tel:${tel}`);
  }, [order?.merchantPhone, order?.merchantPublicStoreId, router]);

  const handleCallRider = useCallback(() => {
    openDialer(order?.rider?.phone, "Delivery partner contact is not available yet.");
  }, [openDialer, order?.rider?.phone]);

  const handleChatRider = useCallback(() => {
    if (!canonicalOrderId) return;
    router.push({
      pathname: "/orders/partner-chat",
      params: {
        orderId: canonicalOrderId,
        partnerName: order?.rider?.name ?? "Delivery partner",
        restaurantName: isRideOrder ? rideLabel : merchantName,
        ...(order?.rider?.phone ? { partnerPhone: order.rider.phone } : {}),
        ...(order?.rider?.photoUrl ? { partnerPhoto: order.rider.photoUrl } : {}),
      },
    });
  }, [router, canonicalOrderId, order?.rider, isRideOrder, rideLabel, merchantName]);

  const pickTopic = useCallback(
    (topic: HelpSection, prefillDescription?: string) => {
      setSelectedTitle(topic);
      setSubject(
        `${isRideOrder ? "Ride" : "Order"} #${linkedDisplayOrderId} — ${topic.title_text ?? "Help"}`
      );
      if (prefillDescription?.trim()) {
        setDescription(prefillDescription.trim());
      }
      setStep("details");
    },
    [isRideOrder, linkedDisplayOrderId]
  );

  const firstName = useMemo(() => {
    const full = profileQ.data?.full_name?.trim();
    if (!full) return "there";
    return full.split(/\s+/)[0] ?? "there";
  }, [profileQ.data?.full_name]);

  const firstItemName = useMemo(() => order?.items?.[0]?.name ?? null, [order?.items]);

  const handleSwitchSupportOrder = useCallback((nextOrder: RecentOrder) => {
    setChatLinkedOrder(nextOrder);
  }, []);

  useEffect(() => {
    if (chatBootstrapped || resolvedOrderQ.isLoading || orderDetailQ.isLoading) return;
    if (coreOrderId == null) return;
    const forceChat = chatParam;
    const deliveredFood = !isRideOrder && statusForTopics === "delivered";
    if (forceChat || deliveredFood) {
      setStep("chat");
      setChatBootstrapped(true);
    }
  }, [
    chatBootstrapped,
    coreOrderId,
    isRideOrder,
    orderDetailQ.isLoading,
    params.chat,
    resolvedOrderQ.isLoading,
    statusForTopics,
  ]);

  const openSupportTopics = useCallback(() => {
    setShowAllTopics(false);
    setStep("topics");
  }, []);

  const fraudReportMutation = useMutation({
    mutationFn: async (payload: {
      targetType: FraudReportTargetType;
      optionCodes: string[];
      customDetails: string;
    }) => {
      if (coreOrderId == null) throw new Error("Could not link this order. Go back and try again.");
      return customerSupportService.submitFraudReport({
        order_id: coreOrderId,
        target_type: payload.targetType,
        option_codes: payload.optionCodes,
        custom_details: payload.customDetails || undefined,
      });
    },
    onSuccess: (ticket) => {
      setFraudSheetTarget(null);
      queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] });
      router.replace({ pathname: "/support/[ticketId]", params: { ticketId: String(ticket.id) } });
    },
    onError: (err) => {
      Alert.alert("Could not report fraud", err instanceof Error ? err.message : "Please try again.");
    },
  });

  const openFraudSheet = useCallback((targetType: FraudReportTargetType) => {
    if (coreOrderId == null) {
      Alert.alert("Unavailable", "Could not link this order. Go back and try again.");
      return;
    }
    setFraudSheetTarget(targetType);
  }, [coreOrderId]);

  const handleSubmitFraudReport = useCallback(
    (payload: { optionCodes: string[]; customDetails: string }) => {
      if (!fraudSheetTarget) return;
      fraudReportMutation.mutate({
        targetType: fraudSheetTarget,
        optionCodes: payload.optionCodes,
        customDetails: payload.customDetails,
      });
    },
    [fraudReportMutation, fraudSheetTarget]
  );

  const handleBack = useCallback(() => {
    if (step === "details") {
      setStep(step === "details" && chatBootstrapped ? "chat" : "topics");
      setSelectedTitle(null);
      return;
    }
    if (step === "topics") {
      setStep(chatBootstrapped ? "chat" : "hub");
      setShowAllTopics(false);
      setSelectedTitle(null);
      return;
    }
    if (step === "chat") {
      router.back();
      return;
    }
    router.back();
  }, [chatBootstrapped, router, step]);

  useEffect(() => {
    if (Platform.OS !== "android" || step === "hub" || step === "chat") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack, step]);

  const renderTopicsStep = () => (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
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
                    onPress={() => pickTopic(t)}
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
                onPress={() => pickTopic(t)}
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
    </ScrollView>
  );

  const renderDetailsStep = () => (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
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
          Our support team will review your order and assign the right agent. You can chat and share
          photos on the next screen.
        </Text>

        <LegalFooter
          prefix="See our"
          docIds={["grievance-redressal-mechanism", "refund-cancellation-policy"]}
        />
      </View>
    </ScrollView>
  );

  const renderHub = () => (
    <View style={[styles.hubBody, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.hubSections}>
        {!isRideOrder ? (
          <HelpSectionBlock title="UPDATE YOUR DETAILS">
            <HelpActionRow
              icon="call-outline"
              title={hasAlternateContact ? "Alternate contact number" : "Add alternate contact number"}
              subtitle={
                alternateContactLine
                  ? alternateContactLine
                  : "Pick from contacts for this delivery"
              }
              onPress={handlePickAlternateContact}
            />
          </HelpSectionBlock>
        ) : null}

        {!isRideOrder ? (
          <HelpSectionBlock title="MAKE CHANGES TO YOUR ORDER">
            <HelpActionRow icon="call-outline" title="Call restaurant" onPress={handleCallRestaurant} />
          </HelpSectionBlock>
        ) : null}

        {!isRideOrder ? (
          <HelpSectionBlock title="DELIVERY PARTNER INSTRUCTIONS">
            <HelpActionRow icon="call-outline" title="Call delivery partner" onPress={handleCallRider} />
            <DashedDivider />
            <HelpActionRow
              icon="chatbubble-ellipses-outline"
              title="Chat with delivery partner"
              onPress={handleChatRider}
            />
          </HelpSectionBlock>
        ) : hasRider ? (
          <HelpSectionBlock title="RIDE PARTNER">
            <HelpActionRow icon="call-outline" title="Call delivery partner" onPress={handleCallRider} />
          </HelpSectionBlock>
        ) : null}

        <HelpSectionBlock title="REPORT FRAUD">
          {!isRideOrder ? (
            <>
              <HelpActionRow
                icon="shield-outline"
                title="Report restaurant fraud"
                onPress={() => openFraudSheet("merchant")}
              />
              <DashedDivider />
            </>
          ) : null}
          <HelpActionRow
            icon="shield-outline"
            title={isRideOrder ? "Report ride partner fraud" : "Report delivery partner fraud"}
            onPress={() => openFraudSheet("rider")}
          />
        </HelpSectionBlock>

        <HelpSectionBlock title="CONTACT GATIMITRA">
          <HelpActionRow icon="person-circle-outline" title="Go to support" onPress={openSupportTopics} />
        </HelpSectionBlock>
      </View>

      {!isRideOrder ? (
        <View style={styles.cancellationCard}>
          <Text style={styles.cancellationTitle}>Cancellation Policy</Text>
          <Text style={styles.cancellationBody} numberOfLines={3}>
            Help us reduce food wastage by avoiding order cancellations. A 100% cancellation charge will
            apply. This helps us compensate the restaurant partner for food preparation.
          </Text>
        </View>
      ) : null}
    </View>
  );

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

    if (step === "chat") {
      if (coreOrderId == null && !order && !resolvedOrderQ.isLoading && !orderDetailQ.isLoading) {
        return (
          <View style={styles.centered}>
            <Ionicons name="receipt-outline" size={40} color={MUTED} />
            <Text style={styles.errTitle}>Order not found</Text>
            <TouchableOpacity style={styles.errBtn} onPress={() => router.back()}>
              <Text style={styles.errBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <OrderSupportChatFlow
          firstName={firstName}
          merchantName={merchantName}
          itemHint={firstItemName}
          chatTopics={chatTopics}
          linkedCoreOrderId={linkedCoreOrderId}
          linkedDisplayOrderId={String(linkedDisplayOrderId)}
          isRideOrder={isRideOrder}
          ticketWindowOpen={ticketWindowOpen}
          pendingTicketDisplayId={pendingTicketDisplayId}
          onEndChat={() => router.back()}
          onSwitchOrder={handleSwitchSupportOrder}
        />
      );
    }

    if (resolvedOrderQ.isLoading || orderDetailQ.isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Finding your order…</Text>
        </View>
      );
    }

    if (coreOrderId == null && !order) {
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

    if (step === "topics") return renderTopicsStep();
    if (step === "details") return renderDetailsStep();
    return renderHub();
  };

  const showFlowHeader = step !== "hub" && step !== "chat";

  if (step === "chat") {
    return (
      <>
        <AndroidBackHandler />
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        {renderBody()}
        {fraudSheetTarget ? (
          <ReportFraudBottomSheet
            visible={fraudSheetTarget != null}
            targetType={fraudSheetTarget}
            onClose={() => setFraudSheetTarget(null)}
            onSubmit={handleSubmitFraudReport}
            submitting={fraudReportMutation.isPending}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      {step === "hub" ? <AndroidBackHandler /> : null}
      <StatusBar style="dark" backgroundColor={step === "hub" ? HERO_TOP : CARD} />
      <View style={styles.screen}>
        {step === "hub" ? (
          <LinearGradient
            colors={[HERO_TOP, HERO_BOTTOM, PAGE_BG]}
            locations={[0, 0.28, 0.52]}
            style={[styles.hero, { paddingTop: insets.top }]}
          >
            <TouchableOpacity onPress={handleBack} style={styles.heroBack} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={TEXT} />
            </TouchableOpacity>
            <View style={styles.heroRow}>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroHi}>Hi!</Text>
                <Text style={styles.heroSub}>How can we help you?</Text>
              </View>
              <View style={styles.heroImageWrap}>
                <AppAssetImage
                  assetKey={CX.orders.supportHero}
                  style={styles.heroImage}
                  contentFit="contain"
                  accessibilityLabel="Support agent"
                />
              </View>
            </View>
          </LinearGradient>
        ) : (
          <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
            <TouchableOpacity onPress={handleBack} style={styles.headerSide} hitSlop={12}>
              <Ionicons name="arrow-back" size={22} color={TEXT} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{showFlowHeader ? "Get help" : "Help"}</Text>
            <View style={styles.headerSide} />
          </View>
        )}
        {renderBody()}
      </View>

      {canonicalOrderId ? (
        <AlternateContactFlow
          ref={alternateContactFlowRef}
          orderId={canonicalOrderId}
          hasAlternateContact={hasAlternateContact}
          canUpdateAlternateContact={canUpdateAlternateContact}
        />
      ) : null}

      {fraudSheetTarget ? (
        <ReportFraudBottomSheet
          visible={fraudSheetTarget != null}
          targetType={fraudSheetTarget}
          onClose={() => setFraudSheetTarget(null)}
          onSubmit={handleSubmitFraudReport}
          submitting={fraudReportMutation.isPending}
        />
      ) : null}
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
  hubBody: {
    flex: 1,
  },
  hubSections: {
    flex: 1,
    justifyContent: "space-between",
    marginTop: 2,
  },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  heroBack: {
    width: 36,
    height: 28,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    minHeight: 72,
    marginTop: -2,
  },
  heroTextCol: {
    flex: 1,
    paddingRight: 4,
    paddingBottom: 4,
  },
  heroHi: {
    fontSize: 28,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "500",
    color: "#696969",
    lineHeight: 18,
  },
  heroImageWrap: {
    width: 96,
    height: 88,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  heroImage: {
    width: 96,
    height: 88,
  },
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

  sectionBlock: {
    paddingHorizontal: 16,
  },
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ECECEC",
  },
  sectionHeadBar: {
    backgroundColor: "#F7F7F7",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ECECEC",
  },
  sectionHeadText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#696969",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    gap: 10,
    backgroundColor: CARD,
  },
  rowIconWrap: {
    width: 22,
    alignItems: "center",
  },
  rowTextCol: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT,
    lineHeight: 18,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
  },
  dashedDividerWrap: {
    paddingHorizontal: 14,
    backgroundColor: CARD,
    overflow: "hidden",
  },
  dashedDivider: {
    color: "#E5E5E5",
    fontSize: 9,
    letterSpacing: 1.5,
  },

  cancellationCard: {
    marginTop: 6,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#FAF6F0",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EDE4D6",
  },
  cancellationTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 4,
  },
  cancellationBody: {
    fontSize: 11,
    lineHeight: 15,
    color: "#5C5C5C",
  },

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
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  successCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 18,
    alignItems: "center",
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  successBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: "center",
  },
  successBtn: {
    marginTop: 20,
    alignSelf: "stretch",
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  successBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
