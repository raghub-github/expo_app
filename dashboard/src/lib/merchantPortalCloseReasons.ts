/**
 * Merchant portal (Next dashboard) close-store reasons — same canonical set as Partner Site `mx/dashboard`.
 */

export const MERCHANT_PORTAL_CLOSE_REASONS = [
  "Staff shortage",
  "Inventory restock",
  "Device issue / electricity",
  "Run out of Gas",
  "Payment issue",
  "Rush of offline orders",
  "Equipment issue",
  "Holiday / Off",
  "Maintenance",
  "Personal / Emergency",
  "Kitchen / Prep area issue",
  "Supplier delay",
  "Other",
] as const;

export type MerchantPortalCloseReason = (typeof MERCHANT_PORTAL_CLOSE_REASONS)[number];

/** Appended when sending/storing the close reason (dashboard + parity with app / Partner card). */
export const MERCHANT_PORTAL_CLOSE_REASON_LABEL_SUFFIX = " By-GatiMitra";

export function merchantPortalCloseReasonWithSuffix(base: string): string {
  return `${base.trim()}${MERCHANT_PORTAL_CLOSE_REASON_LABEL_SUFFIX}`;
}

/** Card copy: legacy DB still has “(Behalf of Store)”; show By-GatiMitra instead. */
export function formatCloseReasonForCard(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).replace(/\s*\(Behalf of Store\)/gi, MERCHANT_PORTAL_CLOSE_REASON_LABEL_SUFFIX);
}
