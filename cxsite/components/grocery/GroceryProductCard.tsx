'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Shield, Truck, ShoppingCart } from 'lucide-react'
import { GM_MINT, GM_MINT_DARK, GM_MINT_LIGHT } from '@/lib/groceryBrand'
import { groceryProductHref } from '@/lib/groceryProductUrl'
import { restaurantDetailHref } from '@/lib/restaurantDetailLink'

export type GroceryProduct = {
  id: string
  menuItemPk: number
  name: string
  subtitle: string | null
  category: string | null
  imageUrl: string | null
  price: number
  mrp: number | null
  discountPercent: number | null
  sizeLabel: string | null
  storeName: string
  storeSlug: string | null
  inStock: boolean
}

function formatRupee(amount: number) {
  return `₹${amount.toFixed(2)}`
}

export default function GroceryProductCard({
  product,
  hideStoreLink = false,
}: {
  product: GroceryProduct
  hideStoreLink?: boolean
}) {
  const storeHref = product.storeSlug
    ? restaurantDetailHref({ public_slug: product.storeSlug }, 'grocery')
    : '/grocery'
  const productHref = groceryProductHref(product)

  return (
    <article className="relative flex h-full min-h-[188px] flex-col rounded-xl border border-[#e8e8ee] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] sm:min-h-[200px] sm:p-3.5">
      <Link href={productHref} className="absolute inset-0 z-0 rounded-xl" aria-label={`View ${product.name}`} />

      <div className="pointer-events-none relative z-[1] flex gap-3 sm:gap-3.5">
        <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl bg-[#f5f5f7] ring-1 ring-[#ececf1] sm:h-[92px] sm:w-[92px]">
          {product.discountPercent != null && product.discountPercent > 0 ? (
            <span
              className="absolute left-0 top-0 z-10 rounded-br-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: GM_MINT_DARK }}
            >
              {product.discountPercent}% OFF
            </span>
          ) : null}
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              width={92}
              height={92}
              className="h-full w-full object-contain p-1.5"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-[#1a1a2e] sm:text-[14px]">
            {product.name}
          </h3>

          {!hideStoreLink ? (
            <p className="pointer-events-auto relative z-10 mt-1 line-clamp-1 text-[10px] text-[#4b5563] sm:text-[11px]">
              Sold by :{' '}
              <Link
                href={storeHref}
                className="font-semibold hover:underline"
                style={{ color: GM_MINT_DARK }}
                onClick={(e) => e.stopPropagation()}
              >
                {product.storeName}
              </Link>
            </p>
          ) : (
            <p className="mt-1 line-clamp-1 text-[10px] font-semibold sm:text-[11px]" style={{ color: GM_MINT_DARK }}>
              {product.storeName}
            </p>
          )}

          {product.subtitle ? (
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#9ca3af]">{product.subtitle}</p>
          ) : null}

          {product.sizeLabel ? (
            <span
              className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[9px] font-semibold sm:text-[10px]"
              style={{ backgroundColor: GM_MINT_LIGHT, color: GM_MINT_DARK }}
            >
              {product.sizeLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative z-[1] mt-auto flex items-end justify-between gap-2 border-t border-[#f0f0f4] pt-3">
        <div className="pointer-events-none min-w-0">
          <p className="text-[15px] font-bold text-[#111827] sm:text-[16px]">{formatRupee(product.price)}</p>
          {product.mrp != null && product.mrp > product.price ? (
            <p className="text-[11px] text-[#9ca3af] line-through">{formatRupee(product.mrp)}</p>
          ) : null}
        </div>

        {product.inStock ? (
          <button
            type="button"
            disabled
            title="Add to cart is available in the GatiMitra app"
            className="relative z-10 inline-flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white opacity-60 sm:px-3 sm:text-[11px]"
            style={{ background: `linear-gradient(to right, ${GM_MINT}, ${GM_MINT_DARK})` }}
            onClick={(e) => e.preventDefault()}
          >
            <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden />
            Add
          </button>
        ) : (
          <span className="shrink-0 rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide text-[#9ca3af]">
            Sold out
          </span>
        )}
      </div>

      <div className="pointer-events-none relative z-[1] mt-2.5 grid grid-cols-2 gap-2 border-t border-[#f0f0f4] pt-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <Truck className="h-3 w-3 shrink-0" style={{ color: GM_MINT }} aria-hidden />
          <span className="text-[7px] font-semibold leading-tight sm:text-[8px]" style={{ color: GM_MINT_DARK }}>
            Fast &amp; secure delivery
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1">
          <Shield className="h-3 w-3 shrink-0" style={{ color: GM_MINT }} aria-hidden />
          <span className="text-[7px] font-semibold leading-tight sm:text-[8px]" style={{ color: GM_MINT_DARK }}>
            Secure payment
          </span>
        </div>
      </div>
    </article>
  )
}
