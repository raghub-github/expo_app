'use client'

import GroceryProductCard, { type GroceryProduct } from '@/components/grocery/GroceryProductCard'
import type { RefObject } from 'react'

type Props = {
  loading: boolean
  error: string | null
  filteredProducts: GroceryProduct[]
  totalCount: number
  categories: string[]
  searchQuery: string
  selectedCategory: string
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onSelectCategory: (category: string) => void
  menuSelectionsHeaderRef: RefObject<HTMLDivElement | null>
  menuColumnRef: RefObject<HTMLDivElement | null>
  searchListMinHeightRef: React.MutableRefObject<number | null>
}

export default function GroceryStoreMenuSection({
  loading,
  error,
  filteredProducts,
  totalCount,
  categories,
  searchQuery,
  selectedCategory,
  onSearchChange,
  onClearSearch,
  onSelectCategory,
  menuSelectionsHeaderRef,
  menuColumnRef,
  searchListMinHeightRef,
}: Props) {
  if (loading) {
    return (
      <div className="py-12 text-center text-text-light">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
          <span className="h-2 w-2 rounded-full bg-mint/60 animate-pulse [animation-delay:150ms]" />
          <span className="ml-2 font-medium">Loading products…</span>
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-20 text-center px-4">
        <p className="text-text-light text-sm max-w-sm mx-auto mb-4">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-gradient-to-r from-[#16c2a5] to-[#0fa589] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Retry
        </button>
      </div>
    )
  }

  if (totalCount === 0) {
    return (
      <div className="py-20 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-mint mb-3">Products</p>
        <h3 className="text-2xl font-semibold text-text tracking-tight mb-2">Nothing listed yet</h3>
        <p className="text-text-light text-sm max-w-xs mx-auto leading-relaxed">
          This store has no grocery products in the catalog right now.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={menuColumnRef}
      className="w-full min-w-0"
      style={
        searchQuery.trim() && searchListMinHeightRef.current
          ? { minHeight: searchListMinHeightRef.current }
          : undefined
      }
    >
      <div
        ref={menuSelectionsHeaderRef}
        className="sticky top-0 z-30 w-full shrink-0 isolate border-b border-border/30 bg-bg/95 pb-3 pt-4 backdrop-blur-md supports-[backdrop-filter]:bg-bg/90"
      >
        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-mint/90 mb-2.5">
              Selections
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text tracking-tight leading-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#16c2a5] to-[#0fa589]">
                Products
              </span>
              <span className="text-text-light font-normal text-lg sm:text-xl ml-2 tabular-nums">
                {filteredProducts.length} items
              </span>
            </h2>
          </div>

          <div className="relative flex w-full min-w-0 flex-1 items-center rounded-lg border border-neutral-200/90 bg-white shadow-sm sm:mx-2 sm:max-w-md">
            <i className="fas fa-search shrink-0 pl-3 text-xs text-text-light/50" aria-hidden />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Search products by name…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full min-w-0 bg-transparent py-2 pl-2 pr-8 text-sm placeholder:text-text-light/45 focus:outline-none"
              aria-label="Search products"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute right-2 p-0.5 text-text-light/50 transition-colors hover:text-mint"
                aria-label="Clear search"
              >
                <i className="fas fa-times text-xs" />
              </button>
            ) : null}
          </div>

          <p className="hidden shrink-0 text-sm text-text-light sm:block">
            {searchQuery.trim() ? (
              <>
                Showing{' '}
                <span className="font-medium text-text">
                  {filteredProducts.length} match
                  {filteredProducts.length === 1 ? '' : 'es'}
                </span>
              </>
            ) : (
              <>
                Showing <span className="font-medium text-text">{selectedCategory}</span>
              </>
            )}
          </p>
        </div>

        {categories.length > 1 ? (
          <div className="mt-3 border-t border-border/20 pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-light">
              Browse
            </p>
            <nav
              className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar scroll-smooth"
              aria-label="Product categories"
            >
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onSelectCategory(cat)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                    selectedCategory === cat
                      ? 'border-mint/40 bg-mint/10 text-mint shadow-sm'
                      : 'border-[#e5e7eb] bg-white text-[#4b5563] hover:border-mint/30 hover:text-mint'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>
        ) : null}
      </div>

      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 pb-8 pt-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredProducts.map((product) => (
            <GroceryProductCard
              key={`${product.menuItemPk}-${product.id}`}
              product={product}
              hideStoreLink
            />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-text-light">No products match your search.</p>
      )}
    </div>
  )
}
