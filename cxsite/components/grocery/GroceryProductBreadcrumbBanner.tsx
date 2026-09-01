'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { GM_MINT_DARK } from '@/lib/groceryBrand'

type Crumb = {
  label: string
  href?: string
}

type Props = {
  crumbs: Crumb[]
}

export default function GroceryProductBreadcrumbBanner({ crumbs }: Props) {
  return (
    <div className="sticky top-[64px] z-[90] border-b border-[#e8ecef] bg-white/95 shadow-sm backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-[1680px] items-center gap-1 overflow-x-auto px-3 py-2.5 text-[11px] text-[#6b7280] [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:py-3 sm:text-xs lg:px-8 [&::-webkit-scrollbar]:hidden"
        aria-label="Breadcrumb"
      >
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1
          return (
            <span key={`${crumb.label}-${idx}`} className="flex shrink-0 items-center gap-1">
              {idx > 0 ? <ChevronRight className="h-3 w-3 text-[#d1d5db]" aria-hidden /> : null}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors hover:bg-[#ecfdf8] hover:text-[#0fa589]"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={`whitespace-nowrap ${
                    isLast
                      ? 'max-w-[200px] truncate rounded-md bg-[#ecfdf8] px-2 py-0.5 font-semibold text-[#111827] sm:max-w-[360px]'
                      : ''
                  }`}
                  style={isLast ? { color: GM_MINT_DARK } : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          )
        })}
      </nav>
    </div>
  )
}
