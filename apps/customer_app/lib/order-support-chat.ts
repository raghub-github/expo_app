import type { HelpSection, RecentOrder } from "@/services/customerSupport.service";

/** Post-delivery chat title row (admin: ticket_titles.title_code). */
export const CUSTOMER_POST_DELIVERY_CHAT_TITLE_CODE = "CUSTOMER_POST_DELIVERY";
/** Ticket group for post-delivery support chat (admin: ticket_groups.group_code). */
export const CUSTOMER_POST_DELIVERY_CHAT_GROUP_CODE = "GRP_FOOD_ORDER_RELATED_CUSTOMER_CUSTOMER";
export const CUSTOMER_POST_DELIVERY_CHAT_GROUP_NAME = "Customer - Post Pickup";
/** Parent title text in ticket_titles tree — matches admin folder label. */
export const CUSTOMER_POST_DELIVERY_CHAT_FOLDER_TITLE = "Customer - Post Delivery";

export const CHAT_MORE_OPTION_LABEL = "More..";
export const ANOTHER_ORDER_HELP_LABEL = "I need help with another order";

export const MORE_MENU_OPTIONS = [
  ANOTHER_ORDER_HELP_LABEL,
  "← Go back",
] as const;

export const ORDER_PICKER_FOOTER_OPTIONS = [
  "Other previous orders",
  "My order is not listed here",
  "← Go back",
] as const;

function normalizeChatOptionLabel(label: string): string {
  return label.trim().replace(/\.$/, "").toLowerCase();
}

/** True for "I need help with another order" variants — shown only after More.. */
export function isAnotherOrderHelpLabel(label: string): boolean {
  return normalizeChatOptionLabel(label) === normalizeChatOptionLabel(ANOTHER_ORDER_HELP_LABEL);
}

/** Options reserved for the More.. sub-menu, never shown on the first list. */
export function isMoreMenuOnlyOptionLabel(label: string): boolean {
  if (isAnotherOrderHelpLabel(label)) return true;
  return normalizeChatOptionLabel(label) === normalizeChatOptionLabel(CHAT_MORE_OPTION_LABEL);
}

export type SupportChatOption = {
  id: string;
  label: string;
  section?: HelpSection | null;
};

export type SupportChatMenuLevel = "main" | "more" | "orders" | "email";

export type SupportChatMessage = {
  id: string;
  role: "bot" | "user";
  text: string;
  sentAt: Date;
  options?: SupportChatOption[];
  orders?: RecentOrder[];
  menuLevel?: SupportChatMenuLevel;
};

export function formatChatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function formatOrderPickerWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    return `${day} at ${time}`;
  } catch {
    return "";
  }
}

export function orderStatusLabel(status: string | null | undefined): { text: string; tone: "success" | "danger" | "muted" } {
  const raw = (status ?? "").trim().toLowerCase();
  if (raw.includes("deliver")) return { text: "Your order was delivered", tone: "success" };
  if (raw.includes("cancel")) return { text: "Order was cancelled", tone: "muted" };
  if (raw.includes("fail") || raw.includes("payment")) return { text: "Payment failed", tone: "danger" };
  return { text: "Order update", tone: "muted" };
}

export function orderPickerTitle(order: RecentOrder): string {
  const name = order.merchant_store_name?.trim() || "Restaurant";
  return `Order from ${name}`;
}

export function orderPickerSubtitle(order: RecentOrder, itemHint?: string | null): string {
  const when = formatOrderPickerWhen(order.placed_at ?? order.delivered_at);
  const item = itemHint?.trim();
  if (when && item) return `${when} | ${item}`;
  if (when && order.grand_total != null) {
    return `${when} | ₹${Math.round(order.grand_total)}`;
  }
  if (when) return when;
  return item ?? "";
}

export function buildIssueOptionsFromSections(sections: HelpSection[]): SupportChatOption[] {
  const issueOptions = sections
    .filter((section) => (section.title_text ?? "").trim().length > 0)
    .filter((section) => !isMoreMenuOnlyOptionLabel(section.title_text ?? ""))
    .map((section, index) => {
      const label = section.title_text!.trim();
      return {
        // ticket_title_id alone is not unique when expanded from default_quick_options.
        id: `issue-${section.ticket_title_id}-${index}-${label.slice(0, 24).replace(/\s+/g, "-").toLowerCase()}`,
        label,
        section,
      };
    });

  return [
    ...issueOptions,
    {
      id: "issue-more",
      label: CHAT_MORE_OPTION_LABEL,
      section: null,
    },
  ];
}

export function buildMainIssueOptionsMessage(sections: HelpSection[]): SupportChatMessage {
  return {
    id: `bot-main-${Date.now()}`,
    role: "bot",
    text: "How can we help you with your order?",
    sentAt: new Date(),
    menuLevel: "main",
    options: buildIssueOptionsFromSections(sections),
  };
}

export function buildInitialChatMessages(input: {
  firstName: string;
  merchantName: string;
  chatTopics: HelpSection[];
}): SupportChatMessage[] {
  const now = new Date();
  const greeting = `Hi ${input.firstName}! I'm here to help you with your order from ${input.merchantName}.`;
  const prompt: SupportChatMessage = {
    id: "prompt",
    role: "bot",
    text: "How can we help you with your order?",
    sentAt: new Date(now.getTime() + 400),
    menuLevel: "main",
  };
  if (input.chatTopics.length > 0) {
    prompt.options = buildIssueOptionsFromSections(input.chatTopics);
  }
  return [
    {
      id: "greeting",
      role: "bot",
      text: greeting,
      sentAt: now,
    },
    prompt,
  ];
}

