import OrderPage from '@/components/order/OrderPage'
import { pageTitleSegment } from '@/lib/pageTitle'
import { fetchUserAppCategories } from '@/lib/server/fetchUserAppCategories'

export const metadata = {
  title: pageTitleSegment('Order Food'),
}

export default async function Order() {
  // Seed Top Picks from DB (same as customer app) so first paint isn't empty.
  const initialCategories = await fetchUserAppCategories('FOOD')

  return <OrderPage initialCategories={initialCategories} />
}
