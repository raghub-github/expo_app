import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckoutOffersResponse } from "@/services/billing.service";
import { estimateOfferSavings } from "@/lib/estimateOfferSavings";

export type CouponAvailablePrompt = {
  key: string;
  savingsInr: number | null;
  /** Value passed to checkout apply handlers (coupon code or offer code). */
  couponCode: string;
  /** Human-readable offer name from API. */
  offerTitle: string;
  /** Subtitle under the savings headline. */
  promoLine: string;
  description?: string;
  applyType: "coupon" | "merchant" | "platform";
  merchantOfferId?: number;
  platformOfferId?: number;
  merchantOfferTitle?: string | null;
};

type EligibleSnapshot = {
  cartSubtotal: number;
  keys: Set<string>;
  candidates: Map<string, CouponAvailablePrompt>;
};

function resolveSavingsInr(
  estimated: number | null | undefined,
  description: string,
  cartSubtotal: number,
  discountType?: string | null
): number | null {
  if (estimated != null && estimated > 0) return Math.round(estimated);
  return estimateOfferSavings(description, cartSubtotal, discountType);
}

function buildEligibleSnapshot(
  data: CheckoutOffersResponse,
  cartSubtotal: number
): EligibleSnapshot {
  const keys = new Set<string>();
  const candidates = new Map<string, CouponAvailablePrompt>();

  for (const c of data.coupons ?? []) {
    const key = `coupon:${c.code.toUpperCase()}`;
    keys.add(key);
    candidates.set(key, {
      key,
      savingsInr: resolveSavingsInr(c.estimatedSavingsInr, c.description, cartSubtotal, c.discountType),
      couponCode: c.code,
      offerTitle: c.code,
      promoLine: `with coupon '${c.code}'`,
      description: c.description,
      applyType: "coupon",
    });
  }

  for (const m of data.merchantOffers ?? []) {
    const key = `merchant:${m.id}`;
    keys.add(key);
    const couponCode = (m.requiresCouponCode ?? m.title).trim() || m.title;
    const promoLine = m.requiresCouponCode?.trim()
      ? `with coupon '${m.requiresCouponCode.trim()}'`
      : `with offer '${m.title}'`;
    candidates.set(key, {
      key,
      savingsInr: resolveSavingsInr(m.estimatedSavingsInr, m.summary, cartSubtotal),
      couponCode,
      offerTitle: m.title,
      promoLine,
      description: m.summary,
      applyType: "merchant",
      merchantOfferId: m.id,
      merchantOfferTitle: m.title,
    });
  }

  for (const p of data.platformOffers ?? []) {
    const key = `platform:${p.id}`;
    keys.add(key);
    const name = (p.name ?? `Offer ${p.id}`).trim();
    candidates.set(key, {
      key,
      savingsInr: resolveSavingsInr(p.estimatedSavingsInr, p.summary, cartSubtotal),
      couponCode: name,
      offerTitle: name,
      promoLine: p.name?.trim() ? `with ${p.name.trim()}` : "with this GatiMitra offer",
      description: p.summary,
      applyType: "platform",
      platformOfferId: p.id,
    });
  }

  return { cartSubtotal, keys, candidates };
}

function pickBestPrompt(
  keys: string[],
  candidates: Map<string, CouponAvailablePrompt>
): CouponAvailablePrompt | null {
  const list = keys
    .map((k) => candidates.get(k))
    .filter((p): p is CouponAvailablePrompt => p != null);
  if (list.length === 0) return null;

  list.sort((a, b) => {
    const sa = a.savingsInr ?? 0;
    const sb = b.savingsInr ?? 0;
    if (sb !== sa) return sb - sa;
    if (a.applyType === "merchant" && b.applyType !== "merchant") return -1;
    if (b.applyType === "merchant" && a.applyType !== "merchant") return 1;
    return 0;
  });

  return list[0];
}

/** Best currently eligible checkout offer for inline cart banners. */
export function resolveBestEligibleCheckoutOffer(
  offersData: CheckoutOffersResponse | undefined,
  cartSubtotal: number
): CouponAvailablePrompt | null {
  if (!offersData || cartSubtotal <= 0) return null;
  const snapshot = buildEligibleSnapshot(offersData, cartSubtotal);
  return pickBestPrompt([...snapshot.keys], snapshot.candidates);
}

/** Zomato-style unlock copy above the store Continue cart bar — no price amounts. */
export function formatStoreCartOfferBannerText(_prompt: CouponAvailablePrompt): string {
  return "A Special Offer Has Been Unlocked. Applicable discounts will be applied during checkout.";
}

export function useCouponAvailablePrompt(options: {
  offersData: CheckoutOffersResponse | undefined;
  offersFetching: boolean;
  cartSubtotal: number;
  hasAppliedOffer: boolean;
  blocked?: boolean;
}) {
  const { offersData, offersFetching, cartSubtotal, hasAppliedOffer, blocked = false } = options;

  const [prompt, setPrompt] = useState<CouponAvailablePrompt | null>(null);
  const [visible, setVisible] = useState(false);

  const prevSnapshotRef = useRef<EligibleSnapshot | null>(null);
  const dismissedKeysRef = useRef(new Set<string>());
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((key?: string) => {
    const k = key ?? prompt?.key;
    if (k) dismissedKeysRef.current.add(k);
    setVisible(false);
    setPrompt(null);
  }, [prompt?.key]);

  const clearPrompt = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    setVisible(false);
    setPrompt(null);
  }, []);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (blocked || hasAppliedOffer || offersFetching || !offersData) return;

    const snapshot = buildEligibleSnapshot(offersData, cartSubtotal);
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = snapshot;

    if (!prev) return;

    if (cartSubtotal <= prev.cartSubtotal + 0.005) return;

    const newlyEligible = [...snapshot.keys].filter(
      (k) => !prev.keys.has(k) && !dismissedKeysRef.current.has(k)
    );
    if (newlyEligible.length === 0) return;

    const best = pickBestPrompt(newlyEligible, snapshot.candidates);
    if (!best) return;

    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    showTimerRef.current = setTimeout(() => {
      setPrompt(best);
      setVisible(true);
      showTimerRef.current = null;
    }, 350);
  }, [offersData, offersFetching, cartSubtotal, hasAppliedOffer, blocked]);

  return {
    prompt,
    visible,
    dismiss,
    clearPrompt,
  };
}
