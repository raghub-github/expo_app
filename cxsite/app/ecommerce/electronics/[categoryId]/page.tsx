import type { Metadata } from 'next'
import EcomCategoryPageView from '@/components/ecommerce/EcomCategoryPageView'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata: Metadata = {
  title: pageTitleSegment('Electronics'),
  description: 'Browse electronics categories on GatiMitra Ecom Arche.',
}

const CATEGORY_NAMES: Record<string, string> = {
  phones: 'Phones & Tablets',
  laptops: 'Laptops & PCs',
  tv: 'TV & Audio',
  gadgets: 'Gadgets & Wearables',
  appliances: 'Home Appliances',
}

export default async function ElectronicsCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>
}) {
  const { categoryId } = await params
  const name = CATEGORY_NAMES[categoryId] ?? 'Electronics'
  return <EcomCategoryPageView categoryName={name} type="electronics" />
}
