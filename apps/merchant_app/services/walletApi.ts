import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
import { parsePgTimestamp } from "@/lib/parsePgTimestamp";
import type {
  WalletSummary,
  LedgerEntry,
  PayoutQuote,
  PayoutResult,
} from "@gatimitra/contracts";
import {
  mapSettlementApiResponse,
  type MerchantPayoutSettlementClient,
} from "@gatimitra/merchant-payout";

const getBase = () => getConfig().apiBaseUrl;

export type { WalletSummary, LedgerEntry, PayoutQuote, PayoutResult };

export interface LedgerResponse {
  entries: LedgerEntry[];
  total: number;
}

export type PayoutSettlementSummary = MerchantPayoutSettlementClient;

const walletSummaryInFlight = new Map<string, Promise<WalletSummary>>();

type TimedCache<T> = { at: number; data: T };
const walletSummaryCache = new Map<number, TimedCache<WalletSummary>>();
const payoutCyclesCache = new Map<number, TimedCache<unknown>>();
const payoutRequestsCache = new Map<string, TimedCache<unknown>>();
const ledgerCache = new Map<string, TimedCache<LedgerResponse>>();

/** Instant home/earnings paint — last good wallet (may be slightly stale). */
export function peekWalletSummary(storeId: number): WalletSummary | null {
  return walletSummaryCache.get(storeId)?.data ?? null;
}

export function peekPayoutCycles(storeId: number): PayoutCycleCard[] | null {
  const data = payoutCyclesCache.get(storeId)?.data;
  return Array.isArray(data) ? (data as PayoutCycleCard[]) : null;
}

export function peekPayoutRequests(
  storeId: number,
  limit = 20,
): { summary: PayoutRequestsSummary; recent: PayoutRequestListItem[] } | null {
  const data = payoutRequestsCache.get(`${storeId}:${limit}`)?.data;
  return data
    ? (data as { summary: PayoutRequestsSummary; recent: PayoutRequestListItem[] })
    : null;
}

export function peekLedger(
  storeId: number,
  opts?: { limit?: number; offset?: number; from?: string; to?: string; direction?: string; category?: string },
): LedgerResponse | null {
  const key = `${storeId}:${opts?.limit ?? 50}:${opts?.offset ?? 0}:${opts?.from ?? ""}:${opts?.to ?? ""}:${opts?.direction ?? ""}:${opts?.category ?? ""}`;
  return ledgerCache.get(key)?.data ?? null;
}

export function invalidateWalletCaches(storeId?: number): void {
  if (storeId == null) {
    walletSummaryCache.clear();
    payoutCyclesCache.clear();
    payoutRequestsCache.clear();
    ledgerCache.clear();
    return;
  }
  walletSummaryCache.delete(storeId);
  payoutCyclesCache.delete(storeId);
  for (const key of [...payoutRequestsCache.keys()]) {
    if (key.startsWith(`${storeId}:`)) payoutRequestsCache.delete(key);
  }
  for (const key of [...ledgerCache.keys()]) {
    if (key.startsWith(`${storeId}:`)) ledgerCache.delete(key);
  }
}

