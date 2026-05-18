/**
 * Merchant-app client for /v1/merchant-partner/stores/:id/commission/*.
 * Wraps the active-rate / breakdown / history endpoints exposed by
 * commission.partner.routes.ts.
 */
import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const base = () => getConfig().apiBaseUrl;

export type CommissionSourceKind = "DEFAULT" | "STORE_OVERRIDE" | "SUBSCRIPTION" | "PROMOTIONAL";

export type ActiveCommission = {
  storeId: number;
  percent: number;
  sourceKind: CommissionSourceKind;
  sourceLabel: string;
  validUntil: string | null;
  resolvedAt: string;
};

export async function fetchActiveCommission(storeId: number, token: string): Promise<ActiveCommission> {
  const res = await authFetch(`${base()}/v1/merchant-partner/stores/${storeId}/commission/active`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load commission");
  }
  const json = (await res.json()) as ActiveCommission & { ok: boolean };
  return json;
}

export type CommissionBreakdownLine = {
  orderItemId: number;
  itemName: string;
  quantity: number;
  merchantBasePerUnit: string;
  customerVisiblePerUnit: string;
  commissionPercent: string;
  platformEarningPerUnit: string;
  sourceRuleKind: string;
};

export type CommissionBreakdown = {
  orderId: string;
  lines: CommissionBreakdownLine[];
  totals: { merchantBase: string; customerVisible: string; platformEarning: string };
};

export async function fetchCommissionBreakdown(
  storeId: number,
  orderId: string,
  token: string,
): Promise<CommissionBreakdown> {
  const url = `${base()}/v1/merchant-partner/stores/${storeId}/commission/breakdown?order_id=${encodeURIComponent(orderId)}`;
  const res = await authFetch(url, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load breakdown");
  }
  const json = (await res.json()) as CommissionBreakdown & { ok: boolean };
  return json;
}
