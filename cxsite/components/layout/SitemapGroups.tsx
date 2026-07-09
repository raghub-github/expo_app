'use client'

import Link from 'next/link'
import ParcelServiceControl from '@/components/common/ParcelServiceControl'

type SitemapLink = { label: string; href: string; parcelGated?: boolean }

type SitemapGroup = {
  title: string
  icon: string
  links: SitemapLink[]
}

export const SITEMAP_GROUPS: SitemapGroup[] = [
  {
    title: 'Core Services',
    icon: 'fa-compass',
    links: [
      { label: 'Food Delivery', href: '/order' },
      { label: 'Ride Service', href: '/ride' },
      { label: 'Parcel Service', href: '/parcel', parcelGated: true },
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

export default function SitemapGroups() {
  return (
    <section className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
      {SITEMAP_GROUPS.map((group) => (
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
            {group.links.map((item) =>
              item.parcelGated ? (
                <li key={item.href + item.label}>
                  <ParcelServiceControl
                    badgePlacement="inline"
                    className="group flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#16c2a5]/30 hover:bg-[#16c2a5]/5 hover:text-[#0f9f89]"
                    disabledClassName="cursor-not-allowed opacity-45 hover:border-transparent hover:bg-transparent hover:text-gray-700"
                  >
                    <span>{item.label}</span>
                    <i className="fas fa-arrow-right text-xs text-gray-400" />
                  </ParcelServiceControl>
                </li>
              ) : (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="group flex items-center justify-between rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#16c2a5]/30 hover:bg-[#16c2a5]/5 hover:text-[#0f9f89]"
                  >
                    <span>{item.label}</span>
                    <i className="fas fa-arrow-right text-xs text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#16c2a5]" />
                  </Link>
                </li>
              )
            )}
          </ul>
        </div>
      ))}
    </section>
  )
}
