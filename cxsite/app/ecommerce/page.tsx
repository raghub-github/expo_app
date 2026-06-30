import type { Metadata } from 'next'
import ElectronicsEcomPage from '@/components/ecommerce/ElectronicsEcomPage'
import { fullPageTitle, pageTitleSegment } from '@/lib/pageTitle'

export const metadata: Metadata = {
  title: pageTitleSegment('Ecommerce'),
  description:
    'GatiMitra Ecom Arche — Shop the Future. Latest tech, best prices, fast delivery. Phones, laptops, TV & audio, smart wear, cameras & more.',
  openGraph: {
    title: fullPageTitle('Ecommerce'),
    description: 'Shop the Future. Latest tech, best prices, fast delivery.',
  },
}

export default function EcommercePage() {
  return <ElectronicsEcomPage />
}
