import { fetchStoreById, fetchStoreByName } from '@/lib/database';
import type { MerchantStore } from '@/lib/merchantStore';
import { looksLikePartnerPublicStoreId } from '@/lib/partner-orders-routes';

export async function fetchPartnerStoreRecord(storeId: string): Promise<MerchantStore | null> {
  const storeData = await fetchStoreById(storeId);
  if (storeData) return storeData as MerchantStore;
  if (looksLikePartnerPublicStoreId(storeId)) return null;
  return (await fetchStoreByName(storeId)) as MerchantStore | null;
}
