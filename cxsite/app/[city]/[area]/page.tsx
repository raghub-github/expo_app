import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import BrandsByLocationView from '@/components/home/BrandsByLocationView'
import LocationFromUrlSync from '@/components/location-search/LocationFromUrlSync'
import { slugToTitle } from '@/lib/slug'

type Props = { params: Promise<{ city: string; area: string }>; searchParams: Promise<{ category?: string }> }

function isValidSlug(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && /^[a-z0-9\-]+$/.test(s)
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { city, area } = await params
  const { category } = await searchParams
  if (!isValidSlug(city) || !isValidSlug(area)) {
    return { title: 'Brands | GatiMitra' }
  }
  const cityDisplay = slugToTitle(city)
  const areaDisplay = slugToTitle(area)
  const title = areaDisplay
    ? `Brands in ${areaDisplay}, ${cityDisplay} | GatiMitra`
    : `Brands in ${cityDisplay} | GatiMitra`
  const base = process.env.NEXT_PUBLIC_SITE_URL || ''
  const canonical = base ? `${base}/${city}/${area}${category ? `?category=${category}` : ''}` : undefined
  return {
    title,
    description: `Explore verified brands in ${areaDisplay ? `${areaDisplay}, ` : ''}${cityDisplay}. Food, fashion, pharma & more.`,
    ...(canonical && { alternates: { canonical } }),
  }
}

export default async function CityAreaPage({ params, searchParams }: Props) {
  const { city, area } = await params
  const { category } = await searchParams

  if (!isValidSlug(city) || !isValidSlug(area)) {
    redirect('/')
  }

  return (
    <main>
      <LocationFromUrlSync citySlug={city} areaSlug={area} />
      <Header />
      <BrandsByLocationView citySlug={city} areaSlug={area} categorySlug={category ?? null} />
      <Footer />
    </main>
  )
}
