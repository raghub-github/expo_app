/** Shared bill print payload — single source of truth for Partner Site + Merchant App. */

export type BillCustomizationKind = "variant" | "addon" | "note";

export type BillCustomizationLine = {
  kind: BillCustomizationKind;
  name?: string | null;
  amount?: number | null;
  quantity?: number | null;
};

export type BillLineItem = {
  name: string;
  quantity: number;
  price?: number | null;
  total?: number | null;
  variantName?: string | null;
  variantTag?: string | null;
  specialInstructions?: string | null;
  customizationLines?: BillCustomizationLine[] | null;
  customizations?: string[] | null;
  customizationsTotal?: number | null;
  baseAmount?: number | null;
  capturedBaseAmount?: number | null;
  capturedAddonAmount?: number | null;
  hasCustomizations?: boolean | null;
  catalogLineTotal?: number | null;
  netLineTotal?: number | null;
  offerDiscount?: number | null;
  offerLabel?: string | null;
  isItemPromo?: boolean | null;
  appliedOfferType?: string | null;
  ctmFromSnapshot?: boolean | null;
};

export type BillPricingBreakdown = {
  subtotal: number;
  packaging: number;
  discount: number;
  total: number;
};

export type BillStoreInfo = {
  storeName: string;
  fullAddress?: string | null;
  city?: string | null;
  cuisineLabel?: string | null;
  fssaiNumber?: string | null;
};

export type BillPrintPayload = {
  formattedOrderId: string;
  orderCreatedAt: string;
  taxInvoiceNumber?: string | null;
  customerName?: string | null;
  dropAddress?: string | null;
  pickupOtp?: string | null;
  items: BillLineItem[];
  pricing: BillPricingBreakdown;
  store: BillStoreInfo;
  printTimestamp?: string | null;
};
