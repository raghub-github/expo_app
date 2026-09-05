'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import GroceryCategoryBar from '@/components/grocery/GroceryCategoryBar'
import GroceryHeroBanner from '@/components/grocery/GroceryHeroBanner'
import GroceryProductCard, { type GroceryProduct } from '@/components/grocery/GroceryProductCard'
import Footer from '@/components/layout/Footer'
import OrderHeader from '@/components/order/OrderHeader'
import StorePageSkeleton from '@/components/restaurant/StorePageSkeleton'
import { buildGroceryCategoryList } from '@/lib/groceryCategoryMeta'
import { getRestaurantBreadcrumbMiddle } from '@/lib/restaurantDetailLink'

type ProductsResponse = {
  title: string
  showing: number
  total: number
  products: GroceryProduct[]
  storeName: string | null
}

type StoreMeta = {
  restaurant_name?: string
  banner_url?: string | null
  store_img?: string | null
  full_address?: string | null
}

export default function GroceryStorePage({
  storeSlug,
  entryFrom,
}: {
  storeSlug: string
  entryFrom?: string
}) {
  const [data, setData] = useState<ProductsResponse | null>(null)
  const [storeMeta, setStoreMeta] = useState<StoreMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const crumb = getRestaurantBreadcrumbMiddle(entryFrom)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const qs = new URLSearchParams()
    qs.set('store', storeSlug)
    qs.set('limit', '120')

    Promise.all([
      fetch(`/api/grocery/products?${qs.toString()}`).then((r) => r.json()),
      fetch(`/api/restaurants/${encodeURIComponent(storeSlug)}`).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([productsJson, storeJson]: [ProductsResponse, StoreMeta | null]) => {
        if (cancelled) return
        setData(productsJson)
        setStoreMeta(storeJson)
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
  }, [storeSlug])

  const products = data?.products ?? []
  const categories = useMemo(
    () => buildGroceryCategoryList(products.map((p) => p.category)),
    [products]
  )

  const filtered = useMemo(() => {
    let items = products
    if (selectedCategory !== 'All') {
      items = items.filter((p) => p.category === selectedCategory)
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.subtitle ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
      )
    }
    return items
  }, [products, selectedCategory, searchQuery])

  const storeName = storeMeta?.restaurant_name ?? data?.storeName ?? data?.title ?? 'Grocery store'
  const bannerUrl = storeMeta?.banner_url ?? storeMeta?.store_img ?? null

  if (loading && !data) {
    return <StorePageSkeleton />
  }

  return (
    <div className="min-h-screen bg-[#f7f7f9]">
      <OrderHeader
        logoHref="/"
        showBackButton={false}
        searchPlaceholder="Search products in this store..."
      />

      <GroceryCategoryBar
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <main className="mx-auto max-w-[1680px] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-[#6b7280]" aria-label="Breadcrumb">
          <Link href="/grocery" className="hover:text-[#0fa589]">
            Home
          </Link>
          <span className="text-[#d1d5db]">/</span>
          <Link href={crumb.href} className="hover:text-[#0fa589]">
            {crumb.label}
          </Link>
          <span className="text-[#d1d5db]">/</span>
          <Link href="/grocery" className="hover:text-[#0fa589]">
            Grocery
          </Link>
          <span className="text-[#d1d5db]">/</span>
          <span className="font-medium text-[#374151]">{storeName}</span>
        </nav>

        {bannerUrl ? (
          <div className="relative mb-4 h-36 overflow-hidden rounded-2xl border border-[#e8e8ee] sm:h-44">
            <Image
              src={bannerUrl}
              alt={storeName}
              fill
              className="object-cover"
              unoptimized
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
              <h1 className="text-xl font-bold text-white sm:text-2xl">{storeName}</h1>
              {storeMeta?.full_address ? (
                <p className="mt-1 line-clamp-1 text-xs text-white/85 sm:text-sm">
                  {storeMeta.full_address}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <GroceryHeroBanner
            storeName={storeName}
            title="Shop groceries"
            subtitle={
              storeMeta?.full_address ??
              'Browse daily essentials, snacks, dairy and more from this store.'
            }
            compact
          />
        )}

        <div className="mb-5 mt-4">
          <div className="relative">
            <i
              className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af]"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this store..."
              className="w-full rounded-xl border border-[#e5e7eb] bg-white py-2.5 pl-9 pr-4 text-sm text-[#111827] shadow-sm placeholder:text-[#9ca3af] focus:border-[#16c2a5] focus:outline-none focus:ring-2 focus:ring-[#16c2a5]/20"
            />
          </div>
          <p className="mt-2 text-sm text-[#6b7280]">
            {loading
              ? 'Loading products...'
              : `Showing ${filtered.length} of ${data?.total ?? products.length} products`}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3 py-2" aria-busy="true">
            <div className="gm-skel-bar h-20 w-full" />
            <div className="gm-skel-bar h-20 w-full" />
            <div className="gm-skel-bar h-20 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-700">
            Could not load products. Please try again.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-12 text-center">
            <p className="text-lg font-semibold text-[#111827]">No products found</p>
            <Link
              href="/grocery"
              className="mt-5 inline-flex rounded-lg bg-[#16c2a5] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-105"
            >
              Back to grocery
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-4">
            {filtered.map((product) => (
              <GroceryProductCard
                key={`${product.menuItemPk}-${product.id}`}
                product={product}
                hideStoreLink
              />
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
