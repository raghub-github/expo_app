import { supabase } from './supabase';

export interface MerchantStore {
  id: number;
  store_id: string;
  parent_id: number;
  store_name: string;
  store_display_name?: string;
  store_description?: string;
  store_email?: string;
  store_phones?: string[];
  full_address: string;
  landmark?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  logo_url?: string;
  banner_url?: string;
  gallery_images?: string[];
  cuisine_types?: string[];
  food_categories?: string[];
  avg_preparation_time_minutes?: number;
  min_order_amount?: number;
  delivery_radius_km?: number;
  is_pure_veg?: boolean;
  accepts_online_payment?: boolean;
  accepts_cash?: boolean;
  status: string;
  approval_status: string;
  approval_reason?: string;
  approved_by?: number;
  approved_at?: string;
  rejected_reason?: string;
  current_onboarding_step?: number;
  onboarding_completed?: boolean;
  onboarding_completed_at?: string;
  is_active?: boolean;
  is_accepting_orders?: boolean;
  is_available?: boolean;
  last_activity_at?: string;
  deleted_at?: string;
  deleted_by?: number;
  delist_reason?: string;
  delisted_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: number;
  updated_by?: number;
  store_type?: string;
  operational_status?: string;
  parent_merchant_id?: string;
  am_name?: string;
  am_mobile?: string;
  am_email?: string;
  owner_name?: string;
}

export const fetchStoresByManager = async (am_mobile: string): Promise<MerchantStore[]> => {
  console.log('DEBUG: Querying merchant_stores for am_mobile:', am_mobile);
  const { data, error } = await supabase
    .from('merchant_stores')
    .select('*')
    .eq('am_mobile', am_mobile);
  if (error) {
    console.error('Error fetching stores for manager:', error, JSON.stringify(error));
    // Try fallback: fetch all stores to debug RLS or data issues
    const fallback = await supabase.from('merchant_stores').select('*').limit(5);
    console.log('DEBUG: Fallback fetch all stores:', fallback.data, fallback.error);
    return [];
  }
  console.log('DEBUG: Fetched stores:', data);
  return (data as MerchantStore[]) || [];
};
