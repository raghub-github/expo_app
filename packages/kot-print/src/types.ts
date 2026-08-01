/** Shared KOT print payload — single source of truth for Partner Site + Merchant App. */

export type ThermalPrinterWidthMm = 58 | 80;

export type KotCustomizationKind = "variant" | "addon" | "note";

export type KotCustomizationLine = {
  kind: KotCustomizationKind;
  name?: string | null;
  quantity?: number | null;
};

export type KotLineItem = {
  name: string;
  quantity: number;
  variantName?: string | null;
  variantTag?: string | null;
  specialInstructions?: string | null;
  customizationLines?: KotCustomizationLine[] | null;
};

export type KotPrintPayload = {
  /** Backend-generated store-scoped KOT number (e.g. K-0042). */
  kotNumber: string | null;
  /** Public order id (GM…). */
  orderId: string;
  /** Kitchen callout — typically last 4 digits. */
  crn: string;
  /** orders_core.id */
  internalReferenceId: number | string;
  restaurantName: string | null;
  restaurantPhone?: string | null;
  /** Full store address for receipt header. */
  restaurantAddress?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  orderCreatedAt: string | null;
  printTimestamp?: string | null;
  orderType?: string | null;
  paymentMode?: string | null;
  /** Secure backend pickup token embedded in QR for rider scan. */
  pickupToken: string | null;
  pickupOtp: string | null;
  items: KotLineItem[];
  /** Order-level restaurant notes from checkout (printed as `Note for restaurant : - …`; empty → omitted). */
  specialInstructions?: string[] | null;
  packagingInstructions?: string | null;
  /** Thermal roll width — 80 default, 58 fallback. */
  printerWidthMm?: ThermalPrinterWidthMm | number | null;
};

export type KotPrintSpec = {
  paperMm: ThermalPrinterWidthMm;
  printableMm: number;
  cssWidth: string;
  cssWidthPx: number;
  qrModuleScale: number;
  barcodeBarWidth: number;
  barcodeHeight: number;
};

/** Resolve printable width from merchant printer setting. */
export function resolveKotPrintSpec(
  printerWidthMm?: ThermalPrinterWidthMm | number | null
): KotPrintSpec {
  const paper: ThermalPrinterWidthMm = printerWidthMm === 58 ? 58 : 80;
  const printableMm = paper === 58 ? 48 : 72;
  const cssWidthPx = paper === 58 ? 384 : 576;
  return {
    paperMm: paper,
    printableMm,
    cssWidth: `${printableMm}mm`,
    cssWidthPx,
    // Render the QR at least as large as the printed box (108px / 132px) so the
    // thermal rasteriser never has to upscale — upscaled modules smear and fail scans.
    qrModuleScale: paper === 58 ? 3 : 4,
    barcodeBarWidth: paper === 58 ? 1 : 2,
    barcodeHeight: paper === 58 ? 40 : 52,
  };
}
