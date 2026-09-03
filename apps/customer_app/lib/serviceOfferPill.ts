/**
 * Compact top-right offer pill copy for home service cards.
 * Only returns a label when a live geo offer exists — otherwise hide the pill.
 */

import type { HomeBannerOffer } from "@/services/offers.service";

/** Short uppercase label for the corner offer pill (e.g. "14% OFF"). */
export function formatServiceOfferPillLabel(
  offer: HomeBannerOffer | null | undefined
): string | null {
  if (!offer) return null;

  const type = String(offer.offer_type ?? "").toUpperCase();
  const pct = offer.discount_percentage;
  const val = offer.discount_value;
  const title = (offer.title ?? "").trim();

  if (type === "FREE_DELIVERY" || /free\s*delivery/i.test(title)) {
    return "FREE DELIVERY";
  }
  if (pct != null && Number.isFinite(pct) && pct > 0) {
    return `${Math.round(pct)}% OFF`;
  }
  if (val != null && Number.isFinite(val) && val > 0) {
    return `₹${Math.round(val)} OFF`;
  }

  const pctFromTitle = title.match(/(\d+)\s*%\s*OFF/i);
  if (pctFromTitle?.[1]) return `${pctFromTitle[1]}% OFF`;

  const flatFromTitle = title.match(/₹\s*(\d+)\s*OFF/i);
  if (flatFromTitle?.[1]) return `₹${flatFromTitle[1]} OFF`;

  if (/free\s*delivery/i.test(offer.sub ?? "")) return "FREE DELIVERY";

  const cleaned = title.replace(/^flat\s+/i, "").trim();
  if (cleaned && cleaned.length <= 16) return cleaned.toUpperCase();

  return null;
}

export function pickBestFeaturedOffer(
  offers: HomeBannerOffer[] | null | undefined
): HomeBannerOffer | null {
  if (!offers?.length) return null;
  // Prefer % / ₹ structured discounts, then any titled offer.
  const scored = [...offers].sort((a, b) => {
    const score = (o: HomeBannerOffer) => {
      if (o.discount_percentage != null && o.discount_percentage > 0) return 3;
      if (o.discount_value != null && o.discount_value > 0) return 2;
      if (formatServiceOfferPillLabel(o)) return 1;
      return 0;
    };
    return score(b) - score(a);
  });
  return scored[0] ?? null;
}

export function resolveServiceOfferPillText(
  offer: HomeBannerOffer | null | undefined
): string | null {
  return formatServiceOfferPillLabel(offer);
}