export async function fetchWalletSummary(storeId: number, token: string): Promise<WalletSummary> {
  const key = `${storeId}:${token.slice(-24)}`;
  const existing = walletSummaryInFlight.get(key);
  if (existing) return existing;
  const run = (async () => {
    const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/wallet`, token, {
      timeoutMs: 12_000,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error || "Failed to load wallet");
    }
    const data = await res.json();
    const summary = data as WalletSummary;
    walletSummaryCache.set(storeId, { at: Date.now(), data: summary });
    return summary;
  })();
  walletSummaryInFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (walletSummaryInFlight.get(key) === run) walletSummaryInFlight.delete(key);
  }
}

export async function fetchWalletFreezeStatus(
  storeId: number,
  token: string,
): Promise<{ isFrozen: boolean; freezeReason: string | null; status: string; frozenAt: string | null }> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/wallet/freeze`, token, {
    timeoutMs: 12_000,
  });
  if (!res.ok) {
    throw new Error(`freeze_status_${res.status}`);
  }
  const data = (await res.json()) as {
    isFrozen?: boolean;
    freezeReason?: string | null;
    status?: string;
    frozenAt?: string | null;
  };
  const status = String(data.status ?? "ACTIVE").toUpperCase();
  const isFrozen = data.isFrozen === true || status === "FROZEN";
  return {
    isFrozen,
    freezeReason: isFrozen ? data.freezeReason ?? null : null,
    status,
    frozenAt: data.frozenAt ?? null,
  };
}

export async function fetchLedger(
  storeId: number,
  token: string,
  opts?: { limit?: number; offset?: number; from?: string; to?: string; direction?: string; category?: string }
): Promise<LedgerResponse> {
  const cacheKey = `${storeId}:${opts?.limit ?? 50}:${opts?.offset ?? 0}:${opts?.from ?? ""}:${opts?.to ?? ""}:${opts?.direction ?? ""}:${opts?.category ?? ""}`;
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.direction) params.set("direction", opts.direction);
  if (opts?.category) params.set("category", opts.category);
  const qs = params.toString();
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/wallet/ledger${qs ? `?${qs}` : ""}`,
    token,
    { timeoutMs: 12_000 },
  );
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
  const result = { entries, total: (data as { total?: number }).total ?? entries.length };
  ledgerCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

export async function fetchPayoutSettlement(
  storeId: number,
  token: string,
  from: Date,
  to: Date,
  opts?: { cycleId?: number | null },
): Promise<PayoutSettlementSummary> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (opts?.cycleId != null && opts.cycleId > 0) {
    params.set("cycleId", String(opts.cycleId));
  }
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
  return mapSettlementApiResponse(settlement);
}

export type PayoutCycleCard = {
  id: number;
  status: "OPEN" | "CLOSED";
  close_reason: string | null;
  period_start: string;
  period_end: string | null;
  payout_request_id: number | null;
  net_payout: number;
  estimated_payout: number;
  order_count: number;
  /** Withdrawal principal returned in this cycle — reported, never payout value. */
  withdrawal_returned?: number;
  withdrawal_amount?: number;
  /** Admin rejection reason / bank failure reason for the closing withdrawal. */
  close_note?: string | null;
  /** PG / UTR id when the closing withdrawal was completed. */
  pg_transaction_id?: string | null;
  settlement: Record<string, unknown> | null;
};

export async function fetchPayoutCycles(
  storeId: number,
  token: string,
  limit = 50,
): Promise<PayoutCycleCard[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/wallet/payout-cycles?limit=${limit}`,
    token,
    { timeoutMs: 12_000 },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load payout cycles");
  }
  const data = await res.json();
  const cycles = ((data as { cycles?: PayoutCycleCard[] }).cycles ?? []) as PayoutCycleCard[];
  payoutCyclesCache.set(storeId, { at: Date.now(), data: cycles });
  return cycles;
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
  const idempotencyKey = `mapp_${storeId}_${bankAccountId}_${Math.round(amount * 100)}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/payout-request`, token, {
    method: "POST",
    body: JSON.stringify({ amount, bank_account_id: bankAccountId, idempotency_key: idempotencyKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as {
      error?: string;
      code?: string;
      freezeReason?: string | null;
    };
    const reason = err.freezeReason?.trim();
    throw new Error(
      err.code === "WALLET_FROZEN"
        ? reason
          ? `Withdrawals are currently disabled. Reason: ${reason}`
          : err.error || "Withdrawals are currently disabled."
        : err.error || "Withdrawal failed",
    );
  }
  const data = await res.json();
  return data as PayoutResult;
}

export type PayoutRequestsSummary = {
  paid: number;
  in_process: number;
  pending: number;
  failed: number;
  total: number;
};

export type PayoutRequestListItem = {
  id: number;
  amount: number;
  net_payout_amount: number;
  status: string;
  requested_at: string;
  completed_at: string | null;
  utr_reference: string | null;
  failure_reason: string | null;
  rejection_reason?: string | null;
  hold_reason?: string | null;
  pg_transaction_id?: string | null;
};

/** Partner Site payout-requests list parity. */
export async function fetchPayoutRequests(
  storeId: number,
  token: string,
  limit = 5,
): Promise<{ summary: PayoutRequestsSummary; recent: PayoutRequestListItem[] }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/payout-requests?limit=${limit}`,
    token,
    { timeoutMs: 12_000 },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load payouts");
  }
  const data = await res.json();
  const result = {
    summary: (data as { summary: PayoutRequestsSummary }).summary,
    recent: (data as { recent: PayoutRequestListItem[] }).recent ?? [],
  };
  payoutRequestsCache.set(`${storeId}:${limit}`, { at: Date.now(), data: result });
  return result;
}
