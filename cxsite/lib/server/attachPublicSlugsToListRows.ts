import { getSupabaseServiceRole } from '@/lib/supabaseServiceRole'
import { supabase } from '@/lib/supabase'
import { ensureStorePublicSlug } from '@/lib/server/ensureStorePublicSlug'
import type { MerchantStoreRow } from '@/lib/server/resolveMerchantStore'
import type { WebRestaurantRow } from '@/lib/server/fetchMerchantStores'

function getDb() {
  return getSupabaseServiceRole() ?? supabase
}

/** Ensure every list row has a public_slug before building customer links. */
export async function attachPublicSlugsToListRows(
  rows: WebRestaurantRow[]
): Promise<WebRestaurantRow[]> {
  const needsSlug = rows.filter((r) => !String(r.public_slug ?? '').trim())
  if (needsSlug.length === 0) return rows

  const db = getDb()
  const slugById = new Map<number, string>()

  await Promise.all(
    needsSlug.map(async (row) => {
      const { data } = await db
        .from('merchant_stores')
        .select('*')
        .eq('id', row.id)
        .maybeSingle()
      if (!data) return
      const slug = await ensureStorePublicSlug(data as MerchantStoreRow)
      if (slug) slugById.set(row.id, slug)
    })
  )

  return rows.map((row) => {
    const slug = slugById.get(row.id)
    return slug ? { ...row, public_slug: slug } : row
  })
}
