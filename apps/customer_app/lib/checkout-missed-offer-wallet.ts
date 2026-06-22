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
  const ineligiblePlatform: MissedCandidate[] = (offers?.platformOffersIneligible ?? [])
    .filter(
      (o) =>
        !isTimeWindowLocked(o.reason) &&
        !isSubscriptionOnlyOffer(o.offerKind) &&
        isMinCartLocked(o.reason) &&
        (o.estimatedSavingsInr ?? 0) > 0.005
    )
    .map((o) => ({
      id: o.id,
      source: "platform" as const,
      title: o.name?.trim() || o.summary?.trim() || "Platform offer",
      reason: o.reason,
      summary: o.summary,
      estimatedSavingsInr: o.estimatedSavingsInr ?? 0,
      unlockGapInr: parseUnlockGapInr(o.reason, undefined, cartSubtotal),
      offerKind: o.offerKind ?? "DISCOUNT",
    }));

  const ineligibleMerchant: MissedCandidate[] = (offers?.merchantOffersIneligible ?? [])
    .filter(
      (o) =>
        !isTimeWindowLocked(o.reason, o.lockReason) &&
        isMinCartLocked(o.reason, o.lockReason) &&
        (o.estimatedSavingsInr ?? 0) > 0.005
    )
    .map((o) => ({
      id: o.id,
      source: "merchant" as const,
      title: o.title?.trim() || o.summary?.trim() || "Store offer",
      reason: o.reason,
      lockReason: o.lockReason,
      summary: o.summary,
      estimatedSavingsInr: o.estimatedSavingsInr ?? 0,
      unlockGapInr: parseUnlockGapInr(o.reason, o.lockReason, cartSubtotal),
      offerKind: "DISCOUNT",
    }));

  return [...ineligiblePlatform, ...ineligibleMerchant]
    .filter((c) => c.unlockGapInr > 0 && c.unlockGapInr < Number.MAX_SAFE_INTEGER)
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

  const candidates = listMissedOfferWalletCandidates(offers, cartSubtotal);
  if (candidates.length === 0) return null;

  const picked =
    selectedKey != null
      ? candidates.find((c) => `${c.source}:${c.id}:${merchantId}` === selectedKey) ?? candidates[0]
      : candidates[0];

  return buildCompensation(picked, merchantId, cartSubtotal);
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
