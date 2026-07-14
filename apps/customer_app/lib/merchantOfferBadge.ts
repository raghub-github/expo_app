import type { MerchantSummary } from "@/services/merchant.service";
import type { MerchantOfferItem, PlatformOfferItem } from "@/services/offers.service";
import { formatMerchantDeliveryTime, resolveMerchantEtaRange } from "@/lib/merchantDeliveryTime";

const GENERIC_OFFER =
  /^(tiered|bundle|coupon|free item|special offer|bundle deal|coupon offer|tiered offer|spend more)\b/i;

function normalizeOffer(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t || GENERIC_OFFER.test(t)) return null;
  return t;
}

function isBogoType(type: string): boolean {
  const t = type.toUpperCase();
  return t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M";
}

/**
 * Compact list/inner offer line — MUST match backend merchant-offer-headline.ts
 * Boost selected → "x% OFF on selected item"
 * Boost all      → "x% OFF on all items"
 * Precision      → "x% OFF upto ₹Y"
 * BOGO           → "Buy X Get Y"
 * Never appends sub_label / min-order prose.
 */
export function formatListCardOfferFromMerchantOffer(o: MerchantOfferItem): string | null {
  const type = String(o.offer_type ?? "").toUpperCase();
  const pct = o.discount_percentage;
  const flat = o.discount_value;
  const max = o.max_discount_amount;
  const mode = o.conditions_mode ?? null;
  const sub = String(o.offer_sub_type ?? "")
    .toUpperCase()
    .trim()
    .replace(/[-\s]+/g, "_");
  const hasItems = Array.isArray(o.menu_item_ids) && o.menu_item_ids.length > 0;
  const onSelected =
    hasItems ||
    sub === "SPECIFIC_ITEM" ||
    sub === "SPECIFIC_ITEMS" ||
    sub === "SELECTED_ITEM" ||
    sub === "SELECTED_ITEMS" ||
    o.display_surface === "item";

  if (isBogoType(type)) {
    const buy = o.buy_quantity != null && o.buy_quantity > 0 ? Math.round(o.buy_quantity) : 1;
    const get = o.get_quantity != null && o.get_quantity > 0 ? Math.round(o.get_quantity) : 1;
    return `Buy ${buy} Get ${get}`;
  }

  let core = "";
  if (pct != null && pct > 0) core = `${Math.round(pct)}% OFF`;
  else if (flat != null && flat > 0) core = `₹${Math.round(flat)} OFF`;
  else {
    const raw = (o.label ?? "").trim().split(/\s*·\s*/)[0]?.trim() ?? "";
    const m = raw.match(/^(\d+\s*%\s*OFF|₹\s*\d+\s*OFF)/i);
    core = m?.[1]?.replace(/\s+/g, " ") ?? "";
  }
  if (!core) return null;

  const isCartish =
    type === "CART_PERCENTAGE" ||
    type === "CART_FLAT" ||
    type === "COUPON" ||
    type === "TIERED" ||
    type === "BUNDLE" ||
    type === "FREE_DELIVERY";

  const isPctOrFlat = type === "PERCENTAGE" || type === "FLAT";
  // Boost / item-scoped — never bare "x% OFF" (selected vs all).
  if (isPctOrFlat && !isCartish && (mode === "boost" || onSelected || mode == null)) {
    if (onSelected) return `${core} on selected item`;
    return `${core} on all items`;
  }

  const isPrecision = mode === "precision" || isCartish || o.display_surface === "sheet";
  if (isPrecision) {
    const minOrder = o.min_order_amount;
    if (pct != null && pct > 0 && max != null && max > 0) {
      return `Flat ${Math.round(pct)}% Off up to ₹${Math.round(max)}`;
    }
    if (pct != null && pct > 0 && minOrder != null && minOrder > 0) {
      return `Flat ${Math.round(pct)}% Off`;
    }
    if (pct != null && pct > 0) return `Flat ${Math.round(pct)}% Off`;
    if (flat != null && flat > 0 && minOrder != null && minOrder > 0) {
      return `Flat ₹${Math.round(flat)} Off`;
    }
    if (flat != null && flat > 0) return `Flat ₹${Math.round(flat)} Off`;
    return core ? `Flat ${core}` : null;
  }

  // Boost / percentage — "X% off up to ₹Y"
  if (pct != null && pct > 0 && max != null && max > 0) {
    return `${Math.round(pct)}% off up to ₹${Math.round(max)}`;
  }
  if (pct != null && pct > 0) return `${Math.round(pct)}% Off`;
  if (flat != null && flat > 0 && max != null && max > 0) {
    return `₹${Math.round(flat)} off up to ₹${Math.round(max)}`;
  }
  if (flat != null && flat > 0) return `₹${Math.round(flat)} Off`;
  return core;
}

