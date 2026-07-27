import type { Offer } from "@/services/offersApi";

export function formatOfferInr(n: number): string {
  if (!Number.isFinite(n)) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 1_00_000) {
    return `₹${(n / 1_00_000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `₹${(n / 1000).toFixed(1)}k`;
  }
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function getOfferAnalytics(offer: Offer) {
  const meta = (offer.offer_metadata ?? {}) as Record<string, unknown>;
  const orders = Number(meta.orders_delivered ?? offer.current_uses ?? 0) || 0;
  const gross = Number(meta.gross_sales ?? 0) || 0;
  const discount = Number(meta.discount_given ?? 0) || 0;
  let effPct: number | null =
    meta.effective_discount_pct != null ? Number(meta.effective_discount_pct) : null;
  if ((effPct == null || Number.isNaN(effPct)) && gross > 0 && discount > 0) {
    effPct = Math.round((discount / gross) * 1000) / 10;
  }
  if (effPct == null || Number.isNaN(effPct) || effPct <= 0) {
    // Prefer real effective rate; fall back to configured % only when no sales yet
    if (gross <= 0 && discount <= 0) {
      const p = offer.discount_percentage != null ? Number(offer.discount_percentage) : null;
      effPct = p != null && !Number.isNaN(p) ? p : 0;
    } else {
      effPct = 0;
    }
  }
  return { gross, orders, discount, effPct: effPct ?? 0 };
}

export function aggregateOffersPerformance(offers: Offer[]) {
  let gross = 0;
  let orders = 0;
  let discount = 0;
  offers.forEach((o) => {
    const a = getOfferAnalytics(o);
    gross += a.gross;
    orders += a.orders;
    discount += a.discount;
  });
  const effPct = gross > 0 ? Math.round((discount / gross) * 1000) / 10 : 0;
  return { gross, orders, discount, effPct };
}
