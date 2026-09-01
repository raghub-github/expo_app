/**
 * Default allowedActions for each access-point group.
 * Used when a DB row is active but `allowed_actions` is empty (legacy saves).
 * Must stay aligned with `DASHBOARD_DEFINITIONS` in DashboardAccessSelector.
 */

export const ACCESS_POINT_DEFAULT_ACTIONS: Record<string, string[]> = {
  RIDER_VIEW: ["VIEW"],
  RIDER_ACTIONS_FOOD: ["UPDATE", "CANCEL", "BLOCK", "UNBLOCK"],
  RIDER_ACTIONS_PARCEL: ["UPDATE", "CANCEL", "BLOCK", "UNBLOCK"],
  RIDER_ACTIONS_PERSON_RIDE: ["UPDATE", "CANCEL", "BLOCK", "UNBLOCK"],
  RIDER_WALLET_CREDITS: ["CREATE", "VIEW", "APPROVE", "REJECT"],

  MERCHANT_VIEW: ["VIEW"],
  MERCHANT_ONBOARDING: ["UPDATE", "APPROVE", "REJECT"],
  MERCHANT_OPERATIONS: ["UPDATE"],
  MERCHANT_STORE_MANAGEMENT: ["CREATE", "UPDATE", "DELETE"],
  MERCHANT_WALLET: ["UPDATE"],
  MERCHANT_ADMIN_MERCHANT_ACCESS: ["ADMIN_MERCHANT_PANEL"],
  MERCHANT_WALLET_REQUESTS: ["CREATE", "VIEW", "APPROVE", "REJECT"],
  MERCHANT_MENU_MANAGEMENT: ["CREATE", "UPDATE", "DELETE"],
  MERCHANT_OFFER_MANAGEMENT: ["CREATE", "UPDATE", "DELETE"],
  MERCHANT_BANK_MANAGEMENT: ["UPDATE"],
  MERCHANT_TIMING_MANAGEMENT: ["UPDATE"],
  MERCHANT_STATUS_MANAGEMENT: ["UPDATE"],
  MERCHANT_ITEM_APPROVAL: ["APPROVE", "REJECT"],

  CUSTOMER_VIEW: ["VIEW"],
  CUSTOMER_ACTIONS_FOOD: ["BLOCK", "UNBLOCK", "UPDATE"],
  CUSTOMER_ACTIONS_PARCEL: ["BLOCK", "UNBLOCK", "UPDATE"],
  CUSTOMER_ACTIONS_PERSON_RIDE: ["BLOCK", "UNBLOCK", "UPDATE"],

  ORDER_VIEW: ["VIEW"],
  ORDER_ASSIGN: ["ASSIGN", "UPDATE"],
  ORDER_CANCEL: ["CANCEL", "UPDATE"],
  ORDER_REFUND: ["REFUND", "UPDATE"],

  TICKET_VIEW_FOOD: ["VIEW"],
  TICKET_VIEW_PARCEL: ["VIEW"],
  TICKET_VIEW_PERSON_RIDE: ["VIEW"],
  TICKET_ACTIONS_FOOD: ["ASSIGN", "UPDATE", "APPROVE", "REJECT"],
  TICKET_ACTIONS_PARCEL: ["ASSIGN", "UPDATE", "APPROVE", "REJECT"],
  TICKET_ACTIONS_PERSON_RIDE: ["ASSIGN", "UPDATE", "APPROVE", "REJECT"],
  TICKET_AGENT_STATUS_TOGGLE: ["UPDATE"],
  TICKET_QUEUE_SUPERVISOR: ["VIEW"],
  TICKET_QUEUE_MANAGER: ["VIEW"],

  OFFER_RIDER: ["VIEW", "CREATE", "UPDATE", "DELETE"],
  OFFER_CUSTOMER: ["VIEW", "CREATE", "UPDATE", "DELETE"],
  OFFER_MERCHANT: ["VIEW", "CREATE", "UPDATE", "DELETE"],
};

export const TICKET_DASHBOARD_FAMILY = [
  "TICKET",
  "TICKET_FOOD",
  "TICKET_PARCEL",
  "TICKET_PERSON_RIDE",
  "TICKET_GENERAL",
  "TICKET_CUSTOMER_FOOD",
  "TICKET_CUSTOMER_PARCEL",
  "TICKET_CUSTOMER_PERSON_RIDE",
  "TICKET_CUSTOMER_GENERAL",
] as const;

export function normalizeActionList(actions: unknown): string[] {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => String(a).trim().toUpperCase()).filter(Boolean);
}

/** Catalog defaults when a granted access-point row has no actions stored. */
export function resolveAllowedActions(group: string, stored: unknown): string[] {
  const have = normalizeActionList(stored);
  if (have.length > 0) return have;
  const key = String(group || "").trim().toUpperCase();
  return ACCESS_POINT_DEFAULT_ACTIONS[key] ?? [];
}

export function hydrateAccessPointForClient<T extends {
  accessPointGroup?: string;
  allowedActions?: unknown;
}>(ap: T): T & { allowedActions: string[] } {
  return {
    ...ap,
    allowedActions: resolveAllowedActions(String(ap.accessPointGroup ?? ""), ap.allowedActions),
  };
}

export function relatedDashboardTypes(dashboardType: string): string[] {
  const dt = String(dashboardType || "").trim().toUpperCase();
  if (dt === "TICKET" || dt.startsWith("TICKET_")) {
    return [...TICKET_DASHBOARD_FAMILY];
  }
  return [dt];
}

/**
 * Rider KYC/document APIs check APPROVE, but User Details grants UPDATE on RIDER_ACTIONS_*.
 */
export function equivalentActionsForGroup(
  dashboardType: string,
  accessPointGroup: string,
  wantedAction: string
): string[] {
  const dt = String(dashboardType || "").trim().toUpperCase();
  const group = String(accessPointGroup || "").trim().toUpperCase();
  const want = String(wantedAction || "").trim().toUpperCase();
  if (!want) return [];
  if (
    dt === "RIDER" &&
    group.startsWith("RIDER_ACTIONS_") &&
    (want === "APPROVE" || want === "REJECT")
  ) {
    return [want, "UPDATE"];
  }
  return [want];
}
