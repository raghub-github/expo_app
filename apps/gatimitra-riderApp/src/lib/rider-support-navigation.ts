import { router } from "expo-router";
import type { RiderHelpSection, RiderRecentOrder } from "@/src/services/riderSupport.service";

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
