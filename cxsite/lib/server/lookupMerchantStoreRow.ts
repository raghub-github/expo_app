import { supabase } from '@/lib/supabase'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { looksLikeInternalStoreId } from '@/lib/storeSlug'

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

/**
 * Resolve merchant_stores row from URL param: public_slug, legacy store_id, or numeric PK.
 */
export async function lookupMerchantStoreRow(
  idParam: string
): Promise<Record<string, unknown> | null> {
  const param = String(idParam).trim()
  if (!param) return null

  const db = getDb()

  const bySlug = await db
    .from('merchant_stores')
    .select('*')
    .eq('public_slug', param)
    .maybeSingle()
  if (bySlug.data) return bySlug.data as Record<string, unknown>

  if (looksLikeInternalStoreId(param)) {
    const byStoreId = await db
      .from('merchant_stores')
      .select('*')
      .eq('store_id', param)
      .maybeSingle()
    if (byStoreId.data) return byStoreId.data as Record<string, unknown>
  }

  const numericId = /^\d+$/.test(param) ? parseInt(param, 10) : null
  if (numericId != null) {
    const byId = await db
      .from('merchant_stores')
      .select('*')
      .eq('id', numericId)
      .maybeSingle()
    if (byId.data) return byId.data as Record<string, unknown>
  }

  return null
}
