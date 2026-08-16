import { fetchStoreById, fetchStoreByName } from '@/lib/database';
import type { MerchantStore } from '@/lib/merchantStore';
import { looksLikePartnerPublicStoreId } from '@/lib/partner-orders-routes';

const inflight = new Map<string, Promise<MerchantStore | null>>();

export async function fetchPartnerStoreRecord(storeId: string): Promise<MerchantStore | null> {
  const key = storeId.trim();
  if (!key) return null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    try {
      const storeData = await fetchStoreById(key);
      if (storeData) return storeData as MerchantStore;
      if (looksLikePartnerPublicStoreId(key)) return null;
      return (await fetchStoreByName(key)) as MerchantStore | null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
}
