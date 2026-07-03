/**
 * Merchant-facing "Cancelled by …" label for wallet ledger descriptions.
 * Keep in sync with partnersite/src/lib/merchant-cancellation-ledger-brand.ts
 */

export function resolveCancelledByBrandForLedger(
  cancelledByType?: string | null,
  cancelledByLabel?: string | null,
  triggerSource?: string | null
): string {
  const type = String(cancelledByType ?? "").trim().toLowerCase();
  const label = String(cancelledByLabel ?? "").trim().toLowerCase();
  const source = String(triggerSource ?? "").trim().toLowerCase();

  if (
    type === "customer" ||
    label.includes("customer") ||
    label.includes("cancelled by me")
  ) {
    return "customer";
  }

  if (
    type === "store" ||
    type === "merchant" ||
    source === "merchant_cancel" ||
    source === "partner_cancel" ||
    source === "website" ||
    source === "app" ||
    /merchant (app|portal)/i.test(label) ||
    /cancelled - merchant/i.test(label) ||
    label.includes("restaurant") ||
    label.includes("store itself")
  ) {
    return "store";
  }

  if (
    type === "admin" ||
    source === "admin_cancel" ||
    source.includes("dashboard") ||
    label.includes("gatimitra team") ||
    label.includes("gatimitra")
  ) {
    return "GatiMitra";
  }

  if (type === "system" || source === "system" || /auto cancel/i.test(label)) {
    return "__AUTO__";
  }

  if (source.includes("merchant") || source.includes("partner")) {
    return "store";
  }

  return "GatiMitra";
}

export function isAutoCancellationBrand(brand: string): boolean {
  return brand.trim().toUpperCase() === "__AUTO__";
}

export function applyCancelledByBrandToDescription(
  description: string | null | undefined,
  brand: string
): string {
  if (!description?.trim()) return "";
  if (isAutoCancellationBrand(brand)) {
    return description.replace(
      /Cancelled by [^:—·\n.]+:\s*([^:—·\n.]+)/gi,
      (_match, reason: string) => {
        const stripped = String(reason ?? "").trim().replace(/^auto cancelled?:?\s*/i, "").trim();
        return stripped ? `Auto Canceled: ${stripped}` : "Auto Canceled";
      },
    ).replace(/^Cancelled by [^:—·\n.]+(?=[:—·\n.]|$)/gi, "Auto Canceled");
  }

  const displayBrand =
    brand === "Customer"
      ? "customer"
      : brand === "Store Itself"
        ? "store"
        : brand === "GatiMitra Team"
          ? "GatiMitra"
          : brand;

  return description.replace(
    /Cancelled by [^:—·\n.]+(?=[:—·\n.]|$)/gi,
    `Cancelled by ${displayBrand}`,
  );
}
