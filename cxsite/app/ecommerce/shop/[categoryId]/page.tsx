import type { Metadata } from 'next'
import EcomCategoryPageView from '@/components/ecommerce/EcomCategoryPageView'
import { pageTitleSegment } from '@/lib/pageTitle'

export const metadata: Metadata = {
  title: pageTitleSegment('Shop'),
  description: 'Shop online on GatiMitra Ecom Arche.',
}

const CATEGORY_NAMES: Record<string, string> = {
  fashion: 'Fashion',
  daily: 'Daily Needs',
  deals: 'Deals & Offers',
  brands: 'Brand Stores',
}

export default async function ShopCategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>
}) {
  const { categoryId } = await params
  const name = CATEGORY_NAMES[categoryId] ?? 'Shopping'
  return <EcomCategoryPageView categoryName={name} type="shop" />
}
