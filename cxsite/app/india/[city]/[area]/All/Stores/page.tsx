import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AroundYouPage from '@/components/around-you/AroundYouPage'
import LocationFromUrlSync from '@/components/location-search/LocationFromUrlSync'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'

function isValidSlug(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && /^[a-z0-9\-]+$/.test(s)
}

export default async function IndiaCityAreaStoresPage({
  params,
}: {
  params: Promise<{ city: string; area: string }>
}) {
  const { city, area } = await params
  if (!isValidSlug(city) || !isValidSlug(area)) {
    redirect('/india/All/Stores')
  }

  return (
    <main>
      <LocationFromUrlSync citySlug={city} areaSlug={area} variant="indiaAllStores" />
      <Header />
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center bg-[#f3f3f3]">
            <GatiMitraSpinner message="Loading…" />
          </div>
        }
      >
        <AroundYouPage />
      </Suspense>
      <Footer />
    </main>
  )
}
