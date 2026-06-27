import type { Metadata } from 'next'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import LocationSearchBar from '@/components/location-search/LocationSearchBar'

export const metadata: Metadata = {
  title: 'Find Service Near You | GatiMitra',
  description:
    'Set your location and discover food delivery, parcel delivery, and ride services near you. GatiMitra – Moving India Forward.',
  openGraph: {
    title: 'Find Service Near You | GatiMitra',
    description:
      'Set your location and discover food delivery, parcel delivery, and ride services near you.',
  },
}

const categories = [
  {
    title: 'Food Delivery',
    href: '/order',
    icon: 'fa-utensils',
    short: 'Order food',
  },
  {
    title: 'Parcel',
    href: '/courier',
    icon: 'fa-shipping-fast',
    short: 'Send parcels',
  },
  {
    title: 'Ride',
    href: '/ride',
    icon: 'fa-motorcycle',
    short: 'Book a ride',
  },
  {
    title: 'Near Me',
    href: '/restaurants',
    icon: 'fa-map-marker-alt',
    short: 'Explore nearby',
  },
]

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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {categories.map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-white/90 backdrop-blur shadow-md border border-gray-100 hover:shadow-lg hover:border-purple/20 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-purple-light flex items-center justify-center mb-3">
                  <i className={`fas ${cat.icon} text-purple text-xl`} />
                </div>
                <span className="font-semibold text-text text-sm md:text-base text-center">
                  {cat.title}
                </span>
                <span className="text-xs text-text-light mt-0.5">{cat.short}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}
