import { client as sql } from '@/lib/drizzle'
import { buildSlugForStoreRow, disambiguateStoreSlug } from '@/lib/storeSlug'

type StoreRow = {
  id: number
  store_id: string
  public_slug?: string | null
  store_name?: string | null
  store_display_name?: string | null
  city?: string | null
  landmark?: string | null
  address_line1?: string | null
  approval_status?: string | null
  status?: string | null
  is_active?: boolean | null
}

/** Generate a stable public_slug once for approved active stores. */
export async function ensureStorePublicSlug(row: StoreRow): Promise<string | null> {
  const existing = row.public_slug != null ? String(row.public_slug).trim() : ''
  if (existing) return existing

  const approval = String(row.approval_status ?? '').toUpperCase()
  const status = String(row.status ?? '').toUpperCase()
  if (approval !== 'APPROVED' || status !== 'ACTIVE' || row.is_active === false) return null

  const takenRows = await sql<{ public_slug: string }[]>`
    SELECT public_slug FROM merchant_stores WHERE public_slug IS NOT NULL
  `
  const taken = new Set(
    takenRows.map((r) => String(r.public_slug ?? '').trim()).filter(Boolean)
  )

  const base = buildSlugForStoreRow(row)
  const slug = disambiguateStoreSlug(base, taken, row.landmark ?? null)

  await sql`
    UPDATE merchant_stores
    SET public_slug = ${slug}
    WHERE id = ${row.id} AND public_slug IS NULL
  `

  return slug
}
