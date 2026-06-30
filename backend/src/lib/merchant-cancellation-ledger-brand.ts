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
    return "Customer";
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
    return "Store Itself";
  }

  if (
    type === "admin" ||
    source === "admin_cancel" ||
    source.includes("dashboard") ||
    label.includes("gatimitra team")
  ) {
    return "GatiMitra Team";
  }

  if (type === "system" || source === "system" || /auto cancel/i.test(label)) {
    return "GatiMitra Team";
  }

  if (source.includes("merchant") || source.includes("partner")) {
    return "Store Itself";
  }

  return "GatiMitra Team";
}

export function applyCancelledByBrandToDescription(
  description: string | null | undefined,
  brand: string
): string {
  if (!description?.trim()) return "";
  return description.replace(
    /Cancelled by [^:—·\n.]+(?=[:—·\n.]|$)/gi,
    `Cancelled by ${brand}`
  );
}
