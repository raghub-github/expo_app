import Link from 'next/link'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

export const metadata = {
  title: 'Sitemap | GatiMitra',
  description: 'Explore all major pages and services on GatiMitra.',
}

const sitemapGroups = [
  {
    title: 'Core Services',
    icon: 'fa-compass',
    links: [
      { label: 'Food Delivery', href: '/order' },
      { label: 'Ride Service', href: '/ride' },
      { label: 'Parcel Service', href: '/parcel' },
      { label: 'Around You', href: '/india/All/Stores' },
      { label: 'E-Commerce', href: '/ecommerce' },
    ],
  },
  {
    title: 'Company',
    icon: 'fa-building',
    links: [
      { label: 'Home', href: '/' },
      { label: 'About Us', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Corporates', href: '/corporates' },
    ],
  },
  {
    title: 'User & Orders',
    icon: 'fa-user-circle',
    links: [
      { label: 'Register', href: '/register' },
      { label: 'Cart', href: '/cart' },
      { label: 'Checkout', href: '/checkout' },
      { label: 'Payment', href: '/payment' },
      { label: 'Orders', href: '/orders' },
    ],
  },
  {
    title: 'Discovery',
    icon: 'fa-map-marker-alt',
    links: [
      { label: 'Restaurants', href: '/restaurants' },
      { label: 'Brand Directory', href: '/brand/1' },
      { label: 'Location Search', href: '/location-search' },
      { label: 'India Stores', href: '/india/All/Stores' },
    ],
  },
]

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

        <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          {sitemapGroups.map((group) => (
            <div
              key={group.title}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[#1a1a2e]">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-[#16c2a5]/20 to-[#4b2ad4]/20 text-[#16c2a5]">
                  <i className={`fas ${group.icon}`} />
                </span>
                {group.title}
              </h2>
              <ul className="space-y-2">
                {group.links.map((item) => (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      className="group flex items-center justify-between rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#16c2a5]/30 hover:bg-[#16c2a5]/5 hover:text-[#0f9f89]"
                    >
                      <span>{item.label}</span>
                      <i className="fas fa-arrow-right text-xs text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#16c2a5]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>

      <Footer />
    </div>
  )
}

