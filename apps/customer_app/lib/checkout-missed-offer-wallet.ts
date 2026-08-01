import type { CheckoutOffersResponse } from "@/services/billing.service";

export type MissedOfferWalletCompensation = {
  key: string;
  /** Amount credited to GatiCash wallet after order is placed. */
  amountInr: number;
  /** Discount applied on this order when unlocked. */
  offerSavingsInr: number;
  /** ₹ gap to min-cart unlock (smallest = closest offer). */
  unlockGapInr: number;
  headline: string;
  subline: string;
  offerId: number | null;
  offerSource: "platform" | "merchant" | null;
  offerKind: string;
  offerTitle: string;
  addItemsHint: string | null;
};

type MissedCandidate = {
  id: number;
  source: "platform" | "merchant";
  title: string;
  reason?: string;
  lockReason?: string;
  summary?: string;
  estimatedSavingsInr: number;
  unlockGapInr: number;
  offerKind: string;
};

function formatInr(value: number): string {
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(2);
}

function isTimeWindowLocked(reason?: string | null, lockReason?: string | null): boolean {
  if (reason === "time_window") return true;
  const lr = (lockReason ?? "").trim().toLowerCase();
  return lr === "not available at this time";
}

function isSubscriptionOnlyOffer(offerKind?: string | null): boolean {
  return String(offerKind ?? "").toUpperCase() === "SUBSCRIPTION_BENEFIT";
}

/**
 * Merchant store precision / cart checkout offers must NOT unlock via GatiCash.
 * Platform min-cart offers can still use the unlock sheet.
 */
export function isMerchantPrecisionOfferBlockedFromGatiCash(o: {
  conditionsMode?: string | null;
  displaySurface?: string | null;
  offerType?: string | null;
  title?: string | null;
  summary?: string | null;
}): boolean {
  const mode = String(o.conditionsMode ?? "")
    .toLowerCase()
    .trim();
  if (mode === "precision") return true;
  if (mode === "boost" || mode === "bogo") return false;

  const ot = String(o.offerType ?? "")
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  if (ot === "CART_PERCENTAGE" || ot === "CART_FLAT" || ot === "PRECISION") return true;
  if (ot === "BOGO" || ot === "BUY_X_GET_Y" || ot === "BUY_N_GET_M" || ot === "BOOST") {
    return false;
  }
  if (ot === "FREE_DELIVERY") return false;

  const surface = String(o.displaySurface ?? "").toLowerCase();
  // Sheet-only store %/flat/coupon = precision path (Boost is item/both).
  if (
    surface === "sheet" &&
    (ot === "PERCENTAGE" || ot === "FLAT" || ot === "COUPON" || ot === "")
  ) {
    return true;
  }

  const text = `${o.title ?? ""} ${o.summary ?? ""}`.toLowerCase();
  if (/\bprecision\b/.test(text)) return true;

  return false;
}

function isMinCartLocked(reason?: string | null, lockReason?: string | null): boolean {
  const raw = `${reason ?? ""} ${lockReason ?? ""}`;
  if (/minCart=/i.test(raw)) return true;
  if (/add ₹\d+ more to unlock/i.test(raw)) return true;
  return false;
}

