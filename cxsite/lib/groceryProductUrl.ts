import type { GroceryProduct } from '@/components/grocery/GroceryProductCard'

export function groceryProductHref(
  product: Pick<GroceryProduct, 'id' | 'storeSlug'>
): string {
  const base = `/grocery/product/${encodeURIComponent(product.id)}`
  if (!product.storeSlug?.trim()) return base
  const qs = new URLSearchParams({ store: product.storeSlug.trim() })
  return `${base}?${qs.toString()}`
}

export function groceryCategoryHref(category: string, storeSlug?: string | null): string {
  const label = category.trim()
  if (!label) return '/grocery'
  const qs = new URLSearchParams({ category: label })
  if (storeSlug?.trim()) {
    return `/grocery?${qs.toString()}`
  }
  return `/grocery?${qs.toString()}`
}
