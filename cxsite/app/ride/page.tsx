import RideLandingPage from '@/components/ride/RideLandingPage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Ride'),
  description:
    'Book Bike, Auto, or Cab with GatiMitra — ride booking is available only on the mobile app. Safe, insured trips with trusted Captains.',
}

export default function Ride() {
  return <RideLandingPage />
}
