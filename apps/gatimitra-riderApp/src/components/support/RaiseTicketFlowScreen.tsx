import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SupportScreenHeader } from "@/src/components/support/SupportScreenHeader";
import {
  SupportIssueOptionList,
  type SupportIssueOption,
} from "@/src/components/support/SupportIssueOptionList";
import { SupportOrderPickerList } from "@/src/components/support/SupportOrderPickerList";
import { SupportEmptyOrders } from "@/src/components/support/SupportEmptyOrders";
import { isOrderHelpGroup, isPenaltyIssueTopic } from "@/src/lib/rider-support-utils";
import { openRaiseTicketChat } from "@/src/lib/rider-support-navigation";
import {
  riderSupportService,
  type RiderHelpSection,
  type RiderRecentOrder,
} from "@/src/services/riderSupport.service";

type FlowStep = "pick_order" | "topics";
type OrderScope = "active" | "completed" | "all";

function paramString(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function orderStatusForTopics(order: RiderRecentOrder | null): string | undefined {
  if (!order) return undefined;
  const s = (order.current_status || order.status || "").trim();
  return s || undefined;
}

function openSupportChat(section: RiderHelpSection, order: RiderRecentOrder | null, groupCode: string | null) {
  openRaiseTicketChat(section, groupCode, order);
}

/**
 * Group → topics → merchant-style support chat (compose → ticket created on send).
 */
export function RaiseTicketFlowScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    group_code?: string;
    group_name?: string;
    ticket_category?: string;
  }>();

  const groupCode = useMemo(() => paramString(params.group_code), [params.group_code]);
  const groupName = useMemo(
    () => paramString(params.group_name) ?? t("profile.raiseTicket", "Raise Ticket"),
    [params.group_name, t],
  );
  const ticketCategory = useMemo(
    () => paramString(params.ticket_category),
    [params.ticket_category],
  );

  const needsOrderFirst = useMemo(
    () => groupCode != null && isOrderHelpGroup(groupCode, ticketCategory),
    [groupCode, ticketCategory],
  );

  const [step, setStep] = useState<FlowStep>(() =>
    needsOrderFirst ? "pick_order" : "topics",
  );
  const [pickedOrder, setPickedOrder] = useState<RiderRecentOrder | null>(null);
  const [pendingTopic, setPendingTopic] = useState<RiderHelpSection | null>(null);
  const [orderScope, setOrderScope] = useState<OrderScope>("active");

  const isPenaltyOrderStep = pendingTopic != null && isPenaltyIssueTopic(pendingTopic);

  const topicsQ = useQuery({
    queryKey: [
      "rider-help-sections",
      groupCode,
      "all-in-group",
      pickedOrder?.id,
      orderStatusForTopics(pickedOrder),
    ],
    queryFn: () =>
      riderSupportService.getHelpSections({
        group_code: groupCode ?? undefined,
        order_status: orderStatusForTopics(pickedOrder),
        intake_only: true,
        all_in_group: true,
      }),
    enabled: step === "topics" && groupCode != null,
    staleTime: 60_000,
  });

  const ordersQ = useQuery({
    queryKey: ["rider-support-orders", orderScope],
    queryFn: () =>
      riderSupportService.getRecentOrders({
        scope: orderScope,
        limit: orderScope === "all" ? 50 : 30,
      }),
    enabled: step === "pick_order",
  });

  const onSelectOrder = (order: RiderRecentOrder) => {
    setPickedOrder(order);
    if (pendingTopic) {
      openSupportChat(pendingTopic, order, groupCode);
      return;
    }
    setStep("topics");
  };

  const onSelectTopic = (section: RiderHelpSection) => {
    if (section.has_children) return;

    if (isPenaltyIssueTopic(section)) {
      setPendingTopic(section);
      setOrderScope("all");
      setStep("pick_order");
      return;
    }

    if (section.requires_order && !pickedOrder) {
      setOrderScope(
        section.intake_ticket_type === "order_related" ? "completed" : "active",
      );
      setPendingTopic(section);
      setStep("pick_order");
      return;
    }

    openSupportChat(section, pickedOrder, groupCode);
  };

  const goBackFromOrderPicker = () => {
    setPendingTopic(null);
    setPickedOrder(null);
    if (needsOrderFirst) {
      router.back();
      return;
    }
    setStep("topics");
  };

  const screenTitle = useMemo(() => {
    if (step === "pick_order") {
      if (isPenaltyOrderStep) {
        return pendingTopic?.title_text ?? t("profile.supportFlow.penaltyIssue", "Penalty issue");
      }
      return orderScope === "completed"
        ? t("profile.supportFlow.selectOrderEarnings", "Select order")
        : t("profile.supportFlow.selectActiveOrderShort", "Select order");
    }
    return groupName;
  }, [step, groupName, orderScope, isPenaltyOrderStep, pendingTopic, t]);

  const headerSubtitle = useMemo(() => {
    if (step === "topics") {
      return t("profile.supportFlow.pickTopic", "Select your issue type");
    }
    if (step === "pick_order" && isPenaltyOrderStep) {
      return t(
        "profile.supportFlow.selectPenaltyOrder",
        "Which order is this penalty issue for? Select the order below.",
      );
    }
    if (step === "pick_order" && orderScope === "completed") {
      return t(
        "profile.supportFlow.selectOrderForEarnings",
        "Select the order related to this issue",
      );
    }
    if (step === "pick_order") {
      return t(
        "profile.supportFlow.selectActiveOrderHint",
        "Choose the order you want to report an issue on",
      );
    }
    return undefined;
  }, [step, orderScope, isPenaltyOrderStep, t]);

  const orderPickerPrompt = useMemo(() => {
    if (isPenaltyOrderStep) {
      return t("profile.supportFlow.penaltyOrderList", "Your orders");
    }
    return headerSubtitle ?? "";
  }, [isPenaltyOrderStep, headerSubtitle, t]);

  const renderTopics = () => {
    const sections = topicsQ.data ?? [];
    const topicItems: SupportIssueOption[] = sections.map((s) => ({
      key: String(s.ticket_title_id),
      label: s.title_text ?? s.title_code ?? "Issue",
      subtitle: s.subtext ?? undefined,
      icon: "document-text-outline",
      gradient: ["#0D9488", "#14B8A6"] as const,
    }));

    if (!topicsQ.isLoading && sections.length === 0) {
      return (
        <SupportIssueOptionList
          prompt={t(
            "profile.supportFlow.noTopicsCatalog",
            "No active issue types in this category. Turn on Visible app in dashboard Help topics.",
          )}
          items={[]}
          onSelect={() => {}}
        />
      );
    }

    return (
      <SupportIssueOptionList
        prompt={headerSubtitle}
        items={topicItems}
        loading={topicsQ.isLoading}
        onSelect={(key) => {
          const hit = sections.find((s) => String(s.ticket_title_id) === key);
          if (hit) onSelectTopic(hit);
        }}
      />
    );
  };

  const renderBody = () => {
    if (!groupCode) {
      return (
        <SupportIssueOptionList
          prompt={t("profile.supportFlow.missingGroup", "Open this screen from Raise a Ticket.")}
          items={[]}
          onSelect={() => router.back()}
        />
      );
    }

    if (step === "pick_order") {
      const orders = ordersQ.data?.orders ?? [];
      if (ordersQ.isLoading) {
        return (
          <SupportOrderPickerList
            prompt={orderPickerPrompt}
            orders={[]}
            loading
            onSelect={onSelectOrder}
          />
        );
      }
      if (orders.length === 0) {
        const emptyVariant: "active" | "completed" | "all" =
          orderScope === "all" ? "all" : orderScope === "completed" ? "completed" : "active";
        return <SupportEmptyOrders variant={emptyVariant} />;
      }
      return (
        <SupportOrderPickerList
          prompt={orderPickerPrompt}
          orders={orders}
          onSelect={onSelectOrder}
        />
      );
    }

    return renderTopics();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <SupportScreenHeader
        title={screenTitle}
        subtitle={headerSubtitle}
        variant="premium"
        onBack={step === "pick_order" ? goBackFromOrderPicker : undefined}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
});
