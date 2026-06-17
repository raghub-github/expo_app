import { roundMoney } from '@/lib/wallet-types';

export type LedgerBucketSnapshotRow = {
  id: number;
  balance_type: string | null;
  balance_after: number | null;
  amount: number | null;
  direction: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function isNoBalanceImpactCancellation(metadata: Record<string, unknown> | null | undefined): boolean {
  return (
    metadata?.entry_type === 'order_cancellation' && metadata?.balance_impact === 'none'
  );
}

/**
 * Running wallet balance after each ledger row (credits add, debits subtract).
 * Informational cancellation rows do not change the balance.
 */
export function buildWithdrawableBalanceByLedgerId(
  rows: LedgerBucketSnapshotRow[]
): Map<number, number> {
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id - b.id;
  });

  let running = 0;
  const result = new Map<number, number>();

  for (const entry of sorted) {
    const meta = (entry.metadata ?? null) as Record<string, unknown> | null;

    if (!isNoBalanceImpactCancellation(meta)) {
      const amt = Number(entry.amount ?? 0);
      const dir = String(entry.direction ?? '').toUpperCase();
      if (amt > 0) {
        if (dir === 'CREDIT') running += amt;
        else if (dir === 'DEBIT') running -= amt;
      }
      running = roundMoney(Math.max(0, running));
    }

    result.set(entry.id, running);
  }

  return result;
}

export function latestRunningBalanceFromLedgerRows(rows: LedgerBucketSnapshotRow[]): number {
  if (!rows.length) return 0;
  const map = buildWithdrawableBalanceByLedgerId(rows);
  let latest = rows[0];
  for (const row of rows) {
    const ta = new Date(row.created_at).getTime();
    const tb = new Date(latest.created_at).getTime();
    if (ta > tb || (ta === tb && row.id > latest.id)) {
      latest = row;
    }
  }
  return map.get(latest.id) ?? 0;
}

export function applyWithdrawableBalanceToLedgerEntries<
  T extends { id: number; balance_after: number; metadata?: Record<string, unknown> | null }
>(entries: T[], withdrawableById: Map<number, number>): T[] {
  return entries.map((entry) => {
    const withdrawable = withdrawableById.get(entry.id);
    if (withdrawable == null) return entry;
    return {
      ...entry,
      balance_after: withdrawable,
      metadata: {
        ...(entry.metadata ?? {}),
        bucket_balance_after: entry.balance_after,
      },
    };
  });
}
