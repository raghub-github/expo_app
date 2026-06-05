import type { SupabaseClient } from '@supabase/supabase-js';

export type WalletBucketBalances = {
  available_balance: number;
  locked_balance: number;
  pending_balance: number;
  hold_balance: number;
  reserve_balance: number;
};

/**
 * Latest ledger balance_after per bucket — heals stale merchant_wallet summary rows.
 */
export async function deriveWalletBucketsFromLedger(
  db: SupabaseClient,
  walletId: number
): Promise<Partial<WalletBucketBalances>> {
  const { data: rows } = await db
    .from('merchant_wallet_ledger')
    .select('balance_type, balance_after, created_at, id')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(500);

  if (!rows?.length) return {};

  const latest = new Map<string, number>();
  for (const row of rows) {
    const bt = String(row.balance_type ?? 'AVAILABLE').toUpperCase();
    if (!latest.has(bt)) {
      latest.set(bt, Number(row.balance_after ?? 0));
    }
  }

  return {
    available_balance: latest.get('AVAILABLE') ?? 0,
    locked_balance: latest.get('LOCKED') ?? 0,
    pending_balance: latest.get('PENDING') ?? 0,
    hold_balance: latest.get('HOLD') ?? 0,
    reserve_balance: latest.get('RESERVE') ?? 0,
  };
}

/** Prefer ledger-derived bucket when stored summary is zero but ledger has balance. */
export function mergeWalletBuckets(
  stored: WalletBucketBalances,
  derived: Partial<WalletBucketBalances>
): WalletBucketBalances {
  const pick = (key: keyof WalletBucketBalances) => {
    const s = Number(stored[key] ?? 0);
    const d = Number(derived[key] ?? 0);
    if (Math.abs(s) < 0.005 && Math.abs(d) >= 0.005) return d;
    return s;
  };

  return {
    available_balance: pick('available_balance'),
    locked_balance: pick('locked_balance'),
    pending_balance: pick('pending_balance'),
    hold_balance: pick('hold_balance'),
    reserve_balance: pick('reserve_balance'),
  };
}
