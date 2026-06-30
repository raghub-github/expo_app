import { Suspense } from 'react'
import OrdersPageClient from '@/components/orders/OrdersPage'
import OrdersPageLoading from '@/components/orders/OrdersPageLoading'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('My Orders'),
}

type PageProps = {
  searchParams?: { filter?: string; from?: string }
}

export default function Page({ searchParams }: PageProps) {
  const filter = searchParams?.filter
  const from = searchParams?.from

  return (
    <Suspense fallback={<OrdersPageLoading />}>
      <OrdersPageClient initialFilter={filter} initialFrom={from} />
    </Suspense>
  )
}
