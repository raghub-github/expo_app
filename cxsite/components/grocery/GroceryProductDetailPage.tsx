'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Minus, Plus, ShoppingCart, Zap } from 'lucide-react'
import OrderHeader from '@/components/order/OrderHeader'
import Footer from '@/components/layout/Footer'
import GroceryProductBreadcrumbBanner from '@/components/grocery/GroceryProductBreadcrumbBanner'
import {
  GroceryProductImageSource,
  GroceryProductZoomPanel,
  useGroceryProductImageZoom,
} from '@/components/grocery/GroceryProductImageZoom'
import GrocerySimilarRow from '@/components/grocery/GrocerySimilarRow'
import type { GroceryProduct } from '@/components/grocery/GroceryProductCard'
import { GM_MINT, GM_MINT_DARK, GM_MINT_LIGHT } from '@/lib/groceryBrand'
import type { GroceryProductDetailDto } from '@/lib/server/fetchGroceryProducts'
import { groceryCategoryHref } from '@/lib/groceryProductUrl'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'

function formatRupee(amount: number) {
  return `₹${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`
}

export default function GroceryProductDetailPage({
  product,
  similarProducts = [],
  categoryProducts = [],
}: {
  product: GroceryProductDetailDto
  similarProducts?: GroceryProduct[]
  categoryProducts?: GroceryProduct[]
}) {
  const defaultVariant =
    product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null

  const [selectedVariantId, setSelectedVariantId] = useState(
    defaultVariant?.id ?? 'default'
  )
  const [customSelections, setCustomSelections] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)

  const selectedVariant = useMemo(
    () => product.variants.find((v) => v.id === selectedVariantId) ?? defaultVariant,
    [product.variants, selectedVariantId, defaultVariant]
  )

  const customizationExtra = useMemo(() => {
    let extra = 0
    for (const group of product.customizations) {
      const picked = customSelections[group.id]
      if (!picked) continue
      const option = group.options.find((o) => o.id === picked)
      if (option?.price) extra += option.price
    }
    return extra
  }, [product.customizations, customSelections])

  const basePrice = selectedVariant?.price ?? product.price
  const price = basePrice + customizationExtra
  const mrp = selectedVariant?.mrp ?? product.mrp
  const discountPercent =
    selectedVariant?.discountPercent ??
    product.discountPercent ??
    (mrp != null && mrp > basePrice && basePrice > 0
      ? Math.round(((mrp - basePrice) / mrp) * 100)
      : null)

  const savings = mrp != null && mrp > basePrice ? mrp - basePrice : 0
  const storeHref = product.storeSlug
    ? restaurantDetailHref({ public_slug: product.storeSlug }, 'grocery')
    : '/grocery'

  const categoryLabel = product.category?.toUpperCase() ?? 'GROCERY'
  const hasVariants = product.variants.length > 1
  const imageZoom = useGroceryProductImageZoom(product.imageUrl)

  const breadcrumbs = useMemo(() => {
    const items = [
      { label: 'Home', href: '/grocery' },
      { label: 'Grocery', href: '/grocery' },
    ]
    if (product.category) {
      items.push({ label: product.category, href: groceryCategoryHref(product.category) })
    }
    items.push({ label: product.name })
    return items
  }, [product.category, product.name])

  return (
    <div className="min-h-screen bg-[#f4f6f8]">
      <OrderHeader
        logoHref="/"
        showBackButton={false}
        searchPlaceholder="Search groceries, brands, essentials..."
      />

      <GroceryProductBreadcrumbBanner crumbs={breadcrumbs} />

      <main className="mx-auto max-w-[1680px] px-3 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:px-8">

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-7">
          <div className="space-y-4 lg:max-w-[520px]">
            <div className="relative overflow-hidden rounded-2xl border border-[#e8e8ee] bg-gradient-to-b from-white to-[#f8fffd] p-4 shadow-[0_6px_24px_rgba(0,0,0,0.05)] sm:p-5">
              {discountPercent != null && discountPercent > 0 ? (
                <span
                  className="absolute left-4 top-4 z-10 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm sm:text-xs"
                  style={{ backgroundColor: GM_MINT_DARK }}
                >
                  {discountPercent}% OFF
                </span>
              ) : null}

              <GroceryProductImageSource
                src={product.imageUrl}
                alt={product.name}
                zoom={imageZoom}
              />
            </div>

            <section className="rounded-2xl border border-[#e8e8ee] bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-base font-bold text-[#111827] sm:text-lg">About the product</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#6b7280]">
                {product.description?.trim() ||
                  product.subtitle?.trim() ||
                  'Fresh quality product from a trusted local store on GatiMitra.'}
              </p>
            </section>
          </div>

          <div className="relative -mt-1 self-start rounded-2xl border border-[#eef0f4] bg-[#fdfefe] p-5 shadow-[0_4px_18px_rgba(0,0,0,0.03)] sm:p-6 lg:-mt-2 lg:p-7">
            <GroceryProductZoomPanel
              src={product.imageUrl}
              focus={imageZoom.focus}
              active={imageZoom.active}
            />
            <div
              className={`transition-opacity duration-200 ${
                imageZoom.active
                  ? 'max-lg:opacity-100 lg:pointer-events-none lg:opacity-0'
                  : 'opacity-100'
              }`}
            >
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ca3af]">
              {categoryLabel}
            </p>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-[#111827] sm:text-[2rem]">
              {product.name}
            </h1>

            <p className="mt-2 text-sm text-[#4b5563]">
              Sold by{' '}
              <Link
                href={storeHref}
                className="font-semibold hover:underline"
                style={{ color: GM_MINT_DARK }}
              >
                {product.storeName}
              </Link>
            </p>

            <div className="mt-5 rounded-xl bg-[#f8fffd] p-4 ring-1 ring-[#16c2a5]/15">
              <div className="flex flex-wrap items-end gap-3">
                <p className="text-3xl font-bold text-[#111827] sm:text-4xl">{formatRupee(price)}</p>
                {mrp != null && mrp > basePrice ? (
                  <p className="text-lg text-[#9ca3af] line-through">{formatRupee(mrp)}</p>
                ) : null}
                {savings > 0 ? (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ backgroundColor: GM_MINT_LIGHT, color: GM_MINT_DARK }}
                  >
                    Save {formatRupee(savings)}
                    {discountPercent != null && discountPercent > 0 ? ` (${discountPercent}%)` : ''}
                  </span>
                ) : null}
              </div>
              {customizationExtra > 0 ? (
                <p className="mt-1 text-xs text-[#6b7280]">
                  Includes {formatRupee(customizationExtra)} from selected options
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-[#9ca3af]">Inclusive of all taxes</p>
            </div>

            {hasVariants ? (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">
                  Choose pack size
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {product.variants.map((variant) => {
                    const selected = variant.id === selectedVariantId
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.id)}
                        className="rounded-xl border-2 px-3 py-3 text-left transition-all"
                        style={
                          selected
                            ? {
                                borderColor: GM_MINT,
                                backgroundColor: GM_MINT_LIGHT,
                                boxShadow: '0 4px 14px rgba(22,194,165,0.15)',
                              }
                            : { borderColor: '#e5e7eb', backgroundColor: '#fff' }
                        }
                      >
                        <span className="block text-sm font-bold text-[#111827]">{variant.label}</span>
                        <span className="mt-1 block text-xs font-semibold text-[#0fa589]">
                          {formatRupee(variant.price)}
                        </span>
                        {variant.discountPercent != null && variant.discountPercent > 0 ? (
                          <span className="mt-0.5 block text-[10px] font-semibold text-[#0fa589]">
                            {variant.discountPercent}% OFF
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : product.sizeLabel ? (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">Pack size</p>
                <span
                  className="mt-2 inline-flex rounded-xl border-2 px-4 py-2.5 text-sm font-bold"
                  style={{ borderColor: GM_MINT, backgroundColor: GM_MINT_LIGHT, color: '#111827' }}
                >
                  {product.sizeLabel}
                </span>
              </div>
            ) : null}

            {product.customizations.map((group) => (
              <div key={group.id} className="mt-6">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">
                    {group.title}
                  </p>
                  {group.isRequired ? (
                    <span className="text-[10px] font-semibold text-[#ef4444]">Required</span>
                  ) : (
                    <span className="text-[10px] text-[#9ca3af]">Optional</span>
                  )}
                </div>
                <div className="space-y-2">
                  {group.options.map((option) => {
                    const selected = customSelections[group.id] === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setCustomSelections((prev) => ({
                            ...prev,
                            [group.id]: prev[group.id] === option.id ? '' : option.id,
                          }))
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors"
                        style={
                          selected
                            ? { borderColor: GM_MINT, backgroundColor: GM_MINT_LIGHT }
                            : { borderColor: '#e5e7eb', backgroundColor: '#fff' }
                        }
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                            style={{
                              borderColor: selected ? GM_MINT : '#d1d5db',
                              backgroundColor: selected ? GM_MINT : 'transparent',
                            }}
                          >
                            {selected ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            ) : null}
                          </span>
                          <span className="text-sm font-medium text-[#111827] truncate">
                            {option.name}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-[#0fa589]">
                          {option.price > 0 ? `+${formatRupee(option.price)}` : 'Free'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <Link
              href={storeHref}
              className="mt-6 block rounded-xl border border-[#e8e8ee] bg-[#fafafa] px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-[#6b7280] transition-colors hover:border-[#16c2a5]/40 hover:text-[#0fa589]"
            >
              Sold by {product.storeName}
            </Link>

            <div className="mt-4 flex items-center gap-2">
              <Check className="h-4 w-4" style={{ color: GM_MINT }} aria-hidden />
              <span className="text-sm font-semibold" style={{ color: GM_MINT_DARK }}>
                {selectedVariant?.inStock !== false && product.inStock ? 'In stock' : 'Out of stock'}
              </span>
            </div>

            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6b7280]">Quantity</p>
              <div className="mt-2 inline-flex items-center overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-[#6b7280] hover:bg-[#f9fafb]"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[44px] border-x border-[#e5e7eb] px-3 py-2 text-center text-sm font-bold text-[#111827]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                  className="px-3 py-2 text-[#6b7280] hover:bg-[#f9fafb]"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled
                title="Add to cart is available in the GatiMitra app"
                className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold uppercase tracking-wide text-white opacity-60"
                style={{ background: `linear-gradient(to right, ${GM_MINT}, ${GM_MINT_DARK})` }}
              >
                <ShoppingCart className="h-4 w-4" aria-hidden />
                Add to cart
              </button>
              <button
                type="button"
                disabled
                title="Buy now is available in the GatiMitra app"
                className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl border-2 px-5 py-3.5 text-sm font-bold uppercase tracking-wide opacity-60"
                style={{ borderColor: GM_MINT, color: GM_MINT_DARK, backgroundColor: GM_MINT_LIGHT }}
              >
                <Zap className="h-4 w-4" aria-hidden />
                Buy now
              </button>
            </div>

            <p className="mt-5 text-center text-xs text-[#9ca3af]">
              To order, download the GatiMitra customer app — web checkout coming soon.
            </p>
            </div>
          </div>
        </div>

        <GrocerySimilarRow title="Similar products" products={similarProducts} />
        <GrocerySimilarRow
          title={
            product.category
              ? `Top products in ${product.category}`
              : 'Top products in this category'
          }
          products={categoryProducts}
        />
      </main>
      <Footer />
    </div>
  )
}
