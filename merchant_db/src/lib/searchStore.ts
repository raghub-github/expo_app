import { supabase } from './supabase'
import { MerchantStore } from './merchantStore'

// Search merchant_store by store_id (mx id) or store_phones (mobile)
export const searchMerchantStore = async (query: string, searchType: 'mx_id' | 'mobile'): Promise<MerchantStore[]> => {
  let dbQuery = supabase.from('merchant_stores').select('*');
  const trimmedQuery = query.trim();
  console.log('[DEBUG] searchMerchantStore called with:', { trimmedQuery, searchType });
  if (searchType === 'mx_id') {
    // Exact match for store_id
    dbQuery = dbQuery.eq('store_id', trimmedQuery);
    console.log('[DEBUG] Searching by store_id:', trimmedQuery);
  } else if (searchType === 'mobile') {
    // Match any phone in store_phones array
    dbQuery = dbQuery.contains('store_phones', [trimmedQuery]);
    console.log('[DEBUG] Searching by store_phones contains:', trimmedQuery);
  }
  const { data, error } = await dbQuery;
  console.log('[DEBUG] Supabase response:', { data, error });
  if (error) {
    console.error('Error searching merchant_store:', error);
    return [];
  }
  return data as MerchantStore[];
}
