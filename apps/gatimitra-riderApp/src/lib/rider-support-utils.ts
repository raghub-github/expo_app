import { Ionicons } from "@expo/vector-icons";
import type { RiderHelpGroup } from "@/src/services/riderSupport.service";

/** True only for order-related groups — never treat non_order codes as order (e.g. gatimitra_non_order_*). */
export function isOrderHelpGroup(
  groupCode: string,
  ticketCategory?: string | null,
): boolean {
  const cat = (ticketCategory ?? "").trim().toLowerCase();
  if (cat === "order_related") return true;
  if (cat === "non_order" || cat === "other") return false;

  const code = groupCode.toUpperCase();
  if (code.includes("NON_ORDER") || code.includes("NON-ORDER")) return false;
  if (code === "GRP_RIDER_ORDER") return true;
  return code.includes("RIDER_ORDER") && !code.includes("NON");
}

export function iconForHelpGroup(group: RiderHelpGroup): keyof typeof Ionicons.glyphMap {
  const code = group.group_code.toUpperCase();
  const cat = (group.ticket_category ?? "").toUpperCase();
  if (isOrderHelpGroup(group.group_code, group.ticket_category)) return "cube-outline";
  if (code.includes("EARN") || code.includes("PAY") || cat === "EARNINGS") return "wallet-outline";
  if (code.includes("FAQ")) return "help-circle-outline";
  if (code.includes("DOC") || code.includes("VERIF")) return "document-text-outline";
  return "chatbubble-ellipses-outline";
}

const GRADIENTS: readonly (readonly [string, string])[] = [
  ["#0D9488", "#14B8A6"],
  ["#2563EB", "#3B82F6"],
  ["#7C3AED", "#A78BFA"],
  ["#EA580C", "#FB923C"],
  ["#DB2777", "#F472B6"],
  ["#475569", "#64748B"],
];

/** Non-order help group (e.g. Gmitra-Non-Order Related) — shown flat on pre-login hub. */
export function isNonOrderHelpGroup(group: {
  group_code: string;
  ticket_category?: string | null;
  group_name?: string | null;
}): boolean {
  if (isOrderHelpGroup(group.group_code, group.ticket_category)) return false;
  const cat = (group.ticket_category ?? "").trim().toLowerCase();
  if (cat === "non_order" || cat === "other") return true;
  const code = group.group_code.toUpperCase();
  if (code.includes("NON_ORDER") || code.includes("NON-ORDER")) return true;
  if (code.includes("GMITRA") && code.includes("NON")) return true;
  const name = (group.group_name ?? "").toLowerCase();
  return (
    name.includes("non-order") ||
    name.includes("non order") ||
    (name.includes("gmitra") && name.includes("non"))
  );
}

/** Order / earnings groups hidden on pre-login raise-ticket hub. */
export function isPreLoginExcludedHelpGroup(group: RiderHelpGroup): boolean {
  if (isOrderHelpGroup(group.group_code, group.ticket_category)) return true;
  const code = group.group_code.toUpperCase();
  const cat = (group.ticket_category ?? "").toUpperCase();
  if (code.includes("EARN") || code.includes("PAY") || cat === "EARNINGS") return true;
  const name = group.group_name.toLowerCase();
  if (name.includes("order issue") || name.includes("order related")) return true;
  if (name.includes("earning")) return true;
  return false;
}

export function findPreLoginHelpGroup(groups: RiderHelpGroup[]): RiderHelpGroup | null {
  const match = groups.find(
    (g) =>
      g.group_code &&
      g.group_code !== "__UNGROUPED__" &&
      isNonOrderHelpGroup(g) &&
      !isPreLoginExcludedHelpGroup(g),
  );
  if (match) return match;
  return (
    groups.find(
      (g) =>
        g.group_code &&
        g.group_code !== "__UNGROUPED__" &&
        !isPreLoginExcludedHelpGroup(g) &&
        isNonOrderHelpGroup(g),
    ) ?? null
  );
}

/** Gmitra-Non-Order Related → Account Restricted State Affecting Duty Logs. */
export function isAccountRestrictedDutyLogTopic(section: {
  title_text?: string | null;
  title_code?: string | null;
}): boolean {
  const code = (section.title_code ?? "").toUpperCase();
  if (code === "RESTRICTED_ACCOUNT_DUTY_LOG_SYNC_ISSUE") return true;
  if (code.includes("RESTRICTED_ACCOUNT") && code.includes("DUTY_LOG")) return true;

  const blob = `${section.title_text ?? ""} ${section.title_code ?? ""}`.toLowerCase();
  if (blob.includes("account_restricted") && blob.includes("duty")) return true;
  if (blob.includes("restricted_account") && blob.includes("duty")) return true;
  return blob.includes("account restricted") && blob.includes("duty");
}

/** Hidden on pre-login flat list (penalty needs order link). */
export function isPenaltyIssueTopic(section: {
  title_text?: string | null;
  title_code?: string | null;
}): boolean {
  const blob = `${section.title_text ?? ""} ${section.title_code ?? ""}`.toLowerCase();
  return blob.includes("penalty");
}

/** Hidden on pre-login flat list. */
export function isPaymentRelatedTopic(section: {
  title_text?: string | null;
  title_code?: string | null;
  subtext?: string | null;
  intake_ticket_type?: string | null;
}): boolean {
  const blob = [
    section.title_text,
    section.title_code,
    section.subtext,
    section.intake_ticket_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    blob.includes("payment") ||
    blob.includes("payout") ||
    blob.includes("pay ") ||
    blob.includes("refund") ||
    blob.includes("settlement")
  );
}

export function isPreLoginVisibleTopic(
  section: {
    group_code?: string | null;
    group_name?: string | null;
    title_text?: string | null;
    title_code?: string | null;
    subtext?: string | null;
    intake_ticket_type?: string | null;
    has_children?: boolean;
  },
  groups: RiderHelpGroup[],
): boolean {
  if (section.has_children) return false;
  if (isPenaltyIssueTopic(section) || isPaymentRelatedTopic(section)) return false;

  const nonOrderGroups = groups.filter(
    (g) => g.group_code && isNonOrderHelpGroup(g) && !isPreLoginExcludedHelpGroup(g),
  );
  const nonOrderCodes = new Set(nonOrderGroups.map((g) => g.group_code));

  if (section.group_code && nonOrderCodes.has(section.group_code)) return true;

  const gName = (section.group_name ?? "").toLowerCase();
  return (
    gName.includes("non-order") ||
    gName.includes("non order") ||
    (gName.includes("gmitra") && gName.includes("non"))
  );
}

export function gradientForHelpGroup(group: RiderHelpGroup, index: number): readonly [string, string] {
  if (isOrderHelpGroup(group.group_code, group.ticket_category)) return GRADIENTS[0];
  const code = group.group_code.toUpperCase();
  if (code.includes("EARN") || code.includes("PAY")) return GRADIENTS[1];
  if (code.includes("FAQ")) return GRADIENTS[5];
  return GRADIENTS[index % GRADIENTS.length];
}
