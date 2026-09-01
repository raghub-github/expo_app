import {
  Apple,
  Baby,
  Cookie,
  GlassWater,
  LayoutGrid,
  Leaf,
  Milk,
  Package,
  ShoppingBasket,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export type GroceryCategoryMeta = {
  label: string
  icon: LucideIcon
}

const CATEGORY_ICON_RULES: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /drink|beverage|juice|soda|water/i, icon: GlassWater },
  { match: /dairy|milk|bread|curd|paneer|cheese/i, icon: Milk },
  { match: /snack|namkeen|bhujia|mixture|chips/i, icon: Cookie },
  { match: /baby/i, icon: Baby },
  { match: /paan|mouth|freshener/i, icon: Leaf },
  { match: /fruit|fresh|vegetable|produce/i, icon: Apple },
  { match: /home|otc|pure|clean/i, icon: Sparkles },
  { match: /veg\b|vegetarian/i, icon: Leaf },
  { match: /grocery|staple|pantry/i, icon: ShoppingBasket },
]

export const GROCERY_ALL_CATEGORY: GroceryCategoryMeta = {
  label: 'All',
  icon: LayoutGrid,
}

export function groceryCategoryMeta(name: string): GroceryCategoryMeta {
  const label = name.trim()
  if (!label || label.toLowerCase() === 'all') return GROCERY_ALL_CATEGORY
  const rule = CATEGORY_ICON_RULES.find((r) => r.match.test(label))
  return { label, icon: rule?.icon ?? Package }
}

export function buildGroceryCategoryList(productCategories: Array<string | null | undefined>): GroceryCategoryMeta[] {
  const unique = Array.from(
    new Set(productCategories.map((c) => String(c ?? '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  return [GROCERY_ALL_CATEGORY, ...unique.map(groceryCategoryMeta)]
}
