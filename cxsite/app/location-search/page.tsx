import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import LocationSearchBar from '@/components/location-search/LocationSearchBar'
import LocationSearchCategories from '@/components/location-search/LocationSearchCategories'
import { fullPageTitle, pageTitleSegment } from '@/lib/pageTitle'
import { GATIMITRA_TAGLINE } from '@/lib/brandTagline'

export const metadata: Metadata = {
  title: pageTitleSegment('Find Service Near You'),
  description:
    `Set your location and discover food delivery, parcel delivery, and ride services near you. GatiMitra – ${GATIMITRA_TAGLINE}.`,
  openGraph: {
    title: fullPageTitle('Find Service Near You'),
    description:
      'Set your location and discover food delivery, parcel delivery, and ride services near you.',
  },
}

export default function LocationSearchPage() {
  return (
    <main className="min-h-screen flex flex-col bg-bg">
      <Header />
      <section className="flex-1 relative">
        <div className="absolute inset-0 overflow-hidden rounded-b-[60px] md:rounded-b-[90px]">
          <div
            className="absolute inset-0 opacity-95"
            style={{
              background:
                'linear-gradient(135deg, rgba(75, 42, 212, 0.12), rgba(22, 194, 165, 0.1)), url("/img/bg.png") center/cover no-repeat',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage: 'url(https://www.transparenttextures.com/patterns/light-sketch.png)',
            }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 md:py-16 lg:py-20">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text mb-3">
              Find service near you
            </h1>
            <p className="text-text-light text-base sm:text-lg max-w-xl mx-auto">
              Set your location to see delivery and ride options in your area.
            </p>
          </div>

          <div className="mb-14 md:mb-18">
            <LocationSearchBar />
          </div>

          <LocationSearchCategories />
        </div>
      </section>
      <Footer />
    </main>
  )
}
