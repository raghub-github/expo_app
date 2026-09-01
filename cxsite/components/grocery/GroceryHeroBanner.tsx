'use client'

import Image from 'next/image'
import { ShieldCheck, Truck, Zap } from 'lucide-react'
import { GM_MINT_DARK } from '@/lib/groceryBrand'

const GROCERY_HERO_IMAGE = '/img/grocery-hero.jpg'

type Props = {
  title?: string
  subtitle?: string
  storeName?: string
  compact?: boolean
}

export default function GroceryHeroBanner({
  title = 'Daily essentials, delivered',
  subtitle = 'Browse snacks, dairy, beverages and more from grocery stores in your area.',
  storeName,
  compact = false,
}: Props) {
  if (compact && storeName) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-[#dcefe9] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0fa589]">{storeName}</p>
        <h1 className="mt-1 text-xl font-bold text-[#111827] sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-[#6b7280]">{subtitle}</p>
      </section>
    )
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#dcefe9] shadow-[0_8px_30px_rgba(22,194,165,0.1)]">
      <div className="relative min-h-[168px] sm:min-h-[200px] lg:min-h-[220px]">
        <Image
          src={GROCERY_HERO_IMAGE}
          alt="GatiMitra grocery delivery"
          fill
          className="object-cover object-[center_35%]"
          priority
          sizes="(max-width: 1400px) 100vw, 1400px"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/82 to-white/25 sm:from-white/92 sm:via-white/70 sm:to-transparent" />

        <div className="relative flex h-full flex-col justify-center px-4 py-5 sm:px-7 sm:py-6 lg:px-9">
          <p
            className="inline-flex w-fit items-center gap-1.5 text-[12px] font-bold sm:text-[13px]"
            style={{ color: GM_MINT_DARK }}
          >
            <Zap className="h-4 w-4 fill-current" aria-hidden />
            Delivery As earlier as possible
          </p>

          <h1 className="mt-2 max-w-xl text-2xl font-bold leading-tight tracking-tight text-[#111827] sm:text-[1.75rem] lg:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#4b5563] sm:text-[15px]">
            {subtitle}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#374151] shadow-sm ring-1 ring-[#e5e7eb]/80 backdrop-blur-sm">
              <Truck className="h-3.5 w-3.5 text-[#16c2a5]" aria-hidden />
              Fast delivery
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#374151] shadow-sm ring-1 ring-[#e5e7eb]/80 backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-[#16c2a5]" aria-hidden />
              Secure checkout
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
