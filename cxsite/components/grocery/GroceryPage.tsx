'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import GatiMitraSpinner from '@/components/common/GatiMitraSpinner'
import GroceryCategoryBar from '@/components/grocery/GroceryCategoryBar'
import GroceryHeroBanner from '@/components/grocery/GroceryHeroBanner'
import GroceryProductCard, { type GroceryProduct } from '@/components/grocery/GroceryProductCard'
import Footer from '@/components/layout/Footer'
import OrderHeader from '@/components/order/OrderHeader'
import { useLocationContext } from '@/components/providers/LocationProvider'
import { getRestaurantGeoQueryString } from '@/lib/buildRestaurantGeoQuery'
import { buildGroceryCategoryList } from '@/lib/groceryCategoryMeta'

type ProductsResponse = {
  title: string
  showing: number
  total: number
  products: GroceryProduct[]
}

export default function GroceryPage() {
  const { location, hydrated } = useLocationContext()
  const geoQs = useMemo(() => getRestaurantGeoQueryString(location), [location])
  const router = useRouter()
  const searchParams = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() || 'All'
  const [data, setData] = useState<ProductsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(categoryFromUrl)

  useEffect(() => {
    setSelectedCategory(categoryFromUrl)
  }, [categoryFromUrl])

  const selectCategory = (label: string) => {
    setSelectedCategory(label)
    const next = new URLSearchParams(searchParams.toString())
    if (!label || label === 'All') next.delete('category')
    else next.set('category', label)
    const qs = next.toString()
    router.replace(qs ? `/grocery?${qs}` : '/grocery', { scroll: false })
  }

  useEffect(() => {
    if (!hydrated) return

    let cancelled = false
    setLoading(true)
    setError(false)

    const qs = new URLSearchParams(geoQs)
    qs.set('limit', '120')

    fetch(`/api/grocery/products?${qs.toString()}`)
      .then((r) => r.json())
      .then((json: ProductsResponse) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [hydrated, geoQs])

  const products = data?.products ?? []
  const categories = useMemo(
    () => buildGroceryCategoryList(products.map((p) => p.category)),
    [products]
  )

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'All') return products
    return products.filter((p) => p.category === selectedCategory)
  }, [products, selectedCategory])

  const sectionTitle =
    selectedCategory === 'All' ? (data?.title ?? 'Trending Near You') : selectedCategory

  const subtitle =
    data && data.total > 0
      ? `Showing ${filteredProducts.length} of ${data.total} daily essentials`
      : 'Fresh groceries from stores near you'

  return (
    <div className="min-h-screen bg-[#f7f7f9]">
      <OrderHeader
        logoHref="/"
        showBackButton={false}
        searchPlaceholder="Search groceries, brands, essentials..."
      />

      <GroceryCategoryBar
        categories={categories}
        selected={selectedCategory}
        onSelect={selectCategory}
      />

      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <GroceryHeroBanner
          title="Daily essentials, delivered"
          subtitle="Browse snacks, dairy, beverages and more from grocery stores in your area."
        />

        <header className="mb-4 mt-6 sm:mb-5">
          <h2 className="text-xl font-bold text-[#111827] sm:text-2xl">{sectionTitle}</h2>
          <p className="mt-1 text-sm text-[#6b7280]">{subtitle}</p>
        </header>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <GatiMitraSpinner message="Loading grocery products..." />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-700">
            Could not load grocery products. Please try again.
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-12 text-center">
            <p className="text-lg font-semibold text-[#111827]">No grocery products nearby</p>
            <p className="mt-2 text-sm text-[#6b7280]">
              Try changing your location or pick another category.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-lg bg-[#16c2a5] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {filteredProducts.map((product) => (
              <GroceryProductCard key={`${product.menuItemPk}-${product.id}`} product={product} />
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-[#9ca3af]">
          To order groceries, download the GatiMitra customer app — web checkout coming soon.
        </p>
      </main>
      <Footer />
    </div>
  )
}
