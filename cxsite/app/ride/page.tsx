import PersonServicePage from '@/components/person/PersonServicePage'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata = {
  title: pageTitleSegment('Ride'),
  description: 'Book a ride with GatiMitra - Safe, reliable, and affordable rides',
}

export default function Ride() {
  return <PersonServicePage />
}

