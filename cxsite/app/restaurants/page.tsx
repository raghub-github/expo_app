import { Suspense } from 'react'
import RestaurantListPage from '@/components/restaurant/RestaurantListPage'

export const metadata = {
  title: 'Order Food Online from GatiMitra – Fast Delivery Near You.',
  description: 'Discover top restaurants, order food instantly, and get fast delivery at your doorstep with GatiMitra.',
}

function RestaurantsLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="relative mx-auto mb-4 h-16 w-16">
          <div className="absolute inset-0 rounded-full border-[3px] border-[#16c2a5]/35 border-t-[#16c2a5] animate-spin"></div>
          <div className="absolute inset-[6px] rounded-full border-[3px] border-[#ff6b35]/30 border-r-[#ff6b35] animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <img src="/img/logo.png" alt="GatiMitra" className="h-7 w-auto object-contain" />
          </div>
        </div>
        <p className="text-slate-600 font-medium">Loading restaurants...</p>
      </div>
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
