/**
 * Backfill public_slug for approved active merchant stores.
 * Run after applying drizzle/0215_merchant_stores_public_slug.sql
 *
 * Usage (from cxsite): npx tsx scripts/backfill-store-public-slugs.ts
 */
import { createClient } from '@supabase/supabase-js'
import {
  buildSlugForStoreRow,
  disambiguateStoreSlug,
} from '../lib/storeSlug'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(url, key)

async function main() {
  const { data: allSlugs } = await db
    .from('merchant_stores')
    .select('public_slug')
    .not('public_slug', 'is', null)

  const taken = new Set(
    (allSlugs ?? [])
      .map((r) => String(r.public_slug ?? '').trim())
      .filter(Boolean)
  )

  const { data: stores, error } = await db
    .from('merchant_stores')
    .select(
      'id, store_id, store_name, store_display_name, city, landmark, approval_status, status, is_active, public_slug'
    )
    .is('deleted_at', null)
    .eq('approval_status', 'APPROVED')
    .eq('status', 'ACTIVE')
    .eq('is_active', true)
    .is('public_slug', null)

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  let updated = 0
  for (const row of stores ?? []) {
    const base = buildSlugForStoreRow(row)
    const slug = disambiguateStoreSlug(
      base,
      taken,
      row.landmark ?? null
    )
    taken.add(slug)

    const { error: upErr } = await db
      .from('merchant_stores')
      .update({ public_slug: slug })
      .eq('id', row.id)
      .is('public_slug', null)

    if (upErr) {
      console.warn(`Failed ${row.store_id}:`, upErr.message)
      continue
    }
    console.log(`${row.store_id} → ${slug}`)
    updated += 1
  }

  console.log(`Backfill complete. Updated ${updated} store(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
