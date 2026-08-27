import type { HomeBannerOffer } from "@/services/offers.service";

function rideWording(text: string): string {
  return text
    .replace(/\bon orders above\b/gi, "on rides above")
    .replace(/\bon order above\b/gi, "on ride above")
    .replace(/\bon your first order\b/gi, "on your first ride")
    .replace(/\bfirst order\b/gi, "first ride")
    .replace(/\bMin order\b/g, "Min fare")
    .replace(/\bmin order\b/g, "min fare");
}

function isAmountOnlySubline(text: string): boolean {
  return /^₹?\s*\d+(\.\d+)?\s*off$/i.test(text.trim());
}

/** Ride surfaces use the mapped offer amount, not max_discount_amount as the headline. */
export function formatRideOfferSubline(
  sub: string | null | undefined,
  opts?: {
    minFare?: number | null;
    maxDiscount?: number | null;
    discountValue?: number | null;
    discountPercentage?: number | null;
    promoType?: string | null;
    maxKm?: number | null;
    firstNCompleted?: number | null;
  }
): string {
  const promoType = String(opts?.promoType ?? "").toUpperCase();
  const usesFlat =
    !promoType ||
    promoType === "FLAT_OFF" ||
    promoType === "PERCENT_OFF" ||
    promoType === "COUPON" ||
    promoType === "PEAK_HOUR";

  const parts: string[] = [];
  const n = opts?.firstNCompleted;
  if (promoType === "FREE_UP_TO_KM" || promoType === "FREE_FIRST_N") {
    if (n != null && n > 1) return `on your first ${n} rides`;
    return "on your first ride";
  }
  if (n === 1) parts.push("on your first ride");
  else if (n != null && n > 1) parts.push(`on your first ${n} rides`);

  if (usesFlat) {
    const pct = opts?.discountPercentage;
    const max = opts?.maxDiscount;
    if (pct != null && Number.isFinite(pct) && pct > 0) {
      parts.push(`${Math.round(pct)}% off`);
      if (max != null && max > 0) parts.push(`save up to ₹${Math.round(max)}`);
    }
    // Do not repeat ₹X off — the banner title already has "Flat ₹X Off".
  }

  const min = opts?.minFare;
  if (min != null && min > 0) parts.push(`on rides above ₹${Math.round(min)}`);
  if (parts.length > 0) return parts.join(" · ");

  const trimmed = sub?.trim();
  if (trimmed) {
    const cleaned = rideWording(trimmed)
      .replace(/\s*·\s*up to \d+(\.\d+)?\s*km\b/gi, "")
      .replace(/\bup to \d+(\.\d+)?\s*km\b/gi, "")
      .replace(/^₹?\s*\d+(\.\d+)?\s*off(?:\s*·\s*)?/i, "")
      .replace(/\s*·\s*₹?\s*\d+(\.\d+)?\s*off\b/gi, "")
      .replace(/\s*·\s*$/g, "")
      .replace(/^\s*·\s*/g, "")
      .trim();
    if (!cleaned || isAmountOnlySubline(cleaned)) return "";
    return cleaned;
  }

  return usesFlat ? "" : "Get exciting offers on every ride.";
}

/** Ride-book offers shown in the Offers bottom sheet (populated when campaigns are live). */
export type RideBookOffer = {
  id: string;
  label: string;
  subLabel?: string | null;
  couponCode?: string | null;
  /** Short eligibility line, e.g. "Min fare ₹150" */
  criteria?: string | null;
  autoApply?: boolean;
};

const RIDE_BOOK_EXCLUDED_OFFER_TYPES = new Set([
  "TIERED",
  "BUY_X_GET_Y",
  "BUY_N_GET_M",
  "BOGO",
  "BUNDLE",
  "FREE_DELIVERY",
  "FREE_ITEM",
]);

