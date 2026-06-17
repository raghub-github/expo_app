import { router } from "expo-router";
import type { RiderHelpSection, RiderRecentOrder } from "@/src/services/riderSupport.service";

/** Dashboard catalog — Gmitra-Non-Order Related → Account Restricted State Affecting Duty Logs. */
export const ACCOUNT_RESTRICTED_DUTY_LOG_SUPPORT = {
  groupCode: "gatimnitra_non_order_foods",
  titleCode: "RESTRICTED_ACCOUNT_DUTY_LOG_SYNC_ISSUE",
  issueTitle: "Account Restricted State Affecting Duty Logs",
} as const;

/** Red Account Restricted banner → ticket compose (skip category + topic pickers). */
export function openAccountRestrictedSupportTicket(): void {
  router.push({
    pathname: "/raise-ticket-chat",
    params: {
      issue_title: ACCOUNT_RESTRICTED_DUTY_LOG_SUPPORT.issueTitle,
      section_code: ACCOUNT_RESTRICTED_DUTY_LOG_SUPPORT.groupCode,
      title_code: ACCOUNT_RESTRICTED_DUTY_LOG_SUPPORT.titleCode,
    },
  });
}

export function openRaiseTicketChat(
  section: RiderHelpSection,
  groupCode: string | null,
  order: RiderRecentOrder | null = null,
  options?: { prelogin?: boolean },
) {
  router.push({
    pathname: "/raise-ticket-chat",
    params: {
      ticket_title_id: String(section.ticket_title_id),
      issue_title: section.title_text ?? section.title_code ?? "Support",
      ...(section.section_id
        ? { section_code: section.section_id }
        : groupCode
          ? { section_code: groupCode }
          : {}),
      ...(section.title_code ? { title_code: section.title_code } : {}),
      ...(order?.id ? { order_id: String(order.id) } : {}),
      ...(order?.formatted_order_id || order?.order_id
        ? { formatted_order_id: order.formatted_order_id || order.order_id || "" }
        : {}),
      ...(options?.prelogin ? { prelogin: "1" } : {}),
    },
  });
}
