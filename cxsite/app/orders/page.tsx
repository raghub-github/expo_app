import { Suspense } from 'react'
import OrdersPageClient from '@/components/orders/OrdersPage'

function OrdersPageFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600">Loading your orders...</p>
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<OrdersPageFallback />}>
      <OrdersPageClient />
    </Suspense>
  )
}
