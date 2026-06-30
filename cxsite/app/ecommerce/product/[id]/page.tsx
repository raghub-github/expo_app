import type { Metadata } from 'next'
import EcomProductDetailView from '@/components/ecommerce/EcomProductDetailView'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata: Metadata = {
  title: pageTitleSegment('Product'),
  description: 'Product details on GatiMitra Ecom Arche.',
}

export default async function EcomProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <EcomProductDetailView productId={id} />
}
