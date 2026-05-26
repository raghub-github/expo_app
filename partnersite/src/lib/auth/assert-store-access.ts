/**
 * Resolve store by store_id (text e.g. GMMC1015), validate merchant owns it.
 * Use for menu/combos/modifier-groups etc. in partnersite.
 */
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — building this at module load fails during `next build`'s
// "Collecting page data" pass because process.env.NEXT_PUBLIC_SUPABASE_URL is
// not yet populated for routes that import this module. Defer until first
// request handler call.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'assertStoreAccess: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    )
  }
  _supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _supabase
}

export type AssertStoreResult =
  | { ok: true; storeIdNum: number }
  | { ok: false; error: string; status: number }

export async function assertStoreAccess(storeIdParam: string | null): Promise<AssertStoreResult> {
  if (!storeIdParam || String(storeIdParam).trim() === '') {
    return { ok: false, error: 'storeId required', status: 400 }
  }
  const supabaseServer = await createServerSupabaseClient()
  const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
  if (userError || !user) {
    return { ok: false, error: 'Not authenticated', status: 401 }
  }
  const validation = await validateMerchantFromSession({
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
  })
  if (!validation.isValid) {
    return { ok: false, error: validation.error ?? 'Merchant not found', status: 403 }
  }
  const { data: store, error: storeError } = await getSupabase()
    .from('merchant_stores')
    .select('id, parent_id')
    .eq('store_id', String(storeIdParam).trim())
    .single()
  if (storeError || !store?.id || !store?.parent_id) {
    return { ok: false, error: 'Store not found', status: 404 }
  }
  if (store.parent_id !== validation.merchantParentId) {
    return { ok: false, error: 'Store does not belong to this merchant', status: 403 }
  }
  return { ok: true, storeIdNum: store.id as number }
}
