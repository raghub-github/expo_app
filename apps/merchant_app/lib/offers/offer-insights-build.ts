import type { Offer, OfferInsightsApiResponse } from "@/services/offersApi";
import { formatOfferTypeLabel } from "@/lib/offers/offer-lifecycle";

function parseOfferEndMs(iso: string): number {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 23, 59, 59, 999).getTime();
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function parseOfferStartMs(iso: string): number {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0).getTime();
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function offerOverlapsRange(offer: Offer, startMs: number, endMs: number): boolean {
  const from = parseOfferStartMs(offer.valid_from);
  const till = parseOfferEndMs(offer.valid_till);
  if (!from || !till) return true;
  return from <= endMs && till >= startMs;
}

export type MonthlyPoint = {
  key: string;
  label: string;
  gross: number;
  discount: number;
  orders: number;
  effPct: number;
  storeGross: number;
  storeOrders: number;
};

export type DiscountTypeRow = {
  id: string;
  label: string;
  color: string;
  gross: number;
};

export type CustomerBreakup = {
  newOrders: number;
  repeatOrders: number;
  lapsedOrders: number;
};

export type OfferInsightsSnapshot = {
  gross: number;
  discount: number;
  orders: number;
  effPct: number;
  discountPerOrder: number;
  grossPctOfStore: number | null;
  ordersPctOfStore: number | null;
  totalStoreOrders: number;
  totalStoreGross: number;
  monthly: MonthlyPoint[];
  discountTypes: DiscountTypeRow[];
  customers: CustomerBreakup;
  offerCount: number;
};

const TYPE_COLORS: Record<string, string> = {
  PERCENTAGE: "#3EB489",
  CART_PERCENTAGE: "#3EB489",
  FLAT: "#EF4444",
  CART_FLAT: "#EF4444",
  COUPON: "#8B5CF6",
  BUY_X_GET_Y: "#3B82F6",
  BUY_N_GET_M: "#3B82F6",
  BOGO: "#3B82F6",
  FREE_ITEM: "#F59E0B",
  FREE_DELIVERY: "#94A3B8",
  BUNDLE: "#94A3B8",
  TIERED: "#94A3B8",
};

/** Map real API insights (from orders) to UI snapshot. */
export function mapOfferInsightsFromApi(
  api: OfferInsightsApiResponse,
  offerCountInRange: number
): OfferInsightsSnapshot {
  const monthly: MonthlyPoint[] = (api.monthly ?? []).map((m) => ({
    key: m.key,
    label: m.label,
    gross: m.offer_gross ?? 0,
    discount: m.offer_discount ?? 0,
    orders: m.offer_orders ?? 0,
    effPct: (m.offer_gross ?? 0) > 0 ? Math.round(((m.offer_discount ?? 0) / m.offer_gross) * 1000) / 10 : 0,
    storeGross: m.store_gross ?? 0,
    storeOrders: m.store_orders ?? 0,
  }));

  const grossFromMonthly = monthly.reduce((s, m) => s + m.gross, 0);
  const discountFromMonthly = monthly.reduce((s, m) => s + m.discount, 0);
  const ordersFromMonthly = monthly.reduce((s, m) => s + m.orders, 0);

  const gross = (api.gross ?? 0) > 0 ? api.gross! : grossFromMonthly;
  const discount = (api.discount ?? 0) > 0 ? api.discount! : discountFromMonthly;
  const orders = (api.orders ?? 0) > 0 ? api.orders! : ordersFromMonthly;
  const effPct = gross > 0 ? Math.round((discount / gross) * 1000) / 10 : 0;

  const discountTypes: DiscountTypeRow[] = (api.discount_types ?? [])
    .filter((d) => (d.gross ?? 0) > 0 || (d.discount ?? 0) > 0)
    .map((d) => ({
      id: d.offer_type,
      label: formatOfferTypeLabel(d.offer_type as Parameters<typeof formatOfferTypeLabel>[0]),
      color: TYPE_COLORS[d.offer_type] ?? "#94A3B8",
      gross: d.gross ?? 0,
    }));

  return {
    gross,
    discount,
    orders,
    effPct,
    discountPerOrder: orders > 0 ? Math.round(discount / orders) : 0,
    grossPctOfStore:
      (api.total_store_sales ?? 0) > 0
        ? Math.round((gross / api.total_store_sales) * 1000) / 10
        : null,
    ordersPctOfStore:
      (api.total_store_orders ?? 0) > 0
        ? Math.round((orders / api.total_store_orders) * 1000) / 10
        : null,
    totalStoreOrders: api.total_store_orders ?? 0,
    totalStoreGross: api.total_store_sales ?? 0,
    monthly,
    discountTypes,
    customers: {
      newOrders: api.customers?.new_orders ?? 0,
      repeatOrders: api.customers?.repeat_orders ?? 0,
      lapsedOrders: api.customers?.lapsed_orders ?? 0,
    },
    offerCount: offerCountInRange,
  };
}

export function emptyOfferInsightsSnapshot(): OfferInsightsSnapshot {
  return {
    gross: 0,
    discount: 0,
    orders: 0,
    effPct: 0,
    discountPerOrder: 0,
    grossPctOfStore: null,
    ordersPctOfStore: null,
    totalStoreOrders: 0,
    totalStoreGross: 0,
    monthly: [],
    discountTypes: [],
    customers: { newOrders: 0, repeatOrders: 0, lapsedOrders: 0 },
    offerCount: 0,
  };
}
