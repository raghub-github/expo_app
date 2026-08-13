import type { QueryClient } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { emitPartnerStoreOperationsRefresh } from '@/lib/partnerStoreOperationsRefresh';
import { clearStoreOperationsCache } from '@/lib/partner-store-operations-cache';

/**
 * After outlet timings change, force dashboard / top-bar "Today's hours"
 * to refresh immediately (no full page reload).
 */
export function notifyPartnerTodaySlotsUpdated(
  queryClient: QueryClient,
  storeId: string | null | undefined
): void {
  const sid = typeof storeId === 'string' ? storeId.trim() : '';
  if (!sid) return;
  clearStoreOperationsCache(sid);
  void queryClient.invalidateQueries({ queryKey: merchantKeys.storeOperations(sid) });
  void queryClient.refetchQueries({ queryKey: merchantKeys.storeOperations(sid), type: 'active' });
  emitPartnerStoreOperationsRefresh(sid);
}
