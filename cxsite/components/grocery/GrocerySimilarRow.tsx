'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Clock, ShoppingCart } from 'lucide-react'
import type { GroceryProduct } from '@/components/grocery/GroceryProductCard'
import GroceryScrollArrows from '@/components/grocery/GroceryScrollArrows'
import { groceryProductHref } from '@/lib/groceryProductUrl'
import { GM_MINT, GM_MINT_DARK } from '@/lib/groceryBrand'

function formatRupee(amount: number) {
  return `₹${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`
}

export default function GrocerySimilarRow({
  title,
  products,
}: {
  title: string
  products: GroceryProduct[]
}) {
  if (!products.length) return null

  return (
    <section className="mt-8 sm:mt-10">
      <GroceryScrollArrows
        title={
          <h2 className="text-lg font-bold text-[#111827] sm:text-xl">{title}</h2>
        }
        innerClassName="flex gap-3 pb-1 sm:gap-4"
      >
        {products.map((product) => {
          const href = groceryProductHref(product)
          return (
            <article
              key={`${product.menuItemPk}-${product.id}`}
              className="relative w-[148px] shrink-0 rounded-xl border border-[#ececf1] bg-white p-2.5 transition-shadow hover:shadow-md sm:w-[168px] sm:p-3"
            >
              <Link href={href} className="absolute inset-0 z-0 rounded-xl" aria-label={product.name} />
              <div className="pointer-events-none relative z-[1]">
                <div className="relative mb-2 aspect-square overflow-hidden rounded-lg bg-[#f7f7f9]">
                  {product.discountPercent != null && product.discountPercent > 0 ? (
                    <span
                      className="absolute left-0 top-0 z-10 rounded-br-md px-1.5 py-0.5 text-[9px] font-bold text-white"
                      style={{ backgroundColor: GM_MINT_DARK }}
                    >
                      {product.discountPercent}% OFF
                    </span>
                  ) : null}
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-contain p-2"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-[#9ca3af]">
                      No image
                    </div>
                  )}
                </div>
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">
                  <Clock className="h-3 w-3 text-[#0fa589]" aria-hidden />
                  Fast delivery
                </p>
                <h3 className="line-clamp-2 min-h-[2.4em] text-[13px] font-bold leading-snug text-[#111827]">
                  {product.name}
                </h3>
                {product.sizeLabel ? (
                  <p className="mt-1 text-[11px] text-[#6b7280]">{product.sizeLabel}</p>
                ) : null}
              </div>

              <div className="relative z-[1] mt-2 flex items-end justify-between gap-2">
                <div className="pointer-events-none">
                  <p className="text-sm font-bold text-[#111827]">{formatRupee(product.price)}</p>
                  {product.mrp != null && product.mrp > product.price ? (
                    <p className="text-[11px] text-[#9ca3af] line-through">{formatRupee(product.mrp)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled
                  title="Add to cart is available in the GatiMitra app"
                  className="relative z-10 cursor-not-allowed rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase opacity-70"
                  style={{ borderColor: GM_MINT, color: GM_MINT_DARK }}
                  onClick={(e) => e.preventDefault()}
                >
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" aria-hidden />
                    Add
                  </span>
                </button>
              </div>
            </article>
          )
        })}
      </GroceryScrollArrows>
    </section>
  )
}
