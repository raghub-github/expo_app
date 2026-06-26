import RestaurantPage from '@/components/restaurant/RestaurantPage'

export const metadata = {
  title: 'Restaurant Details | GatiMitra Food',
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
