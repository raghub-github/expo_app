/**
 * Platform FREE_DELIVERY progress for checkout (Super Admin offer kind = FREE_DELIVERY):
 * - Offer still listed for this user (eligible or min-cart locked) → hide GMitra Plus
 * - Below min cart → "Add ₹X more to avail free delivery" + ADD → unlock sheet
 * - Offer gone and not on the bill → Plus upsell may return
 */

import {
  resolveOfferMinOrderAmount,
  resolveOfferMinOrderGap,
} from "@/lib/checkoutOfferMinOrder";
import type { MissedOfferWalletCompensation } from "@/lib/checkout-missed-offer-wallet";
import { missedOfferKeyForCandidate } from "@/lib/checkout-missed-offer-wallet";

export type FreeDeliveryOfferLike = {
  id: number;
  name?: string | null;
  offerKind?: string | null;
  summary?: string | null;
  minCartAmount?: number | null;
  reason?: string | null;
  estimatedSavingsInr?: number | null;
};

/** Strict: Super Admin "Offer kind" = FREE_DELIVERY only. */
export function isPlatformFreeDeliveryOffer(offer: {
  offerKind?: string | null;
}): boolean {
  const kind = String(offer.offerKind ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
  return kind === "FREE_DELIVERY";
}

export function findPlatformFreeDeliveryOffer(args: {
  platformOffers?: FreeDeliveryOfferLike[] | null;
  platformOffersIneligible?: FreeDeliveryOfferLike[] | null;
}): FreeDeliveryOfferLike | null {
  // Prefer the locked (min-cart) copy when both exist — that is when the progress row shows.
  const locked = (args.platformOffersIneligible ?? []).find(isPlatformFreeDeliveryOffer);
  if (locked) return locked;
  return (args.platformOffers ?? []).find(isPlatformFreeDeliveryOffer) ?? null;
}

export type FreeDeliveryProgress = {
  /** FREE_DELIVERY still exists for this customer (or already waived on the bill). */
  offerAvailable: boolean;
  /** ₹ still needed to unlock; 0 when unlocked / applied / no min. */
  gapInr: number;
  minCartAmount: number | null;
  offer: FreeDeliveryOfferLike | null;
};

export function resolveFreeDeliveryProgress(args: {
  platformOffers?: FreeDeliveryOfferLike[] | null;
  platformOffersIneligible?: FreeDeliveryOfferLike[] | null;
  /** Live eligible checkout cart (not debounced) for instant gap. */
  cartSubtotal: number;
  /** Platform FREE_DELIVERY discount already on the settled/placeholder bill. */
  freeDeliveryAlreadyOnBill: boolean;
}): FreeDeliveryProgress {
  const offer = findPlatformFreeDeliveryOffer({
    platformOffers: args.platformOffers,
    platformOffersIneligible: args.platformOffersIneligible,
  });
  const offerAvailable = args.freeDeliveryAlreadyOnBill || offer != null;
  if (!offerAvailable) {
    return { offerAvailable: false, gapInr: 0, minCartAmount: null, offer: null };
  }
  if (args.freeDeliveryAlreadyOnBill) {
    return {
      offerAvailable: true,
      gapInr: 0,
      minCartAmount: null,
      offer,
    };
  }
  if (offer == null) {
    return { offerAvailable: true, gapInr: 0, minCartAmount: null, offer: null };
  }
  const ineligible = (args.platformOffersIneligible ?? []).find((o) => o.id === offer.id);
  const minCartAmount = resolveOfferMinOrderAmount({
    minCartAmount: offer.minCartAmount ?? ineligible?.minCartAmount,
    summary: offer.summary,
    reason: offer.reason ?? ineligible?.reason,
  });
  const gapInr = resolveOfferMinOrderGap(
    {
      minCartAmount,
      summary: offer.summary,
      reason: offer.reason ?? ineligible?.reason,
    },
    args.cartSubtotal
  );
  return { offerAvailable: true, gapInr, minCartAmount, offer };
}

export function formatAddMoreForFreeDelivery(gapInr: number): string {
  const gap = Math.ceil(Math.max(0, gapInr));
  if (!(gap > 0)) return "";
  return `Add ₹${gap} more to avail free delivery`;
}

/**
 * Unlock sheet payload for the FREE_DELIVERY progress ADD button
 * (add items vs GatiCash top-up) — same shape as missed-offer unlock.
 */
export function buildFreeDeliveryUnlockCompensation(args: {
  offer: FreeDeliveryOfferLike;
  gapInr: number;
  merchantId: string;
  /** Quoted delivery fee / estimated waiver — what the customer saves once unlocked. */
  deliverySavingsInr: number;
}): MissedOfferWalletCompensation | null {
  const gap = Math.ceil(Math.max(0, args.gapInr));
  if (!(gap > 0) || !args.merchantId) return null;
  const title =
    String(args.offer.name ?? "").trim() ||
    String(args.offer.summary ?? "").trim() ||
    "Free Delivery";
  const quoted = Math.round(Math.max(0, args.deliverySavingsInr) * 100) / 100;
  const estimated =
    Math.round(Math.max(0, Number(args.offer.estimatedSavingsInr) || 0) * 100) / 100;
  // Never use the GatiCash top-up gap as "You save" — that is wallet credit, not delivery waived.
  const offerSavingsInr = quoted > 0.005 ? quoted : estimated;
  const amountInr = Math.min(gap, 500);
  return {
    key: missedOfferKeyForCandidate(
      { source: "platform", id: args.offer.id },
      args.merchantId
    ),
    amountInr,
    offerSavingsInr,
    unlockGapInr: gap,
    headline: `Add ₹${amountInr} to GatiCash & unlock free delivery`,
    subline: `You're ₹${gap} away · save ₹${offerSavingsInr} on delivery`,
    offerId: args.offer.id,
    offerSource: "platform",
    offerKind: "FREE_DELIVERY",
    offerTitle: title,
    addItemsHint: formatAddMoreForFreeDelivery(gap),
  };
}
