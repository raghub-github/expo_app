import type { MerchantSummary } from "@/services/merchant.service";
import { formatMerchantDeliveryTime, resolveMerchantEtaRange } from "@/lib/merchantDeliveryTime";

const GENERIC_OFFER =
  /^(tiered|bundle|coupon|free item|special offer|bundle deal|coupon offer|tiered offer|spend more)\b/i;

function normalizeOffer(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t || GENERIC_OFFER.test(t)) return null;
  return t;
}

/** Swiggy-style badge on image: ₹/% OFF lines only. */
export function formatGridOfferBadge(offerText: string | null | undefined): string | null {
  const raw = normalizeOffer(offerText);
  if (!raw) return null;
  if (!/\d+\s*%|₹|%\s*off|\boff\b/i.test(raw) && !/^buy\s+\d+/i.test(raw)) return null;
  return raw;
}

/** GatiMitra-style list row — show any meaningful running offer. */
export function formatCardOfferLine(offerText: string | null | undefined): string | null {
  return normalizeOffer(offerText);
}

export const RATING_PILL_GREEN = "#287405";

export function ratingBadgeColors(rating: number | null): { bg: string; low: boolean } {
  if (rating == null || !Number.isFinite(rating)) return { bg: RATING_PILL_GREEN, low: false };
  if (rating < 3.5) return { bg: "#FDE047", low: true };
  return { bg: RATING_PILL_GREEN, low: false };
}

export function gridDeliveryLabel(
  merchant: MerchantSummary,
  weatherDelayMinutes = 0
): { label: string; isFast: boolean } {
  const range = resolveMerchantEtaRange(merchant);
  const label = formatMerchantDeliveryTime(merchant, {
    weatherDelayMinutes,
    unit: "mins",
  });
  const max =
    weatherDelayMinutes > 0
      ? range.etaMaxMinutes + weatherDelayMinutes
      : range.etaMaxMinutes;
  return { label, isFast: max <= 35 };
}
