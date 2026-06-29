import ParcelServicePage from '@/components/parcel/ParcelServicePage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Courier'),
  description: 'Send parcels and packages with GatiMitra - Fast and reliable delivery',
}

export default function Courier() {
  return <ParcelServicePage />
}

