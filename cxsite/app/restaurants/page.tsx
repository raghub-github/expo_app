import { Suspense } from 'react'
import RestaurantListPage from '@/components/restaurant/RestaurantListPage'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'

import { pageTitleSegment, fullPageTitle } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Restaurants'),
  description: 'Discover top restaurants, order food instantly, and get fast delivery at your doorstep with GatiMitra.',
}

function RestaurantsLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <GatiMitraSpinner message="Loading restaurants..." />
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<RestaurantsLoading />}>
      <RestaurantListPage />
    </Suspense>
  )
}
