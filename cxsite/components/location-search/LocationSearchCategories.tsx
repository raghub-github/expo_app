'use client'

import Link from 'next/link'
import ParcelServiceControl from '@/components/common/ParcelServiceControl'

type Category = {
  title: string
  href: string
  icon: string
  short: string
  parcelGated?: boolean
}

const categories: Category[] = [
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
    parcelGated: true,
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

function CategoryCardContent({ cat }: { cat: Category }) {
  return (
    <>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-light">
        <i className={`fas ${cat.icon} text-xl text-purple`} />
      </div>
      <span className="text-center text-sm font-semibold text-text md:text-base">{cat.title}</span>
      <span className="mt-0.5 text-xs text-text-light">{cat.short}</span>
    </>
  )
}

export default function LocationSearchCategories() {
  const cardClass =
    'relative flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white/90 p-6 shadow-md backdrop-blur transition-all hover:border-purple/20 hover:shadow-lg'

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
      {categories.map((cat) =>
        cat.parcelGated ? (
          <ParcelServiceControl
            key={cat.href}
            badgePlacement="corner"
            className={cardClass}
            disabledClassName="cursor-not-allowed opacity-50 hover:border-gray-100 hover:shadow-md"
          >
            <CategoryCardContent cat={cat} />
          </ParcelServiceControl>
        ) : (
          <Link key={cat.href} href={cat.href} className={cardClass}>
            <CategoryCardContent cat={cat} />
          </Link>
        )
      )}
    </div>
  )
}