/**
 * Platform / GatiMitra offer line for list + inner ticker.
 * e.g. "GatiMitra · ₹100 OFF above ₹249", "GatiMitra · 20% OFF upto ₹150"
 */
export function formatListCardOfferFromPlatformOffer(o: PlatformOfferItem): string | null {
  const label = (o.label ?? "").trim();
  const blob = `${label} ${o.sub_label ?? ""} ${o.name ?? ""}`.toLowerCase();
  if (/\bfree\s*delivery\b/.test(blob) || /\bfree\s*del\b/.test(blob)) return null;

  const kind = String(o.offer_kind ?? "").toUpperCase();
  const discType = String(o.discount_type ?? "").toUpperCase();
  const value = o.value != null && Number.isFinite(o.value) ? o.value : null;
  const max = o.max_discount_amount != null && o.max_discount_amount > 0
    ? Math.round(o.max_discount_amount)
    : null;
  const min = o.min_order_amount != null && o.min_order_amount > 0
    ? Math.round(o.min_order_amount)
    : (() => {
        const m = (o.sub_label ?? "").match(/above\s+₹\s*(\d+)/i);
        return m ? parseInt(m[1]!, 10) : null;
      })();

  let core = "";
  if (kind === "CASHBACK" && value != null && value > 0) {
    core =
      discType === "PERCENTAGE"
        ? `${Math.round(value)}% Cashback`
        : `₹${Math.round(value)} Cashback`;
  } else if (value != null && value > 0) {
    core =
      discType === "PERCENTAGE" || /\d+\s*%/.test(label)
        ? `${Math.round(value)}% OFF`
        : `Flat ₹${Math.round(value)} Off`;
  } else {
    let fromLabel =
      label.match(/(\d+\s*%\s*OFF|₹\s*\d+\s*OFF|\d+\s*%\s*Cashback|₹\s*\d+\s*Cashback)/i)?.[1] ??
      formatCardOfferLine(label);
    // "Flat 100 off" without ₹
    if (!fromLabel || (!/%/.test(fromLabel) && !/₹/.test(fromLabel))) {
      const flatAmt = label.match(/^flat\s+(\d+)\s*(?:rs\.?|inr)?\s*off?$/i);
      if (flatAmt) fromLabel = `Flat ₹${flatAmt[1]} Off`;
    }
    core = fromLabel?.replace(/\s+/g, " ") ?? "";
  }
  if (!core) {
    if (max != null) core = `Up to ₹${max} OFF`;
    else if (label) core = label.split(/\s*·\s*/)[0]!.trim();
  }
  if (!core) return null;

  let line = core;
  if (/\d+\s*%\s*OFF/i.test(core) && max != null) {
    line = `${core} upto ₹${max}`;
  } else if (/\bOFF\b/i.test(core) && min != null) {
    line = `${core} above ₹${min}`;
  } else if (/\bCashback\b/i.test(core) && min != null) {
    line = `${core} above ₹${min}`;
  }

  // Brand so platform offers read differently from store Boost/Precision.
  const branded = `GatiMitra · ${line}`;
  return branded.length <= 44 ? branded : line.length <= 42 ? line : `${line.slice(0, 40).trim()}…`;
}

/** Swiggy-style badge on image: short ₹/% OFF headline only (not full offer copy). */
export function formatGridOfferBadge(offerText: string | null | undefined): string | null {
  const raw = normalizeOffer(offerText);
  if (!raw) return null;
  let primary = raw.split(/\s*\|\s*/)[0]?.trim() || raw;
  primary = primary.split(/\s*·\s*/)[0]?.trim() || primary;
  if (!/\d+\s*%|₹|%\s*off|\boff\b/i.test(primary) && !/^buy\s+\d+/i.test(primary)) return null;
  if (primary.length <= 42) return primary;
  const short =
    primary.match(/^(.+?\bOFF(?:\s+on (?:selected|all) items?)?(?:\s+upto\s+₹\d+)?)/i)?.[1] ??
    primary.match(/^(.+?\bOFF(?:\s+up to\s+₹\d+)?)/i)?.[1] ??
    primary.match(/^(.+?\bOFF)/i)?.[1] ??
    primary;
  return short.length <= 44 ? short : `${short.slice(0, 42).trim()}…`;
}

