/**
 * Mirrors backend merchant-partner ticket intake mapping so partnersite creates
 * the same unified_tickets rows as the mobile app (POST …/stores/:id/tickets).
 */

export type SectionMapped = { title: string; category: string; priority: string };

export function mapMerchantSectionCode(sectionCode: string): SectionMapped {
  const code = String(sectionCode ?? "")
    .trim()
    .toLowerCase();
  switch (code) {
    case "orders":
      return { title: "MERCHANT_ORDER_NOT_RECEIVED", category: "ORDER", priority: "HIGH" };
    case "order_timing":
      return { title: "ORDER_DELAYED", category: "DELIVERY", priority: "HIGH" };
    case "payments":
      return { title: "PAYOUT_NOT_RECEIVED", category: "EARNINGS", priority: "URGENT" };
    case "payout_delayed":
      return { title: "PAYOUT_DELAYED", category: "EARNINGS", priority: "URGENT" };
    case "restaurant":
      return { title: "MERCHANT_APP_TECHNICAL_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
    case "address":
      return { title: "STORE_STATUS_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
    case "menu":
      return { title: "MENU_UPDATE_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
    case "taxes":
      return { title: "VERIFICATION_ISSUE", category: "VERIFICATION", priority: "MEDIUM" };
    case "ads":
    case "branding":
    case "reports":
      return { title: "OTHER", category: "OTHER", priority: "LOW" };
    case "hygiene_audit":
      return { title: "COMPLAINT", category: "COMPLAINT", priority: "MEDIUM" };
    case "outlet_status":
      return { title: "STORE_STATUS_ISSUE", category: "TECHNICAL", priority: "MEDIUM" };
    case "other":
    default:
      return { title: "COMPLAINT", category: "COMPLAINT", priority: "MEDIUM" };
  }
}

const UNIFIED_CATEGORY_ENUM = new Set([
  "ORDER",
  "PAYMENT",
  "DELIVERY",
  "REFUND",
  "ACCOUNT",
  "TECHNICAL",
  "EARNINGS",
  "VERIFICATION",
  "COMPLAINT",
  "FEEDBACK",
  "OTHER",
]);

const INTAKE_CATEGORY_TO_ENUM: Record<string, string> = {
  PROFILE_ISSUE: "TECHNICAL",
  PROFILE: "TECHNICAL",
  STORE_PROFILE: "TECHNICAL",
  RESTAURANT_PROFILE: "TECHNICAL",
  MENU_ISSUE: "TECHNICAL",
};

export function normalizeUnifiedCategory(raw: string): string {
  const key = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (UNIFIED_CATEGORY_ENUM.has(key)) return key;
  const mapped = INTAKE_CATEGORY_TO_ENUM[key];
  if (mapped && UNIFIED_CATEGORY_ENUM.has(mapped)) return mapped;
  return "OTHER";
}

const UNIFIED_PRIORITY_ENUM = new Set(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]);

export function normalizeUnifiedPriority(raw: string): string {
  const key = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (UNIFIED_PRIORITY_ENUM.has(key)) return key;
  return "MEDIUM";
}

const UNIFIED_SERVICE_ENUM = new Set(["FOOD", "PARCEL", "RIDE", "GENERAL"]);

export function normalizeUnifiedServiceType(raw: string): string {
  const key = String(raw ?? "").trim().toUpperCase();
  if (UNIFIED_SERVICE_ENUM.has(key)) return key;
  return "GENERAL";
}

/** Legacy enum values on unified_tickets.ticket_title (before text column migrations). */
const LEGACY_UNIFIED_TICKET_TITLE_ENUM = new Set<string>([
  "ORDER_DELAYED",
  "ORDER_NOT_RECEIVED",
  "WRONG_ITEM_DELIVERED",
  "ITEM_MISSING",
  "ORDER_CANCELLED_WRONG",
  "PAYMENT_ISSUE",
  "REFUND_NOT_PROCESSED",
  "ORDER_DAMAGED",
  "ORDER_QUALITY_ISSUE",
  "RIDER_NOT_ARRIVED",
  "RIDER_BEHAVIOUR_ISSUE",
  "MERCHANT_NOT_PREPARING",
  "DELIVERY_ADDRESS_WRONG",
  "ORDER_NOT_ASSIGNED",
  "ORDER_REASSIGNMENT_NEEDED",
  "ACCOUNT_ISSUE",
  "PAYMENT_METHOD_ISSUE",
  "WALLET_ISSUE",
  "COUPON_NOT_APPLYING",
  "APP_TECHNICAL_ISSUE",
  "PROFILE_UPDATE_ISSUE",
  "ADDRESS_MANAGEMENT_ISSUE",
  "NOTIFICATION_NOT_RECEIVING",
  "EARNINGS_NOT_CREDITED",
  "WALLET_WITHDRAWAL_ISSUE",
  "APP_CRASH_OR_BUG",
  "LOCATION_TRACKING_ISSUE",
  "RIDER_ORDER_NOT_RECEIVING",
  "ONBOARDING_ISSUE",
  "DOCUMENT_VERIFICATION_ISSUE",
  "DUTY_LOG_ISSUE",
  "RATING_DISPUTE",
  "PAYOUT_DELAYED",
  "PAYOUT_NOT_RECEIVED",
  "SETTLEMENT_DISPUTE",
  "COMMISSION_DISPUTE",
  "MENU_UPDATE_ISSUE",
  "STORE_STATUS_ISSUE",
  "MERCHANT_ORDER_NOT_RECEIVING",
  "MERCHANT_APP_TECHNICAL_ISSUE",
  "VERIFICATION_ISSUE",
  "OTHER",
  "FEEDBACK",
  "COMPLAINT",
  "SUGGESTION",
]);

const INTAKE_TITLE_TO_LEGACY_ENUM: Record<string, string> = {
  STORE_LOCATION_ISSUE: "ADDRESS_MANAGEMENT_ISSUE",
};

/**
 * When ticket_title is still enum-typed in Postgres, map unknown intake codes to a safe legacy label.
 */
export function resolveTicketTitleForInsert(intakeTitle: string): string {
  const code = String(intakeTitle ?? "").trim() || "OTHER";
  if (LEGACY_UNIFIED_TICKET_TITLE_ENUM.has(code)) return code;
  return INTAKE_TITLE_TO_LEGACY_ENUM[code] ?? "OTHER";
}
