'use client'

import GroceryScrollArrows from '@/components/grocery/GroceryScrollArrows'
import type { GroceryCategoryMeta } from '@/lib/groceryCategoryMeta'
import { GM_MINT_DARK } from '@/lib/groceryBrand'

type Props = {
  categories: GroceryCategoryMeta[]
  selected: string
  onSelect: (label: string) => void
  sticky?: boolean
}

export default function GroceryCategoryBar({
  categories,
  selected,
  onSelect,
  sticky = true,
}: Props) {
  if (categories.length <= 1) return null

  return (
    <div
      className={`border-b border-[#ececf1] bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)] ${
        sticky ? 'sticky top-[64px] z-40' : ''
      }`}
    >
      <div className="mx-auto max-w-[1680px] px-1 sm:px-2">
        <GroceryScrollArrows
          navCompact
          innerClassName="flex items-stretch gap-0 py-0"
        >
          <nav className="flex items-stretch" aria-label="Grocery categories">
            {categories.map((cat) => {
              const active = selected === cat.label
              const Icon = cat.icon
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => onSelect(cat.label)}
                  className="group relative flex min-w-[76px] shrink-0 flex-col items-center px-2.5 pb-0 pt-3 transition-colors sm:min-w-[88px] sm:px-3.5 sm:pt-3.5"
                >
                  <Icon
                    className="h-[22px] w-[22px] sm:h-6 sm:w-6"
                    strokeWidth={active ? 2.25 : 1.75}
                    style={{ color: active ? GM_MINT_DARK : '#6b7280' }}
                    aria-hidden
                  />
                  <span
                    className={`mt-2 max-w-[72px] truncate text-center text-[11px] font-medium leading-tight sm:max-w-[84px] sm:text-xs ${
                      active
                        ? 'font-semibold text-[#0fa589]'
                        : 'text-[#4b5563] group-hover:text-[#374151]'
                    }`}
                  >
                    {cat.label}
                  </span>
                  <span
                    className={`mt-2.5 block h-[3px] w-full rounded-t-sm transition-all ${
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'
                    }`}
                    style={{ backgroundColor: GM_MINT_DARK }}
                    aria-hidden
                  />
                </button>
              )
            })}
          </nav>
        </GroceryScrollArrows>
      </div>
    </div>
  )
}
