import { notFound } from 'next/navigation'
import GroceryProductDetailPage from '@/components/grocery/GroceryProductDetailPage'
import { pageTitleSegment } from '@/lib/pageTitle'
import {
  fetchGroceryProductDetail,
  fetchGroceryProducts,
} from '@/lib/server/fetchGroceryProducts'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: { itemId: string }
  searchParams: { store?: string }
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const product = await fetchGroceryProductDetail({
    itemId: decodeURIComponent(params.itemId),
    storeSlug: searchParams.store?.trim(),
  })

  if (!product) {
    return { title: pageTitleSegment('Product not found') }
  }

  return {
    title: pageTitleSegment(product.name),
    description:
      product.description?.slice(0, 160) ||
      `Buy ${product.name} from ${product.storeName} on GatiMitra.`,
  }
}

export default async function GroceryProductRoutePage({ params, searchParams }: PageProps) {
  const product = await fetchGroceryProductDetail({
    itemId: decodeURIComponent(params.itemId),
    storeSlug: searchParams.store?.trim(),
  })

  if (!product) notFound()

  const { products: storeProducts } = product.storeSlug
    ? await fetchGroceryProducts({ storeSlug: product.storeSlug, limit: 120 })
    : { products: [] }

  const others = storeProducts.filter((p) => p.id !== product.id)
  const similarProducts = others.slice(0, 10)
  const categoryProducts = product.category
    ? others.filter((p) => p.category === product.category).slice(0, 10)
    : others.slice(0, 10)

  return (
    <GroceryProductDetailPage
      product={product}
      similarProducts={similarProducts}
      categoryProducts={categoryProducts}
    />
  )
}
