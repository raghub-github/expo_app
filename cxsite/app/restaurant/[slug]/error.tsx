'use client'

import RestaurantPage from '@/components/restaurant/RestaurantPage'
import { useParams, useSearchParams } from 'next/navigation'

/** Never drop a store URL to the global 404 — keep the inner page shell. */
export default function RestaurantRouteError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = String(params?.slug ?? '').trim()

  if (!slug) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-gray-600">This store page could not finish loading.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[#16c2a5] px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <RestaurantPage restaurantId={slug} entryFrom={searchParams.get('from') ?? undefined} />
  )
}
