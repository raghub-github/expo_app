import { fetchBackend } from '@/lib/fetch-backend';

type EngineWalletSummary = Record<string, unknown> & {
  success?: boolean;
  wallet_id?: number;
  available_balance?: number;
  withdrawable_balance?: number;
};

type EnginePayoutResult = {
  success?: boolean;
  error?: string;
  code?: string;
  freezeReason?: string | null;
  payout_request_id?: number;
  amount?: number;
  commission_percentage?: number;
  commission_amount?: number;
  net_payout_amount?: number;
  status?: string;
  requested_at?: string;
  hold_ledger_id?: number | null;
  idempotent?: boolean;
};

function internalSecret(): string | null {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
  return secret || null;
}

/**
 * Partner Site → Fastify merchant wallet engine (single source of truth).
 * Auth is session-checked by the Next route; this hop is gated by X-Internal-Secret.
 */
export async function fetchMerchantWalletFromEngine(
  storeInternalId: number,
  opts?: { lite?: boolean; reconcile?: boolean },
): Promise<EngineWalletSummary | null> {
  const secret = internalSecret();
  if (!secret) return null;
  const qs = new URLSearchParams();
  if (opts?.lite) qs.set('lite', '1');
  if (opts?.reconcile) qs.set('reconcile', '1');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetchBackend(`/v1/internal/merchant/stores/${storeInternalId}/wallet${suffix}`, {
    method: 'GET',
    headers: { 'X-Internal-Secret': secret },
    timeoutMs: 12_000,
  });
  if (!res?.ok) return null;
  try {
    const data = (await res.json()) as EngineWalletSummary;
    if (!data || data.success === false) return null;
    return data;
  } catch {
    return null;
  }
}

export async function createMerchantPayoutViaEngine(
  storeInternalId: number,
  amount: number,
  bankAccountId: number,
  source: 'partnersite' | 'dashboard' = 'partnersite',
): Promise<{ ok: boolean; status: number; data: EnginePayoutResult }> {
  const secret = internalSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Withdrawal engine unavailable' },
    };
  }
  const res = await fetchBackend(`/v1/internal/merchant/stores/${storeInternalId}/payout-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': secret,
    },
    body: JSON.stringify({
      amount,
      bank_account_id: bankAccountId,
      source,
    }),
    timeoutMs: 20_000,
  });
  if (!res) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Withdrawal engine unreachable' },
    };
  }
  let data: EnginePayoutResult = {};
  try {
    data = (await res.json()) as EnginePayoutResult;
  } catch {
    data = { success: false, error: 'Withdrawal engine returned an invalid response' };
  }
  return { ok: res.ok, status: res.status, data };
}
