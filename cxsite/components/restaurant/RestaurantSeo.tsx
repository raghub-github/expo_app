import type { Metadata } from 'next'
import { restaurantCanonicalUrl, restaurantMetaDescription, restaurantPageTitle } from '@/lib/storePublicUrl'

type RestaurantJsonLdProps = {
  name: string
  city: string
  publicSlug: string
  description?: string | null
  imageUrl?: string | null
  address?: string | null
  phone?: string | null
  rating?: number | null
  reviewCount?: number | null
  cuisines?: string[] | null
  latitude?: number | null
  longitude?: number | null
}

export function RestaurantJsonLd(props: RestaurantJsonLdProps) {
  const url = restaurantCanonicalUrl(props.publicSlug)
  const address = props.address?.trim() || undefined

  const restaurant: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: props.name,
    url,
    ...(props.description ? { description: props.description } : {}),
    ...(props.imageUrl ? { image: props.imageUrl } : {}),
    ...(props.cuisines?.length ? { servesCuisine: props.cuisines } : {}),
    ...(props.phone ? { telephone: props.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: props.city,
      ...(address ? { streetAddress: address } : {}),
      addressCountry: 'IN',
    },
    ...(props.latitude != null && props.longitude != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: props.latitude,
            longitude: props.longitude,
          },
        }
      : {}),
    ...(props.rating != null && props.reviewCount != null && props.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: props.rating,
            reviewCount: props.reviewCount,
          },
        }
      : {}),
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://gatimitra.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: props.name,
        item: url,
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurant) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  )
}

export function buildRestaurantPageMetadata(row: {
  store_display_name?: string | null
  store_name?: string | null
  city?: string | null
  store_description?: string | null
  banner_url?: string | null
  public_slug: string
}): Metadata {
  const name = String(row.store_display_name ?? row.store_name ?? 'Restaurant').trim()
  const city = String(row.city ?? '').trim()
  const canonical = restaurantCanonicalUrl(row.public_slug)
  const description = restaurantMetaDescription(name, city)
  const image = row.banner_url ?? undefined

  return {
    title: restaurantPageTitle(name, city),
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: restaurantPageTitle(name, city),
      description,
      url: canonical,
      siteName: 'GatiMitra',
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: restaurantPageTitle(name, city),
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}
