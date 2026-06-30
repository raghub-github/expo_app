import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import LandingHero from '@/components/home/LandingHero'
import Footer from '@/components/layout/Footer'
import BrandsByLocationView from '@/components/home/BrandsByLocationView'
import LocationFromUrlSync from '@/components/location-search/LocationFromUrlSync'
import { slugToTitle } from '@/lib/slug'
import { pageTitleSegment, fullPageTitle } from '@/lib/pageTitle'

type Props = {
  params: Promise<{ city: string; area: string }>
  searchParams: Promise<{ category?: string }>
}

function isValidSlug(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && /^[a-z0-9\-]+$/.test(s)
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { city, area } = await params
  const { category } = await searchParams
  if (!isValidSlug(city) || !isValidSlug(area)) {
    return { title: pageTitleSegment('Brands') }
  }
  const cityDisplay = slugToTitle(city)
  const areaDisplay = slugToTitle(area)
  const segment = category ? `${slugToTitle(category)} Brands` : 'Brands'
  const base = process.env.NEXT_PUBLIC_SITE_URL || ''
  const canonical = base ? `${base}/india/${city}/${area}/All${category ? `?category=${category}` : ''}` : undefined
  return {
    title: pageTitleSegment(segment),
    description: `Explore verified brands in ${areaDisplay ? `${areaDisplay}, ` : ''}${cityDisplay}. Food, fashion, pharma & more.`,
    ...(canonical && { alternates: { canonical } }),
    openGraph: { title: fullPageTitle(segment) },
  }
}

export default async function IndiaCityAreaAllPage({ params, searchParams }: Props) {
  const { city, area } = await params
  const { category } = await searchParams

  if (!isValidSlug(city) || !isValidSlug(area)) {
    redirect('/')
  }

  return (
    <main className="landing-page-bg">
      <LocationFromUrlSync citySlug={city} areaSlug={area} variant="indiaAll" />
      <Header />
      <LandingHero />
      <BrandsByLocationView citySlug={city} areaSlug={area} categorySlug={category ?? null} />
      <Footer />
    </main>
  )
}
