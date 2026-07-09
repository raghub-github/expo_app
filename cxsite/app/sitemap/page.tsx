import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import SitemapGroups from '@/components/layout/SitemapGroups'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Sitemap'),
  description: 'Explore all major pages and services on GatiMitra.',
}

export default function SitemapPage() {
  return (
    <div className="min-h-screen bg-[#f3f3f3]">
      <Header />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-[#16c2a5]/20 bg-gradient-to-br from-[#0c0c1a] via-[#1a1a2e] to-[#121230] p-8 text-white shadow-xl sm:p-10">
          <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#16c2a5]/20 blur-3xl" />
          <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#4b2ad4]/25 blur-3xl" />
          <div className="relative z-10">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#9bf4e6]">
              <i className="fas fa-sitemap" />
              GatiMitra Navigation
            </p>
            <h1 className="text-3xl font-black sm:text-4xl">
              Explore the <span className="text-[#16c2a5]">GatiMitra Sitemap</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[#c8c8df] sm:text-base">
              Find every important page quickly. Discover food, parcel, ride, stores, and account pages from one place.
            </p>
          </div>
        </section>

        <SitemapGroups />
      </main>

      <Footer />
    </div>
  )
}
