import type { SupabaseClient } from '@supabase/supabase-js';

type LedgerRow = {
  category: string;
  reference_id: number | null;
  pg_transaction_id?: string | null;
};

/** Attach PG transaction IDs to WITHDRAWAL ledger rows (for bank reference). */
export async function enrichLedgerWithPgTransactionIds<T extends LedgerRow>(
  db: SupabaseClient,
  entries: T[]
): Promise<T[]> {
  const payoutIds = [
    ...new Set(
      entries
        .filter((e) => e.category === 'WITHDRAWAL' && e.reference_id != null && e.reference_id > 0)
        .map((e) => e.reference_id as number)
    ),
  ];
  if (payoutIds.length === 0) return entries;

  const pgByPayoutId = new Map<number, string>();

  const { data: approvalRows } = await db
    .from('payment_payout_approvals')
    .select('payout_request_id, gateway_payout_id, utr_reference')
    .eq('payout_type', 'MERCHANT')
    .in('payout_request_id', payoutIds);

  for (const row of approvalRows ?? []) {
    const id = Number(row.payout_request_id);
    const pg = (row.gateway_payout_id as string | null)?.trim()
      || (row.utr_reference as string | null)?.trim();
    if (pg) pgByPayoutId.set(id, pg);
  }

  const missing = payoutIds.filter((id) => !pgByPayoutId.has(id));
  if (missing.length > 0) {
    const { data: payoutRows } = await db
      .from('merchant_payout_requests')
      .select('id, pg_transaction_id, utr_reference')
      .in('id', missing);
    for (const row of payoutRows ?? []) {
      const pg = (row.pg_transaction_id as string | null)?.trim()
        || (row.utr_reference as string | null)?.trim();
      if (pg) pgByPayoutId.set(Number(row.id), pg);
    }
  }

  return entries.map((entry) => {
    if (entry.category !== 'WITHDRAWAL' || entry.reference_id == null) return entry;
    const pg = pgByPayoutId.get(entry.reference_id);
    return pg ? { ...entry, pg_transaction_id: pg } : entry;
  });
}