/** Fresh bot turn when user taps "Chat with us" after an email / time-passed reply. */
export function buildChatResumeMessages(input: {
  firstName: string;
  merchantName: string;
  chatTopics: HelpSection[];
}): SupportChatMessage[] {
  const now = Date.now();
  const greeting: SupportChatMessage = {
    id: `bot-resume-greeting-${now}`,
    role: "bot",
    text: `Hi ${input.firstName}! I'm here to help you with your order from ${input.merchantName}.`,
    sentAt: new Date(now),
  };
  const prompt = buildMainIssueOptionsMessage(input.chatTopics);
  return [
    greeting,
    {
      ...prompt,
      id: `bot-resume-main-${now + 1}`,
      sentAt: new Date(now + 400),
    },
  ];
}

export function buildMoreMenuMessage(): SupportChatMessage {
  return {
    id: `bot-more-${Date.now()}`,
    role: "bot",
    text: "How can we help you with your order?",
    sentAt: new Date(),
    menuLevel: "more",
    options: MORE_MENU_OPTIONS.map((label, index) => ({
      id: `more-${index}`,
      label,
    })),
  };
}

export function buildOrderPickerMessage(orders: RecentOrder[]): SupportChatMessage {
  return {
    id: `bot-orders-${Date.now()}`,
    role: "bot",
    text: "Please select the order for which you seek support.",
    sentAt: new Date(),
    menuLevel: "orders",
    orders,
    options: ORDER_PICKER_FOOTER_OPTIONS.map((label, index) => ({
      id: `picker-footer-${index}`,
      label,
    })),
  };
}

export function buildEmailFallbackMessage(): SupportChatMessage {
  return {
    id: `bot-email-${Date.now()}`,
    role: "bot",
    text:
      "For further queries, please write to us at order@gatimitra.com. Please mention your Order ID and issue description in your email. Our team will look into your concern and revert within 24 working hours.",
    sentAt: new Date(),
    menuLevel: "email",
  };
}

export function buildTicketSubmittedMessage(ticketDisplayId: string): SupportChatMessage {
  const ref = ticketDisplayId.trim();
  const ticketLabel = ref.startsWith("#") ? ref : `#${ref}`;
  return {
    id: `bot-ticket-submitted-${Date.now()}`,
    role: "bot",
    text: `Your query has been recorded. Your ticket ID is ${ticketLabel}. GatiMitra team will look into your concern and revert within 24 working hours.`,
    sentAt: new Date(),
  };
}

export function buildTicketWindowExpiredMessage(): SupportChatMessage {
  return {
    id: `bot-window-expired-${Date.now()}`,
    role: "bot",
    text:
      "I am sorry to hear about your experience. Since some time has passed from time of your order delivery, we will need to connect with the delivery and restaurant partners for resolution. Please email us at order@gatimitra.com with fresh videos and details, an executive will check and get back to you within 24 working hours.",
    sentAt: new Date(),
    menuLevel: "email",
  };
}

/** Support chat copy — email shown with underline in the UI. */
export const SUPPORT_CONTACT_EMAIL = "order@gatimitra.com";

export type SupportChatMessageRow = {
  id: number;
  client_message_id: string | null;
  role: "bot" | "user";
  message_text: string;
  menu_level: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export function supportChatMessageToPayload(message: SupportChatMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (message.options?.length) {
    payload.options = message.options.map((option) => ({
      id: option.id,
      label: option.label,
      ticket_title_id: option.section?.ticket_title_id ?? null,
      section_id: option.section?.section_id ?? null,
    }));
  }
  if (message.orders?.length) payload.orders = message.orders;
  return payload;
}

export function supportChatMessageFromRow(row: SupportChatMessageRow): SupportChatMessage {
  const rawOptions = Array.isArray(row.payload?.options)
    ? (row.payload.options as Array<Record<string, unknown>>)
    : [];
  const options: SupportChatOption[] | undefined = rawOptions.length
    ? rawOptions.map((option) => {
        const label = String(option.label ?? "");
        const ticketTitleId =
          option.ticket_title_id != null ? Number(option.ticket_title_id) : null;
        return {
          id: String(option.id ?? label),
          label,
          section:
            ticketTitleId != null && Number.isFinite(ticketTitleId)
              ? {
                  ticket_title_id: ticketTitleId,
                  title_code: null,
                  title_text: label,
                  section_id:
                    option.section_id != null ? String(option.section_id) : null,
                  display_order: null,
                  group_id: null,
                  group_code: null,
                  group_name: null,
                  applicable_order_statuses: null,
                  default_quick_options: null,
                }
              : null,
        };
      })
    : undefined;

  const orders = Array.isArray(row.payload?.orders)
    ? (row.payload.orders as RecentOrder[])
    : undefined;

  return {
    id: row.client_message_id ?? `db-${row.id}`,
    role: row.role,
    text: row.message_text,
    sentAt: new Date(row.created_at),
    menuLevel: (row.menu_level as SupportChatMenuLevel | null) ?? undefined,
    options,
    orders,
  };
}
