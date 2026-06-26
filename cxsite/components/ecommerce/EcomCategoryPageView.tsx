'use client'

import Link from 'next/link'
import EcomArcheLayout from './EcomArcheLayout'

const ELECTRONICS_ICON = 'fa-microchip'
const SHOP_ICON = 'fa-shopping-cart'
const ELECTRONICS_COLOR = '#2196F3'
const SHOP_COLOR = '#16c2a5'

export default function EcomCategoryPageView({
  categoryName,
  type,
}: {
  categoryName: string
  type: 'electronics' | 'shop'
}) {
  const isElectronics = type === 'electronics'
  const icon = isElectronics ? ELECTRONICS_ICON : SHOP_ICON
  const color = isElectronics ? ELECTRONICS_COLOR : SHOP_COLOR

  return (
    <EcomArcheLayout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 bg-[#f1f5f9]">
        <div className="max-w-lg w-full rounded-2xl bg-[#f8fafc] shadow-lg border border-slate-200 p-8 text-center">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: `${color}20` }}
          >
            <i className={`fas ${icon} text-2xl`} style={{ color }} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0f172a] mb-2">{categoryName}</h1>
          <p className="text-slate-500 text-sm mb-6">
            We&apos;re adding products in this category. Check back soon.
          </p>
          <Link
            href="/ecommerce"
            className="inline-flex items-center gap-2 font-semibold no-underline hover:underline"
            style={{ color }}
          >
            <i className="fas fa-arrow-left" /> Back to GatiMitra Ecom Arche
          </Link>
        </div>
      </div>
    </EcomArcheLayout>
  )
}
