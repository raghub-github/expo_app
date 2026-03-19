import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
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
  return { entries: (data as any).entries ?? [], total: (data as any).total ?? 0 };
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
