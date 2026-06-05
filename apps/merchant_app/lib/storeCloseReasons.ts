/** Store close reasons (MerchantHeader / Partner Site parity). */
export const STORE_CLOSE_REASONS = [
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

export type StoreCloseReason = (typeof STORE_CLOSE_REASONS)[number];
