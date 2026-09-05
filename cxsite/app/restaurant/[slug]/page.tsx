import { permanentRedirect } from 'next/navigation'
import RestaurantPage from '@/components/restaurant/RestaurantPage'
import GroceryStorePage from '@/components/grocery/GroceryStorePage'
import { RestaurantJsonLd, buildRestaurantPageMetadata } from '@/components/restaurant/RestaurantSeo'
import { ensureStorePublicSlug } from '@/lib/server/ensureStorePublicSlug'
import {
  isStorePubliclyVisible,
  resolveMerchantStore,
  storeDisplayName,
  type MerchantStoreRow,
} from '@/lib/server/resolveMerchantStore'
import { looksLikeInternalStoreId } from '@/lib/storeSlug'
import { restaurantPublicPath } from '@/lib/storePublicUrl'
import { toAbsoluteImageUrl } from '@/lib/mediaUrl'
import type { Metadata } from 'next'

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ from?: string }>
}

async function loadPublicStore(slug: string): Promise<MerchantStoreRow | null> {
  let row = await resolveMerchantStore(slug)
  if (!row) return null

  if (!row.public_slug) {
    const generated = await ensureStorePublicSlug(row)
    if (generated) {
      row = { ...row, public_slug: generated }
    }
  }

  return row
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const row = await loadPublicStore(slug)
  if (!row?.public_slug) {
    return { title: 'Restaurant Not Found | GatiMitra', robots: { index: false, follow: false } }
  }
  return buildRestaurantPageMetadata({
    store_display_name: row.store_display_name,
    store_name: row.store_name,
    city: row.city,
    store_description: row.store_description as string | null,
    banner_url: toAbsoluteImageUrl((row.banner_url as string | null) ?? null) ?? undefined,
    public_slug: String(row.public_slug),
  })
}

export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const row = await loadPublicStore(slug)

  const publicSlug = row?.public_slug ? String(row.public_slug).trim() : ''

  if (row && publicSlug && (looksLikeInternalStoreId(slug) || /^\d+$/.test(slug)) && publicSlug !== slug) {
    permanentRedirect(restaurantPublicPath(publicSlug))
  }

  const renderSlug = publicSlug || slug
  const name = row ? storeDisplayName(row) : 'Store'
  const isGroceryStore = String(row?.store_type ?? '').toUpperCase() === 'GROCERY'
  const visible = row ? isStorePubliclyVisible(row) : false
  const phones = row?.store_phones as string[] | string | null | undefined
  const phone =
    Array.isArray(phones) && phones.length > 0
      ? phones[0]
      : typeof phones === 'string'
        ? phones
        : null

  return (
    <>
      {row && visible && publicSlug ? (
        <RestaurantJsonLd
          name={name}
          city={String(row.city ?? '')}
          publicSlug={publicSlug}
          description={(row.store_description as string | null) ?? null}
          imageUrl={toAbsoluteImageUrl((row.banner_url as string | null) ?? null)}
          address={(row.full_address as string | null) ?? null}
          phone={phone}
          cuisines={(row.cuisine_types as string[] | null) ?? null}
          latitude={row.latitude != null ? Number(row.latitude) : null}
          longitude={row.longitude != null ? Number(row.longitude) : null}
        />
      ) : null}
      {isGroceryStore ? (
        <GroceryStorePage storeSlug={renderSlug} entryFrom={sp.from} />
      ) : (
        <RestaurantPage restaurantId={renderSlug} entryFrom={sp.from} />
      )}
    </>
  )
}
