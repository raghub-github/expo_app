import ParcelLandingPage from '@/components/parcel/ParcelLandingPage'
import ParcelServiceGate from '@/components/parcel/ParcelServiceGate'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Courier'),
  description:
    'Send parcels and packages with GatiMitra — book only in the mobile app. Fast and reliable delivery.',
}

export default function Courier() {
  return (
    <ParcelServiceGate>
      <ParcelLandingPage />
    </ParcelServiceGate>
  )
}
