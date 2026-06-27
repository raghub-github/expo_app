import type { Metadata } from 'next'
import ElectronicsEcomPage from '@/components/ecommerce/ElectronicsEcomPage'

export const metadata: Metadata = {
  title: 'GatiMitra Ecom Arche | Electronics Mega Store',
  description:
    'GatiMitra Ecom Arche — Shop the Future. Latest tech, best prices, fast delivery. Phones, laptops, TV & audio, smart wear, cameras & more.',
  openGraph: {
    title: 'GatiMitra Ecom Arche | Electronics Mega Store',
    description: 'Shop the Future. Latest tech, best prices, fast delivery.',
  },
}

export default function EcommercePage() {
  return <ElectronicsEcomPage />
}