/** Platform ride discounts that auto-apply on book (geo-mapped). */
export function filterRideBookAutoApplyOffers(offers: HomeBannerOffer[]): HomeBannerOffer[] {
  return filterRideBookFeaturedOffers(offers).filter((offer) => {
    if (offer.source_offer_id <= 0) return false;
    if (offer.is_geo_bound !== true) return false;
    const type = String(offer.offer_type ?? "").toUpperCase();
    if (type === "COUPON") return false;
    if (offer.auto_apply === false) return false;
    return true;
  });
}
export function filterRideBookFeaturedOffers(offers: HomeBannerOffer[]): HomeBannerOffer[] {
  return offers.filter((offer) => {
    if (offer.kind !== "platform") return false;
    if (offer.store_id?.trim()) return false;
    // Platform discounts (source_offer_id > 0) need an effective geo binding.
    if (offer.source_offer_id > 0 && offer.is_geo_bound !== true) return false;
    const type = String(offer.offer_type ?? "").toUpperCase();
    if (RIDE_BOOK_EXCLUDED_OFFER_TYPES.has(type)) return false;
    const title = offer.title?.trim() ?? "";
    if (/spend more save more|buy more save more|buy 1 get 1|bundle deal|free delivery/i.test(title)) {
      return false;
    }
    return true;
  });
}

function rideOfferRequiredFirstN(offer: HomeBannerOffer): number | null {
  const promo = String(offer.promo_type ?? "").toUpperCase();
  const n = offer.first_n_completed;
  if (promo === "FREE_UP_TO_KM" || promo === "FREE_FIRST_N" || promo === "NEW_USER_N") {
    return n != null && n > 0 ? n : 1;
  }
  if (n != null && n > 0) return n;
  return null;
}

/** Hide first-N ride promos once the customer already used them. */
export function filterRideOffersForCompletedRides(
  offers: HomeBannerOffer[],
  completedRideCount: number | null
): HomeBannerOffer[] {
  if (completedRideCount == null) return offers;
  return offers.filter((offer) => {
    const firstN = rideOfferRequiredFirstN(offer);
    if (firstN == null) return true;
    return completedRideCount < firstN;
  });
}

export function completedPersonRideCountHint(
  orders?: Array<{ orderType?: string | null; status?: string | null }> | null
): number | null {
  if (!orders) return null;
  let n = 0;
  for (const o of orders) {
    const type = String(o.orderType ?? "").toLowerCase();
    const status = String(o.status ?? "").toLowerCase();
    if (type !== "person_ride" && type !== "ride") continue;
    if (status === "delivered" || status === "completed") n += 1;
  }
  return n;
}

/** Map super-admin platform ride offers → ride book sheet rows. */
export function mapFeaturedOffersToRideBookOffers(
  offers: HomeBannerOffer[]
): RideBookOffer[] {
  return filterRideBookFeaturedOffers(offers).slice(0, 10).map((offer) => {
    const couponCode = offer.coupon_code?.trim() || null;
    const minFare =
      offer.min_order_amount != null && offer.min_order_amount > 0
        ? Math.round(offer.min_order_amount)
        : null;
    return {
      id: offer.id,
      label: offer.title?.trim() || "Ride offer",
      subLabel:
        formatRideOfferSubline(offer.sub, {
          minFare,
          maxDiscount: offer.max_discount_amount,
          discountValue: offer.discount_value,
          discountPercentage: offer.discount_percentage,
          promoType: offer.promo_type,
          maxKm: offer.max_km,
          firstNCompleted: offer.first_n_completed,
        }) || null,
      couponCode,
      criteria: minFare != null ? `Min fare ₹${minFare}` : null,
      autoApply: !couponCode,
    };
  });
}

function currentRidePeakSlots(now = new Date()): string[] {
  const day = now.getDay();
  const hour = now.getHours();
  const slots: string[] = [];
  if (day === 0 || day === 6) slots.push("weekend");
  if (hour >= 7 && hour < 11) slots.push("morning_peak");
  if (hour >= 17 && hour < 21) slots.push("evening_peak");
  if (hour >= 22 || hour < 5) slots.push("night");
  return slots;
}