export function parseUnlockGapInr(
  reason?: string | null,
  lockReason?: string | null,
  cartSubtotal?: number
): number {
  const raw = `${reason ?? ""} ${lockReason ?? ""}`;
  const addMatch = raw.match(/add ₹(\d+(?:\.\d+)?) more to unlock/i);
  if (addMatch) {
    const gap = Number(addMatch[1]);
    if (Number.isFinite(gap) && gap > 0) return Math.ceil(gap);
  }
  const minMatch = raw.match(/minCart=(\d+(?:\.\d+)?)/);
  if (minMatch && cartSubtotal != null) {
    const min = Number(minMatch[1]);
    if (Number.isFinite(min) && min > 0) {
      return Math.ceil(Math.max(0, min - cartSubtotal));
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/** Extract min-cart threshold from server lock text or explicit minOrderAmount. */
export function parseMinCartThresholdInr(
  reason?: string | null,
  lockReason?: string | null,
  minOrderAmount?: number | null
): number | null {
  if (minOrderAmount != null && Number.isFinite(minOrderAmount) && minOrderAmount > 0) {
    return Math.round(minOrderAmount * 100) / 100;
  }
  const raw = `${reason ?? ""} ${lockReason ?? ""}`;
  const minMatch = raw.match(/minCart=(\d+(?:\.\d+)?)/i);
  if (minMatch) {
    const min = Number(minMatch[1]);
    if (Number.isFinite(min) && min > 0) return min;
  }
  const addMatch = raw.match(/add ₹(\d+(?:\.\d+)?) more to unlock/i);
  // Without a live cart we can't recover min from "add ₹X more" alone.
  if (addMatch) return null;
  return null;
}

/**
 * Live unlock gap from current cart — updates instantly as qty changes
 * (before checkout-offers refetch finishes).
 */
export function liveUnlockGapInr(args: {
  reason?: string | null;
  lockReason?: string | null;
  minOrderAmount?: number | null;
  minCartAmount?: number | null;
  cartSubtotal: number;
  /** Cart ₹ when the server (or cached) lock text was produced. */
  fetchedCartSubtotal?: number | null;
}): number {
  const {
    reason,
    lockReason,
    minOrderAmount,
    minCartAmount,
    cartSubtotal,
    fetchedCartSubtotal,
  } = args;

  const explicitMin =
    minCartAmount != null && Number.isFinite(minCartAmount) && minCartAmount > 0
      ? minCartAmount
      : parseMinCartThresholdInr(reason, lockReason, minOrderAmount);

  if (explicitMin != null) {
    return Math.ceil(Math.max(0, explicitMin - cartSubtotal));
  }

  // Recover min from "Add ₹X more" + cart at fetch time (humanized platform reasons).
  const staleGap = parseUnlockGapInr(reason, lockReason, undefined);
  if (
    staleGap > 0 &&
    staleGap < Number.MAX_SAFE_INTEGER &&
    fetchedCartSubtotal != null &&
    Number.isFinite(fetchedCartSubtotal)
  ) {
    const recoveredMin = staleGap + fetchedCartSubtotal;
    return Math.ceil(Math.max(0, recoveredMin - cartSubtotal));
  }

  return staleGap;
}

export function formatAddMoreToUnlock(gapInr: number): string {
  if (!(gapInr > 0) || !Number.isFinite(gapInr)) return "";
  return `Add ₹${Math.ceil(gapInr)} more to unlock this offer`;
}

function humanMissedReason(
  reason: string | undefined,
  lockReason: string | undefined,
  cartSubtotal: number
): string | null {
  const gap = parseUnlockGapInr(reason, lockReason, cartSubtotal);
  if (Number.isFinite(gap) && gap < Number.MAX_SAFE_INTEGER && gap > 0) {
    return `Add ₹${gap} more to unlock this offer`;
  }
  if (lockReason && !isTimeWindowLocked(reason, lockReason)) return lockReason;
  return null;
}

function walletCreditForUnlockGap(unlockGapInr: number): number {
  if (!Number.isFinite(unlockGapInr) || unlockGapInr <= 0) return 0;
  return Math.min(Math.ceil(unlockGapInr), 500);
}

/**
 * GatiCash Unlock Card visibility — same rule for every customer (no per-user hardcoding).
 * Show only when unlock savings are close to the GatiCash top-up:
 * - save ≥ add, or
 * - (add − save) ≤ ₹20
 * Hides junk like "Add ₹398 & save ₹100" on a tiny cart for anyone.
 */
export function isGatiCashUnlockCardVisible(addAmount: number, saveAmount: number): boolean {
  if (!(addAmount > 0) || !(saveAmount > 0)) return false;
  if (saveAmount >= addAmount) return true;
  return addAmount - saveAmount <= 20;
}

/** Fair unlock for a min-cart gap + estimated savings (checkout card + offers sheet). */
export function isFairGatiCashUnlock(unlockGapInr: number, estimatedSavingsInr: number): boolean {
  return isGatiCashUnlockCardVisible(
    walletCreditForUnlockGap(unlockGapInr),
    estimatedSavingsInr
  );
}

function buildCompensation(
  best: MissedCandidate,
  merchantId: string,
  cartSubtotal: number
): MissedOfferWalletCompensation | null {
  const offerSavingsInr = Math.max(1, Math.round(best.estimatedSavingsInr * 100) / 100);
  const gap =
    best.unlockGapInr < Number.MAX_SAFE_INTEGER ? best.unlockGapInr : 0;
  const walletCreditInr = walletCreditForUnlockGap(gap);
  if (walletCreditInr <= 0) return null;
  // Card copy is "Add ₹X … & save ₹Y" — don't surface it when Y is too far below X.
  if (!isFairGatiCashUnlock(gap, offerSavingsInr)) return null;

  const addItemsHint = humanMissedReason(best.reason, best.lockReason, cartSubtotal);

  return {
    key: `${best.source}:${best.id}:${merchantId}`,
    amountInr: walletCreditInr,
    offerSavingsInr,
    unlockGapInr: gap,
    headline: `Add ₹${formatInr(walletCreditInr)} to GatiCash & save ₹${formatInr(offerSavingsInr)}`,
    subline: `You're ₹${gap} away · unlock on this order with GatiCash`,
    offerId: best.id,
    offerSource: best.source,
    offerKind: best.offerKind,
    offerTitle: best.title,
    addItemsHint,
  };
}

/** Locked offers from Coupons & offers sheet — sorted closest to unlock first. */
export function listMissedOfferWalletCandidates(
  offers: CheckoutOffersResponse | undefined,
  cartSubtotal: number
): MissedCandidate[] {
  // No discount-eligible cart base → unlock sheet must not surface.
  if (!(cartSubtotal > 0.005)) return [];

  const eligiblePlatformIds = new Set((offers?.platformOffers ?? []).map((o) => o.id));
  const eligibleMerchantIds = new Set((offers?.merchantOffers ?? []).map((o) => o.id));
  const fetchedCart = offers?.fetchedCartSubtotal ?? null;

  const ineligiblePlatform: MissedCandidate[] = (offers?.platformOffersIneligible ?? [])
    .filter(
      (o) =>
        !eligiblePlatformIds.has(o.id) &&
        !isTimeWindowLocked(o.reason) &&
        !isSubscriptionOnlyOffer(o.offerKind) &&
        isMinCartLocked(o.reason) &&
        (o.estimatedSavingsInr ?? 0) > 0.005
    )
    .map((o) => {
      const unlockGapInr = liveUnlockGapInr({
        reason: o.reason,
        minCartAmount: o.minCartAmount,
        cartSubtotal,
        fetchedCartSubtotal: fetchedCart,
      });
      return {
        id: o.id,
        source: "platform" as const,
        title: o.name?.trim() || o.summary?.trim() || "Platform offer",
        reason: o.reason,
        summary: o.summary,
        estimatedSavingsInr: o.estimatedSavingsInr ?? 0,
        unlockGapInr,
        offerKind: o.offerKind ?? "DISCOUNT",
      };
    });

  const ineligibleMerchant: MissedCandidate[] = (offers?.merchantOffersIneligible ?? [])
    .filter(
      (o) =>
        !eligibleMerchantIds.has(o.id) &&
        !isMerchantPrecisionOfferBlockedFromGatiCash(o) &&
        !isTimeWindowLocked(o.reason, o.lockReason) &&
        isMinCartLocked(o.reason, o.lockReason) &&
        (o.estimatedSavingsInr ?? 0) > 0.005
    )
    .map((o) => {
      const unlockGapInr = liveUnlockGapInr({
        reason: o.reason,
        lockReason: o.lockReason,
        minOrderAmount: o.minOrderAmount,
        cartSubtotal,
        fetchedCartSubtotal: fetchedCart,
      });
      return {
        id: o.id,
        source: "merchant" as const,
        title: o.title?.trim() || o.summary?.trim() || "Store offer",
        reason: o.reason,
        lockReason: o.lockReason,
        summary: o.summary,
        estimatedSavingsInr: o.estimatedSavingsInr ?? 0,
        unlockGapInr,
        offerKind: o.offerType ?? "DISCOUNT",
      };
    });

  return [...ineligiblePlatform, ...ineligibleMerchant]
    .filter((c) => c.unlockGapInr > 0 && c.unlockGapInr < Number.MAX_SAFE_INTEGER)
    .filter((c) => isFairGatiCashUnlock(c.unlockGapInr, c.estimatedSavingsInr))
    .sort((a, b) => {
      if (a.unlockGapInr !== b.unlockGapInr) return a.unlockGapInr - b.unlockGapInr;
      return b.estimatedSavingsInr - a.estimatedSavingsInr;
    });
}

export function resolveMissedOfferWalletCompensation(
  offers: CheckoutOffersResponse | undefined,
  merchantId: string | null,
  cartSubtotal: number,
  deliveryType: "delivery" | "self_pickup" = "delivery",
  selectedKey?: string | null
): MissedOfferWalletCompensation | null {
  if (!offers || !merchantId || deliveryType !== "delivery") return null;
  if (!(cartSubtotal > 0.005)) return null;

  const candidates = listMissedOfferWalletCandidates(offers, cartSubtotal);
  if (candidates.length === 0) return null;

  // Prefer an explicitly selected offer when it still passes the fair unlock gate;
  // never force a poor-value "closest" offer (same for every customer).
  if (selectedKey != null) {
    const preferred = candidates.find(
      (c) => `${c.source}:${c.id}:${merchantId}` === selectedKey
    );
    if (preferred) {
      const built = buildCompensation(preferred, merchantId, cartSubtotal);
      if (built) return built;
    }
  }

  for (const candidate of candidates) {
    const built = buildCompensation(candidate, merchantId, cartSubtotal);
    if (built) return built;
  }
  return null;
}

export function missedOfferKeyForCandidate(
  candidate: Pick<MissedCandidate, "source" | "id">,
  merchantId: string
): string {
  return `${candidate.source}:${candidate.id}:${merchantId}`;
}

export function isOfferGatiCashUnlockable(
  reason?: string | null,
  lockReason?: string | null
): boolean {
  return isMinCartLocked(reason, lockReason) && !isTimeWindowLocked(reason, lockReason);
}

/** Merchant row: min-cart unlock via GatiCash — never for store precision. */
export function isMerchantOfferGatiCashUnlockable(
  o: {
    reason?: string | null;
    lockReason?: string | null;
    conditionsMode?: string | null;
    displaySurface?: string | null;
    offerType?: string | null;
    title?: string | null;
    summary?: string | null;
  }
): boolean {
  if (isMerchantPrecisionOfferBlockedFromGatiCash(o)) return false;
  return isOfferGatiCashUnlockable(o.reason, o.lockReason);
}