/** List-card / inner-page offer segment — compact Boost / Precision / BOGO / platform. */
export function formatCardOfferLine(offerText: string | null | undefined): string | null {
  const raw = normalizeOffer(offerText);
  if (!raw) return null;
  let primary = raw.split(/\s*\|\s*/)[0]?.trim() || raw;
  if (!/\d+\s*%|₹|%\s*off|\boff\b|cashback/i.test(primary) && !/^buy\s+\d+/i.test(primary)) {
    return null;
  }

  // Keep branded platform lines intact: "GatiMitra · ₹100 OFF above ₹249"
  if (/^GatiMitra\s*·/i.test(primary) && primary.length <= 48) {
    return primary.replace(/\bup\s+to\s+₹/i, "upto ₹");
  }

  // Recover Precision cap from verbose API copy: "70% OFF · on orders above ₹249 · up to ₹150"
  const uptoFromVerbose = primary.match(/\bup\s*to\s+₹\s*(\d+)/i)?.[1];
  const aboveFromVerbose = primary.match(/\b(?:on orders\s+)?above\s+₹\s*(\d+)/i)?.[1];
  const offCore = primary.match(/(\d+\s*%\s*OFF|₹\s*\d+\s*OFF)/i)?.[1]?.replace(/\s+/g, " ");
  if (offCore && uptoFromVerbose && !/\bon (?:selected|all) items?\b/i.test(primary)) {
    return `${offCore} upto ₹${uptoFromVerbose}`;
  }
  if (
    offCore &&
    aboveFromVerbose &&
    !/\bon (?:selected|all) items?\b/i.test(primary) &&
    !uptoFromVerbose
  ) {
    return `${offCore} above ₹${aboveFromVerbose}`;
  }

  // Drop · subcopy only when first segment is already the discount core —
  // but keep "on selected/all item(s)" if it lived in a later · segment.
  const dotParts = primary.split(/\s*·\s*/);
  if (dotParts.length > 1 && /\d+\s*%|₹|OFF/i.test(dotParts[0]!)) {
    const rest = dotParts.slice(1).join(" · ");
    const scope = rest.match(/\bon (selected|all) items?\b/i)?.[0];
    primary = scope
      ? `${dotParts[0]!.trim()} ${scope}`.replace(/\s+/g, " ")
      : dotParts[0]!.trim();
  }
  primary = primary.replace(/\bup\s+to\s+₹/i, "upto ₹");

  if (/\bon selected items?\b/i.test(primary)) {
    const m = primary.match(/^(.+?\bOFF)\s+on selected items?/i);
    if (m) return `${m[1]} on selected item`;
  }
  if (/\bon all items?\b/i.test(primary)) {
    const m = primary.match(/^(.+?\bOFF)\s+on all items?/i);
    if (m) return `${m[1]} on all items`;
  }
  if (/\bupto\s+₹\s*\d+/i.test(primary)) {
    const m = primary.match(/^(.+?\bOFF)\s+upto\s+₹\s*(\d+)/i);
    if (m) return `${m[1]} upto ₹${m[2]}`;
  }
  if (/\babove\s+₹\s*\d+/i.test(primary)) {
    const m = primary.match(/^(.+?\bOFF)\s+above\s+₹\s*(\d+)/i);
    if (m) return `${m[1]} above ₹${m[2]}`;
  }
  if (/^buy\s+\d+\s+get\s+\d+/i.test(primary)) {
    const m = primary.match(/^(buy\s+\d+\s+get\s+\d+)/i);
    if (m) {
      return m[1].replace(/\bget\b/i, "Get").replace(/^buy/i, "Buy");
    }
  }

  if (primary.length <= 42) return primary;
  const short =
    primary.match(/^(.+?\bOFF(?:\s+on (?:selected|all) items?)?(?:\s+(?:upto|above)\s+₹\d+)?)/i)?.[1] ??
    primary.match(/^(.+?\bOFF)/i)?.[1] ??
    primary;
  return short.length <= 44 ? short : `${short.slice(0, 42).trim()}…`;
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
