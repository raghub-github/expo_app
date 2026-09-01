import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { supabase } from '@/lib/supabase'
import {
  buildSlugForStoreRow,
  disambiguateStoreSlug,
} from '@/lib/storeSlug'
import type { MerchantStoreRow } from '@/lib/server/resolveMerchantStore'

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

/**
 * Ensure an approved public store has a stable public_slug.
 * Slugs are generated once and never regenerated when the store name changes.
 */
export async function ensureStorePublicSlug(
  row: MerchantStoreRow
): Promise<string | null> {
  const existing = row.public_slug != null ? String(row.public_slug).trim() : ''
  if (existing) return existing

  const approval = String(row.approval_status ?? '').toUpperCase()
  const status = String(row.status ?? '').toUpperCase()
  if (approval !== 'APPROVED' || status !== 'ACTIVE' || row.is_active === false) return null
  if (row.deleted_at) return null

  const db = getDb()
  const base = buildSlugForStoreRow(row)

  const { data: takenRows } = await db
    .from('merchant_stores')
    .select('public_slug')
    .not('public_slug', 'is', null)

  const taken = new Set(
    (takenRows ?? [])
      .map((r) => String((r as { public_slug?: string }).public_slug ?? '').trim())
      .filter(Boolean)
  )

  const slug = disambiguateStoreSlug(
    base,
    taken,
    row.landmark ?? null
  )

  const { error } = await db
    .from('merchant_stores')
    .update({ public_slug: slug })
    .eq('id', row.id)
    .is('public_slug', null)

  if (error) {
    console.warn('[ensureStorePublicSlug] update failed:', error.message)
    return slug
  }

  return slug
}
