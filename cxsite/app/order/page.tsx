import OrderPage from '@/components/order/OrderPage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Order Food'),
}

export default function Order() {
  return <OrderPage />
}
