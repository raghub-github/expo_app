import { supabase } from '@/lib/supabase'
import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { looksLikeInternalStoreId } from '@/lib/storeSlug'

export type MerchantStoreRow = Record<string, unknown> & {
  id: number
  store_id: string
  public_slug?: string | null
  store_name?: string | null
  store_display_name?: string | null
  city?: string | null
  approval_status?: string | null
  is_active?: boolean | null
  status?: string | null
  deleted_at?: string | null
}

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

/** Resolve a merchant store from a public slug, legacy store_id, or numeric PK. */
export async function resolveMerchantStore(
  identifier: string
): Promise<MerchantStoreRow | null> {
  const param = String(identifier ?? '').trim()
  if (!param) return null

  const db = getDb()

  const bySlug = await db
    .from('merchant_stores')
    .select('*')
    .eq('public_slug', param)
    .is('deleted_at', null)
    .maybeSingle()
  if (bySlug.data) return bySlug.data as MerchantStoreRow

  if (looksLikeInternalStoreId(param)) {
    const byStoreId = await db
      .from('merchant_stores')
      .select('*')
      .eq('store_id', param)
      .is('deleted_at', null)
      .maybeSingle()
    if (byStoreId.data) return byStoreId.data as MerchantStoreRow
  }

  if (/^\d+$/.test(param)) {
    const byId = await db
      .from('merchant_stores')
      .select('*')
      .eq('id', parseInt(param, 10))
      .is('deleted_at', null)
      .maybeSingle()
    if (byId.data) return byId.data as MerchantStoreRow
  }

  return null
}

export function isStorePubliclyVisible(row: MerchantStoreRow): boolean {
  if (row.deleted_at) return false
  const approval = String(row.approval_status ?? '').toUpperCase()
  const status = String(row.status ?? '').toUpperCase()
  return approval === 'APPROVED' && status === 'ACTIVE' && row.is_active !== false
}

export function storeDisplayName(row: MerchantStoreRow): string {
  return String(row.store_display_name ?? row.store_name ?? 'Restaurant').trim()
}
