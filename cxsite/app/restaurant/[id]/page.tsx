import RestaurantPage from '@/components/restaurant/RestaurantPage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Restaurant Details'),
  description: 'View restaurant details, menu, ratings and order online',
}

export default function Page({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { from?: string }
}) {
  return (
    <RestaurantPage restaurantId={params.id} entryFrom={searchParams?.from} />
  )
}
