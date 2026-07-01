import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
import { parsePgTimestamp } from "@/lib/parsePgTimestamp";
import type {
  WalletSummary,
  LedgerEntry,
  PayoutQuote,
  PayoutResult,
} from "@gatimitra/contracts";

const getBase = () => getConfig().apiBaseUrl;

export type { WalletSummary, LedgerEntry, PayoutQuote, PayoutResult };

export interface LedgerResponse {
  entries: LedgerEntry[];
  total: number;
}

export type PayoutSettlementSummary = {
  netOrderValue: number;
  itemSubtotal: number;
  packagingCharges: number;
  restaurantDiscounts: number;
  couponOfferDiscount: number;
  percentageFlatOfferDiscount: number;
  comboOfferDiscount: number;
  freeDeliveryOfferDiscount: number;
  orderDeductions: number;
  mechanismFee: number;
  customerCompensation: number;
  estimatedPayout: number;
  orderCount: number;
  deliveredOrderCount: number;
  rejectedOrderCount: number;
};

function mapPayoutSettlement(raw: Record<string, unknown>): PayoutSettlementSummary {
  return {
    netOrderValue: Number(raw.net_order_value ?? 0),
    itemSubtotal: Number(raw.item_subtotal ?? 0),
    packagingCharges: Number(raw.packaging_charges ?? 0),
    restaurantDiscounts: Number(raw.restaurant_discounts ?? 0),
    couponOfferDiscount: Number(raw.coupon_offer_discount ?? 0),
    percentageFlatOfferDiscount: Number(raw.percentage_flat_offer_discount ?? 0),
    comboOfferDiscount: Number(raw.combo_offer_discount ?? 0),
    freeDeliveryOfferDiscount: Number(raw.free_delivery_offer_discount ?? 0),
    orderDeductions: Number(raw.order_deductions ?? 0),
    mechanismFee: Number(raw.mechanism_fee ?? 0),
    customerCompensation: Number(raw.customer_compensation ?? 0),
    estimatedPayout: Number(raw.estimated_payout ?? 0),
    orderCount: Number(raw.order_count ?? 0),
    deliveredOrderCount: Number(raw.delivered_order_count ?? 0),
    rejectedOrderCount: Number(raw.rejected_order_count ?? 0),
  };
}

export async function fetchWalletSummary(storeId: number, token: string): Promise<WalletSummary> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/wallet`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to load wallet");
  }
  const data = await res.json();
  return data as WalletSummary;
}

export async function fetchLedger(
  storeId: number,
  token: string,
  opts?: { limit?: number; offset?: number; from?: string; to?: string; direction?: string; category?: string }
): Promise<LedgerResponse> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.direction) params.set("direction", opts.direction);
  if (opts?.category) params.set("category", opts.category);
  const qs = params.toString();
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/wallet/ledger${qs ? `?${qs}` : ""}`, token);
  if (!res.ok) throw new Error("Failed to load ledger");
  const data = await res.json();
  const rawEntries = (data as { entries?: unknown[] }).entries ?? [];
  const entries = rawEntries.map((row) => {
    const e = row as LedgerEntry & { createdAt?: unknown };
    const created = parsePgTimestamp(e.created_at ?? e.createdAt);
    return {
      ...e,
      created_at: created ? created.toISOString() : String(e.created_at ?? e.createdAt ?? ""),
    };
  });
  return { entries, total: (data as { total?: number }).total ?? entries.length };
}

export async function fetchPayoutSettlement(
  storeId: number,
  token: string,
  from: Date,
  to: Date,
): Promise<PayoutSettlementSummary> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/wallet/payout-settlement?${params}`,
    token,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load settlement");
  }
  const data = await res.json();
  const settlement = (data as { settlement?: Record<string, unknown> }).settlement ?? {};
  return mapPayoutSettlement(settlement);
}

export async function fetchPayoutQuote(storeId: number, amount: number, token: string): Promise<PayoutQuote> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/payout-quote?amount=${amount}`, token);
  if (!res.ok) throw new Error("Failed to load quote");
  const data = await res.json();
  return data as PayoutQuote;
}

export async function createPayoutRequest(
  storeId: number,
  amount: number,
  bankAccountId: number,
  token: string
): Promise<PayoutResult> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/payout-request`, token, {
    method: "POST",
    body: JSON.stringify({ amount, bank_account_id: bankAccountId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Withdrawal failed");
  }
  const data = await res.json();
  return data as PayoutResult;
}
