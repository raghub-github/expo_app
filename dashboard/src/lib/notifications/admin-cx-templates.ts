/** Lifecycle ADMIN_CX templates sent automatically by the app — not manual agent push. */
export const AUTO_ONLY_ADMIN_CX_CODES = new Set([
  "ADMIN_CX_DELIVERY_OTP",
  "ADMIN_CX_PICKUP_OTP",
  "ADMIN_CX_ORDER_DELIVERED",
  "ADMIN_CX_PICKUP_COMPLETED",
  "ADMIN_CX_REFUND_COMPLETED",
  "ADMIN_CX_REFUND_INITIATED",
  "ADMIN_CX_RIDER_ASSIGNED",
  "ADMIN_CX_RIDER_REASSIGNED",
  "ADMIN_CX_RIDER_NEAR_DELIVERY",
  "ADMIN_CX_RIDER_NEAR_PICKUP",
  "ADMIN_CX_SUPPORT_WORKING",
]);

/** Manual rating prompts — keep after operational templates, before Custom. */
export const BOTTOM_ADMIN_CX_CODES = [
  "ADMIN_CX_ORDER_DELIVERED_DE",
  "ADMIN_CX_ORDER_DELIVERED_SP",
] as const;

const BOTTOM_ADMIN_CX_CODE_SET = new Set<string>(BOTTOM_ADMIN_CX_CODES);

export function compareAdminCxDropdownItems(
  a: { code: string; label: string; is_custom?: boolean },
  b: { code: string; label: string; is_custom?: boolean },
): number {
  if (a.is_custom) return 1;
  if (b.is_custom) return -1;
  const aBottom = BOTTOM_ADMIN_CX_CODE_SET.has(a.code);
  const bBottom = BOTTOM_ADMIN_CX_CODE_SET.has(b.code);
  if (aBottom !== bBottom) return aBottom ? 1 : -1;
  if (aBottom && bBottom) {
    return (
      BOTTOM_ADMIN_CX_CODES.indexOf(a.code as (typeof BOTTOM_ADMIN_CX_CODES)[number]) -
      BOTTOM_ADMIN_CX_CODES.indexOf(b.code as (typeof BOTTOM_ADMIN_CX_CODES)[number])
    );
  }
  return a.label.localeCompare(b.label);
}

/** Agent picks template on order page and sends — editable in Templates → Manual filter. */
export function isManualAdminCxTemplate(code: string): boolean {
  return code.startsWith("ADMIN_CX_") && !AUTO_ONLY_ADMIN_CX_CODES.has(code);
}

export function isAppNotificationTemplate(code: string): boolean {
  return !isManualAdminCxTemplate(code);
}

export function normalizeManualTemplateCode(raw: string): string {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  if (!upper) return "";
  if (upper.startsWith("ADMIN_CX_")) return upper;
  return `ADMIN_CX_${upper}`;
}

export function templateSourceLabel(code: string): "Manual" | "App" {
  return isManualAdminCxTemplate(code) ? "Manual" : "App";
}
