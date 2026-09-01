import type { GroceryProduct } from '@/components/grocery/GroceryProductCard'

export function groceryProductDetailHref(
  product: Pick<GroceryProduct, 'id' | 'storeSlug'>
): string {
  const base = `/grocery/product/${encodeURIComponent(product.id)}`
  if (product.storeSlug?.trim()) {
    return `${base}?store=${encodeURIComponent(product.storeSlug.trim())}`
  }
  return base
}