function rideOfferPeakMatches(peakSlots: string[] | null | undefined, now = new Date()): boolean {
  const slots = (peakSlots ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (slots.length === 0) return true;
  if (slots.every((s) => s === "festival")) return true;
  const nowSlots = currentRidePeakSlots(now);
  return slots.some((s) => s === "festival" || nowSlots.includes(s));
}

function rideOfferVehicleMatches(
  vehicleId: string,
  vehicleTypes: string[] | null | undefined
): boolean {
  const allowed = (vehicleTypes ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return true;
  const id = vehicleId.trim().toLowerCase();
  if (allowed.includes(id)) return true;
  // Bike Lite / EV Auto are cheaper sibling products; parent-scoped offers apply on the reduced fare.
  if (id === "bike-lite" && allowed.includes("bike")) return true;
  if (id === "ev_auto" && allowed.includes("auto")) return true;
  return false;
}

function estimateSingleRideOfferDiscount(
  offer: HomeBannerOffer,
  fare: number,
  distanceKm: number
): number {
  const promoType = String(offer.promo_type ?? "").toUpperCase();
  const cap =
    offer.max_discount_amount != null && Number.isFinite(offer.max_discount_amount) && offer.max_discount_amount > 0
      ? offer.max_discount_amount
      : fare;

  if (promoType === "FREE_UP_TO_KM") {
    const maxKm = offer.max_km;
    if (maxKm == null || !Number.isFinite(maxKm) || maxKm <= 0) return 0;
    if (!(distanceKm > 0) || distanceKm > maxKm + 1e-6) return 0;
    return Math.min(Math.max(0, fare), fare);
  }
  if (promoType === "FREE_FIRST_N") {
    return Math.min(Math.max(0, fare), cap, fare);
  }

  const pct = offer.discount_percentage;
  const flat = offer.discount_value;
  let amt = 0;
  if (pct != null && Number.isFinite(pct) && pct > 0) {
    amt = (fare * pct) / 100;
  } else if (flat != null && Number.isFinite(flat) && flat > 0) {
    amt = flat;
  }
  amt = Math.min(amt, cap);
  return Math.min(Math.max(0, amt), fare);
}

/**
 * Best matching live platform ride offer for a quoted fare + vehicle.
 * Criteria: min fare, vehicle types, peak window. Used to strike the list fare on book.
 */
export function estimateMatchingRidePlatformOffer(args: {
  fare: number;
  vehicleId: string;
  offers: HomeBannerOffer[];
  distanceKm?: number | null;
  completedRideCount?: number | null;
  now?: Date;
}): { discount: number; payable: number; offerId: number | null; offerTitle: string | null } {
  const fare = Math.round(Number(args.fare));
  if (!Number.isFinite(fare) || fare <= 0) {
    return { discount: 0, payable: fare, offerId: null, offerTitle: null };
  }
  const distanceKm =
    args.distanceKm != null && Number.isFinite(args.distanceKm) ? Number(args.distanceKm) : 0;

  let best = 0;
  let bestId: number | null = null;
  let bestTitle: string | null = null;
  for (const offer of filterRideBookAutoApplyOffers(args.offers)) {
    const firstN = rideOfferRequiredFirstN(offer);
    if (
      firstN != null &&
      args.completedRideCount != null &&
      args.completedRideCount >= firstN
    ) {
      continue;
    }
    const minFare = offer.min_order_amount;
    if (minFare != null && minFare > 0 && fare + 1e-6 < minFare) continue;
    if (!rideOfferVehicleMatches(args.vehicleId, offer.vehicle_types)) continue;
    if (!rideOfferPeakMatches(offer.peak_slots, args.now)) continue;
    const amt = estimateSingleRideOfferDiscount(offer, fare, distanceKm);
    if (amt > best) {
      best = amt;
      bestId = offer.source_offer_id > 0 ? offer.source_offer_id : null;
      bestTitle = offer.title?.trim() || null;
    }
  }

  const discount = Math.round(best);
  if (discount < 1) return { discount: 0, payable: fare, offerId: null, offerTitle: null };
  return {
    discount,
    payable: Math.max(0, fare - discount),
    offerId: bestId,
    offerTitle: bestTitle,
  };
}
