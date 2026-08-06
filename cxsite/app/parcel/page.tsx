import ParcelLandingPage from '@/components/parcel/ParcelLandingPage'
import ParcelServiceGate from '@/components/parcel/ParcelServiceGate'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Parcel Delivery'),
  description:
    'Send parcels with GatiMitra — courier booking is available only on the mobile app. Fast pickup, live tracking, OTP handoff.',
}

export default function ParcelPage() {
  return (
    <ParcelServiceGate>
      <ParcelLandingPage />
    </ParcelServiceGate>
  )
}
