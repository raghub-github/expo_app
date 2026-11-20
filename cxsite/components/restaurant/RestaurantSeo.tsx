import type { Metadata } from 'next'
import { restaurantCanonicalUrl, restaurantMetaDescription, restaurantPageTitle } from '@/lib/storePublicUrl'

type RestaurantJsonLdProps = {
  name: string
  city: string
  publicSlug: string
  description?: string | null
  imageUrl?: string | null
  address?: string | null
  landmark?: string | null
  phone?: string | null
  rating?: number | null
  reviewCount?: number | null
  cuisines?: string[] | null
  latitude?: number | null
  longitude?: number | null
  minOrderAmount?: number | null
}

export function RestaurantJsonLd(props: RestaurantJsonLdProps) {
  const url = restaurantCanonicalUrl(props.publicSlug)
  const address = props.address?.trim() || undefined
  const landmark = props.landmark?.trim() || undefined

  const restaurant: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['Restaurant', 'FoodEstablishment', 'LocalBusiness'],
    '@id': `${url}#restaurant`,
    name: props.name,
    url,
    ...(props.description ? { description: props.description } : {}),
    ...(props.imageUrl ? { image: [props.imageUrl] } : {}),
    ...(props.cuisines?.length ? { servesCuisine: props.cuisines } : {}),
    ...(props.phone ? { telephone: props.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(address ? { streetAddress: address } : {}),
      ...(landmark ? { addressRegion: landmark } : {}),
      addressLocality: props.city || undefined,
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
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(props.minOrderAmount != null && Number(props.minOrderAmount) > 0
      ? { priceRange: `₹${Math.round(Number(props.minOrderAmount))}+` }
      : { priceRange: '₹' }),
    potentialAction: {
      '@type': 'OrderAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: url,
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
      deliveryMethod: ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet'],
    },
  }

  const breadcrumbItems = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://gatimitra.com/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Order Food',
      item: 'https://gatimitra.com/order',
    },
  ]
  if (props.city?.trim()) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: props.city.trim(),
      item: `https://gatimitra.com/restaurants`,
    })
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 4,
      name: props.name,
      item: url,
    })
  } else {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: props.name,
      item: url,
    })
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  }

  const webpage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    name: restaurantPageTitle(props.name, props.city, props.landmark),
    description: restaurantMetaDescription(props.name, props.city, props.landmark),
    isPartOf: {
      '@type': 'WebSite',
      name: 'GatiMitra',
      url: 'https://gatimitra.com/',
    },
    about: { '@id': `${url}#restaurant` },
    primaryImageOfPage: props.imageUrl || undefined,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webpage) }}
      />
    </>
  )
}

/** Crawlable SSR copy — helps Google index store pages even when UI is client-rendered. */
export function RestaurantSeoContent(props: {
  name: string
  city: string
  landmark?: string | null
  address?: string | null
  description?: string | null
  cuisines?: string[] | null
  publicSlug: string
}) {
  const place = [props.landmark?.trim(), props.city.trim()].filter(Boolean).join(', ')
  const cuisineLine =
    props.cuisines && props.cuisines.length > 0 ? props.cuisines.join(', ') : null
  return (
    <section className="sr-only" aria-hidden="false">
      <h1>
        {props.name}
        {place ? `, ${place}` : ''}
      </h1>
      <p>
        Order online from {props.name}
        {place ? ` in ${place}` : ''} on GatiMitra — menu, delivery and offers.
      </p>
      {props.address ? <address>{props.address}</address> : null}
      {cuisineLine ? <p>Cuisines: {cuisineLine}</p> : null}
      {props.description ? <p>{props.description}</p> : null}
      <p>
        Available on GatiMitra at https://gatimitra.com/restaurant/{props.publicSlug}
      </p>
    </section>
  )
}

export function buildRestaurantPageMetadata(row: {
  store_display_name?: string | null
  store_name?: string | null
  city?: string | null
  landmark?: string | null
  store_description?: string | null
  banner_url?: string | null
  cuisine_types?: string[] | null
  public_slug: string
}): Metadata {
  const name = String(row.store_display_name ?? row.store_name ?? 'Restaurant').trim()
  const city = String(row.city ?? '').trim()
  const landmark = String(row.landmark ?? '').trim()
  const canonical = restaurantCanonicalUrl(row.public_slug)
  const title = restaurantPageTitle(name, city, landmark)
  const custom = String(row.store_description ?? '').trim()
  const generated = restaurantMetaDescription(name, city, landmark)
  // Prefer crawlable “order on GatiMitra” copy; append short merchant blurb when useful.
  const description =
    custom && custom.length >= 40 && !/gatimitra/i.test(custom)
      ? `${custom.replace(/\s+/g, ' ').slice(0, 110)}. Available on GatiMitra.`
      : generated
  const image = row.banner_url ?? undefined
  const cuisines = (row.cuisine_types ?? []).filter(Boolean)
  const keywords = [
    name,
    city ? `${name} ${city}` : null,
    landmark ? `${name} ${landmark}` : null,
    city ? `order ${name} ${city}` : `order ${name} online`,
    'GatiMitra',
    'food delivery',
    ...cuisines.slice(0, 6),
  ].filter(Boolean) as string[]

  return {
    // Absolute — avoid root layout "GatiMitra | %s" doubling the brand.
    title: { absolute: title },
    description,
    keywords,
    alternates: { canonical },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'GatiMitra',
      locale: 'en_IN',
      type: 'website',
      ...(image ? { images: [{ url: image, alt: name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}
