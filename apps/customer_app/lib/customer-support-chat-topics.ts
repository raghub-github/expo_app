import {
  CUSTOMER_POST_DELIVERY_CHAT_FOLDER_TITLE,
  CUSTOMER_POST_DELIVERY_CHAT_GROUP_CODE,
  CUSTOMER_POST_DELIVERY_CHAT_TITLE_CODE,
} from "@/lib/order-support-chat";
import {
  customerSupportService,
  type HelpSection,
} from "@/services/customerSupport.service";

export function customerSupportChatTopicsQueryKey(
  orderStatus?: string,
  serviceType = "food"
): readonly [string, string, string, string] {
  return [
    "customer-support-chat-topics",
    orderStatus ?? "delivered",
    serviceType,
    CUSTOMER_POST_DELIVERY_CHAT_TITLE_CODE,
  ];
}

function normalizeIssueLabel(label: string): string {
  return label.trim().replace(/\.$/, "").toLowerCase();
}

function mergeHelpSections(...lists: HelpSection[][]): HelpSection[] {
  const map = new Map<number, HelpSection>();
  for (const list of lists) {
    for (const section of list) {
      map.set(section.ticket_title_id, section);
    }
  }
  return [...map.values()];
}

function findCatalogTitleForLabel(catalog: HelpSection[], label: string): HelpSection | null {
  const target = normalizeIssueLabel(label);
  return (
    catalog.find(
      (section) =>
        normalizeIssueLabel(section.title_text ?? "") === target &&
        Boolean(section.title_text?.trim())
    ) ?? null
  );
}

function expandQuickOptions(parent: HelpSection, catalog: HelpSection[]): HelpSection[] {
  const labels = (parent.default_quick_options ?? [])
    .map((label) => label.trim())
    .filter(Boolean);
  if (labels.length === 0) return [];
  return labels.map((label) => {
    const matched = findCatalogTitleForLabel(catalog, label);
    if (matched) {
      return {
        ...matched,
        title_text: label,
      };
    }
    return {
      ...parent,
      title_text: label,
    };
  });
}

function isPostDeliveryChatTitle(section: HelpSection): boolean {
  const code = (section.title_code ?? "").trim().toUpperCase();
  if (code === CUSTOMER_POST_DELIVERY_CHAT_TITLE_CODE) return true;
  const text = (section.title_text ?? "").trim().toLowerCase();
  return text === CUSTOMER_POST_DELIVERY_CHAT_FOLDER_TITLE.toLowerCase();
}

function resolveChatTopicsFromSections(sections: HelpSection[]): HelpSection[] {
  const parent = sections.find(isPostDeliveryChatTitle);
  if (parent) {
    const fromQuick = expandQuickOptions(parent, sections);
    if (fromQuick.length > 0) return fromQuick;
  }

  const leafTitles = sections
    .filter((section) => (section.title_text ?? "").trim().length > 0)
    .filter((section) => !isPostDeliveryChatTitle(section));
  if (leafTitles.length > 0) return leafTitles;

  return [];
}

async function loadPostDeliveryCatalog(
  orderStatus: string,
  serviceType: string
): Promise<HelpSection[]> {
  const [concerns, byTitleCode, byGroup, byFolder] = await Promise.all([
    customerSupportService.getHelpSections(orderStatus, serviceType),
    customerSupportService.getHelpSections({
      orderStatus,
      serviceType,
      titleCode: CUSTOMER_POST_DELIVERY_CHAT_TITLE_CODE,
    }),
    customerSupportService.getHelpSections({
      orderStatus,
      serviceType,
      groupCode: CUSTOMER_POST_DELIVERY_CHAT_GROUP_CODE,
      intakeOnly: true,
    }),
    customerSupportService.getHelpSections({
      orderStatus,
      serviceType,
      intakeOnly: true,
      folderTitle: CUSTOMER_POST_DELIVERY_CHAT_FOLDER_TITLE,
    }),
  ]);

  return mergeHelpSections(concerns, byTitleCode, byGroup, byFolder);
}

/**
 * Same catalog source as raise-ticket "What went wrong?" — then expand
 * `default_quick_options` on the post-delivery title into chat buttons.
 */
export async function fetchCustomerSupportChatTopics(
  orderStatus?: string,
  serviceType = "food"
) {
  const status = orderStatus ?? "delivered";
  const catalog = await loadPostDeliveryCatalog(status, serviceType);
  const fromCatalog = resolveChatTopicsFromSections(catalog);
  if (fromCatalog.length > 0) return fromCatalog;

  return catalog.filter(
    (section) =>
      (section.title_text ?? "").trim().length > 0 && !isPostDeliveryChatTitle(section)
  );
}
