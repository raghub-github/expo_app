import SitemapLogoHeader from '@/components/sitemap/SitemapLogoHeader'
import Footer from '@/components/layout/Footer'
import SitemapCoverage from '@/components/sitemap/SitemapCoverage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Sitemap'),
  description:
    'Explore GatiMitra coverage across India — live service points on the map and every location by name.',
}

export default function SitemapPage() {
  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    process.env.MAPBOX_PUBLIC_TOKEN?.trim() ||
    null

  return (
    <div className="min-h-screen bg-[#f3f3f3]">
      <SitemapLogoHeader />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#16c2a5]/20 bg-gradient-to-br from-[#0c0c1a] via-[#1a1a2e] to-[#121230] p-8 text-white shadow-xl sm:p-10">
          <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#16c2a5]/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#16c2a5]/15 blur-3xl" />
          <div className="relative z-10">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#9bf4e6]">
              <i className="fas fa-map-marked-alt" />
              Across India
            </p>
            <h1 className="text-3xl font-black sm:text-4xl">
              Explore <span className="text-[#16c2a5]">GatiMitra</span> coverage
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[#c8c8df] sm:text-base">
              See every live service point on the India map, then browse all location names below.
            </p>
          </div>
        </section>

        <SitemapCoverage mapboxToken={mapboxToken} />
      </main>

      <Footer />
    </div>
  )
}
