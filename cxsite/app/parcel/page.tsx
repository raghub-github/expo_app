import ParcelServicePageModern from '@/components/parcel/ParcelServicePageModern'
import ParcelServiceGate from '@/components/parcel/ParcelServiceGate'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Parcel Delivery'),
  description: 'Fast, reliable and insured parcel delivery service. Send anything, anywhere with GatiMitra.',
}

export default function ParcelPage() {
  return (
    <ParcelServiceGate>
      <ParcelServicePageModern />
    </ParcelServiceGate>
  )
}
