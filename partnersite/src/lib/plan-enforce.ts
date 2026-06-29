import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

function getDb(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Re-evaluates plan locks for a store after subscription changes.
 * Non-blocking — logs warnings on failure.
 */
export async function enforcePlanLimitsForStoreNumericId(storeNumericId: number): Promise<void> {
  if (!Number.isFinite(storeNumericId) || storeNumericId <= 0) return;
  try {
    const db = getDb();
    const { error } = await db.rpc('enforce_plan_limits', { p_store_id: storeNumericId });
    if (error) {
      console.warn('[plan-enforce] enforce_plan_limits failed:', error.message);
    }
  } catch (err) {
    console.warn('[plan-enforce] unexpected error:', err);
  }
}

/**
 * Resolve public store_id (GMMC…) to numeric id and enforce limits.
 */
export async function enforcePlanLimitsForPublicStoreId(publicStoreId: string): Promise<void> {
  const trimmed = publicStoreId?.trim();
  if (!trimmed) return;
  try {
    const db = getDb();
    const { data: store } = await db
      .from('merchant_stores')
      .select('id')
      .eq('store_id', trimmed)
      .maybeSingle();
    if (store?.id) {
      await enforcePlanLimitsForStoreNumericId(store.id);
    }
  } catch (err) {
    console.warn('[plan-enforce] store lookup failed:', err);
  }
}
