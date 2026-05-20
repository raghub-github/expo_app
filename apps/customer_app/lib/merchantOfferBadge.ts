import type { MerchantSummary } from "@/services/merchant.service";

const GENERIC_OFFER =
  /^(tiered|bundle|coupon|free item|special offer|bundle deal|coupon offer|tiered offer|spend more)\b/i;

/** Swiggy-style badge: only ₹/% OFF lines, never campaign or type names. */
export function formatGridOfferBadge(offerText: string | null | undefined): string | null {
  const raw = offerText?.trim();
  if (!raw || GENERIC_OFFER.test(raw)) return null;
  if (!/\d+\s*%|₹|%\s*off|\boff\b/i.test(raw) && !/^buy\s+\d+/i.test(raw)) return null;
  return raw;
}

export function gridDeliveryLabel(merchant: MerchantSummary): { label: string; isFast: boolean } {
  if (merchant.etaMinMinutes != null && merchant.etaMaxMinutes != null) {
    return {
      label: `${merchant.etaMinMinutes}-${merchant.etaMaxMinutes} mins`,
      isFast: merchant.etaMaxMinutes <= 35,
    };
  }
  const raw = merchant.deliveryTime?.trim() ?? "";
  const range = raw.match(/(\d+)\s*-\s*(\d+)\s*min/i);
  if (range) {
    const max = Number(range[2]);
    return { label: `${range[1]}-${range[2]} mins`, isFast: max <= 35 };
  }
  const cleaned = raw.replace(/^near\s*&\s*fast\s*·\s*/i, "").trim();
  if (cleaned) {
    const maxM = cleaned.match(/(\d+)\s*min/i);
    return { label: cleaned, isFast: maxM ? Number(maxM[1]) <= 35 : true };
  }
  return { label: "25-30 mins", isFast: true };
}
