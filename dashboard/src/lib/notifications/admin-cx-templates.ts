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
