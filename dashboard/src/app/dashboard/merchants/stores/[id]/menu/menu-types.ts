// Placeholder SVG for menu items when no image (restaurant-style)
export const ITEM_PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" fill="#f3f4f6"/><path d="M32 18c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9zm0 14c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="#d1d5db"/><path d="M20 38l4 12h16l4-12H20z" fill="#9ca3af"/><ellipse cx="32" cy="44" rx="12" ry="3" fill="#e5e7eb"/></svg>'
  );

export const CUSTOMIZATION_VARIANT_LIMIT = 10;
/** Same values as merchant app and DB: VEG, NON_VEG, EGG, Vegan */
export const FOOD_TYPES = [
  { value: "VEG", label: "Veg" },
  { value: "NON_VEG", label: "Non-Veg" },
  { value: "EGG", label: "Egg" },
  { value: "Vegan", label: "Vegan" },
] as const;
/** Display order; DB may store "Mild" or "MILD" – normalize when loading */
export const SPICE_LEVELS = ["Mild", "Medium", "Hot", "Very Hot"];
/** Map API/DB spice value to form option (e.g. MILD -> Mild) */
export function normalizeSpiceLevelForForm(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const u = (v as string).trim();
  if (!u) return "";
  const lower = u.toLowerCase();
  if (lower === "mild") return "Mild";
  if (lower === "medium") return "Medium";
  if (lower === "hot") return "Hot";
  if (lower === "very hot" || lower === "very_hot" || lower === "extra_hot") return "Very Hot";
  return u;
}
/** Map API/DB food_type to form value (VEG, NON_VEG, EGG, Vegan) */
export function normalizeFoodTypeForForm(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const u = (v as string).trim();
  if (!u) return "";
  const upper = u.toUpperCase();
  if (upper === "VEG" || u === "Vegetarian") return "VEG";
  if (upper === "NON_VEG" || u === "Non-Vegetarian" || u === "Non-Veg") return "NON_VEG";
  if (upper === "EGG" || u === "Eggitarian" || u === "Egg") return "EGG";
  if (u === "Vegan") return "Vegan";
  return u;
}

/** Display label for food_type (VEG -> "Veg", etc.) */
export function getFoodTypeLabel(v: string | null | undefined): string {
  const value = normalizeFoodTypeForForm(v) || (v as string) || "";
  const found = FOOD_TYPES.find((t) => t.value === value);
  return found ? found.label : value;
}
export const CUISINE_TOP_COUNT = 7;
export const CUSTOMIZATION_TYPES = ["Radio", "Checkbox", "Dropdown", "Text"];

export const CUISINE_TYPES = [
  "North Indian", "Chinese", "Fast Food", "South Indian", "Biryani", "Pizza", "Bakery", "Street Food", "Burger", "Mughlai",
  "Momos", "Sandwich", "Mithai", "Rolls", "Beverages", "Desserts", "Cafe", "Healthy Food", "Maharashtrian", "Tea", "Bengali",
  "Ice Cream", "Juices", "Shake", "Shawarma", "Gujarati", "Italian", "Continental", "Lebanese", "Salad", "Andhra", "Waffle",
  "Coffee", "Kebab", "Arabian", "Kerala", "Asian", "Seafood", "Pasta", "BBQ", "Rajasthani", "Wraps", "Hyderabadi", "Mexican",
];

// Mirror key serving/size options from merchant app (simplified).
export const SERVES_OPTIONS = [
  "1 person",
  "1 - 2 people",
  "2 - 3 people",
  "3 - 4 people",
  "4 - 5 people",
  "5 - 6 people",
  "6 - 7 people",
  "7 - 8 people",
  "8 - 9 people",
];

export const SIZE_UNITS = ["slices", "kg", "L", "litre", "ml", "serves", "cms", "piece", "grams", "inches"];

/** Aligned with merchant app + backend `merchant_menu_items` (food / restaurant). */
export const WEIGHT_PER_SERVING_UNITS = ["grams", "kg", "oz", "lbs"] as const;
export const NUTRIENT_UNITS = ["mg", "g"] as const;

export interface Addon {
  id?: number;
  addon_id: string;
  customization_id: number;
  addon_name: string;
  addon_price: number;
  addon_image_url?: string;
  addon_size_value?: number | null;
  addon_size_unit?: string | null;
  in_stock?: boolean;
  display_order?: number;
}

export interface Customization {
  id?: number;
  customization_id: string;
  menu_item_id: number;
  customization_title: string;
  customization_type?: string;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  display_order: number;
  addons?: Addon[];
}

export interface Variant {
  id?: number;
  variant_id: string;
  menu_item_id: number;
  variant_name: string;
  variant_type?: string;
  variant_price: number;
  /** Optional portion size or range (e.g. 500 or 1500-1700). */
  variant_size_value?: string | number | null;
  variant_size_unit?: string | null;
  price_difference?: number;
  in_stock?: boolean;
  display_order?: number;
  is_default?: boolean;
}

export interface MenuItemImage {
  id: number;
  image_url: string;
  is_primary: boolean;
  display_order: number;
  moderation_status?: string | null;
  rejection_reason?: string | null;
  moderated_at?: string | null;
  created_at?: string | null;
}

export interface MenuItem {
  id: number;
  item_id: string;
  item_name: string;
  category_id: number | null;
  category_type?: string;
  base_price: number;
  selling_price: number;
  discount_percentage: number;
  tax_percentage?: number;
  in_stock?: boolean;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
  has_customizations?: boolean;
  has_addons?: boolean;
  has_variants?: boolean;
  is_popular?: boolean;
  is_recommended?: boolean;
  item_image_url?: string;
  item_description?: string;
  preparation_time_minutes?: number;
  /** Per-item packaging fee (₹); overrides store default for this item only when set */
  packaging_charges?: number | null;
  serves?: number;
  serves_label?: string | null;
  item_size_value?: number | null;
  item_size_unit?: string | null;
  available_for_delivery?: boolean;
  weight_per_serving?: number | null;
  weight_per_serving_unit?: string | null;
  calories_kcal?: number | null;
  protein?: number | null;
  protein_unit?: string | null;
  carbohydrates?: number | null;
  carbohydrates_unit?: string | null;
  fat?: number | null;
  fat_unit?: string | null;
  fibre?: number | null;
  fibre_unit?: string | null;
  item_tags?: string[] | null;
  allergens?: string[] | string;
  customizations?: Customization[];
  variants?: Variant[];
  food_type?: string;
  spice_level?: string;
  cuisine_type?: string;
  is_active?: boolean;
  /** Soft-deleted items are hidden by the default LIVE visibility filter. */
  is_deleted?: boolean;
  store_id?: number;
  approval_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  primary_image_moderation_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  rejection_reason?: string | null;
  has_pending_change_request?: boolean;
  pending_change_request_type?: "CREATE" | "UPDATE" | "DELETE" | null;
  images?: MenuItemImage[];
  /** From GET item detail: reusable addon groups linked to this item */
  linked_modifier_groups?: Array<{
    id: number;
    title: string;
    description?: string | null;
    is_required?: boolean;
    min_selection?: number;
    max_selection?: number;
    options?: Array<{ id: number; name: string; price_delta: string; in_stock?: boolean }>;
  }>;
}

export function itemHasCustomizationContent(item: MenuItem): boolean {
  return (
    !!item.has_customizations ||
    !!item.has_addons ||
    !!item.has_variants ||
    (item.customizations?.length ?? 0) > 0 ||
    (item.variants?.length ?? 0) > 0 ||
    (item.linked_modifier_groups?.length ?? 0) > 0
  );
}

export interface MenuCategory {
  id: number;
  store_id: number;
  category_name: string;
  category_description?: string | null;
  parent_category_id?: number | null;
  /** FOOD / restaurant root categories — FK to `cuisine_master` (store must have row in merchant_store_cuisines) */
  cuisine_id?: number | null;
  display_order?: number | null;
  is_active?: boolean;
  out_of_stock_manual?: boolean;
  out_of_stock_until?: string | null;
  out_of_stock_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type MenuItemPriceFields = Pick<
  MenuItem,
  "base_price" | "selling_price" | "discount_percentage"
>;

export function menuItemBasePrice(item: MenuItemPriceFields): number {
  const n = Number(item.base_price);
  return Number.isFinite(n) ? n : 0;
}

export function menuItemSellingPrice(item: MenuItemPriceFields): number {
  const selling = Number(item.selling_price);
  if (Number.isFinite(selling) && selling > 0) return selling;
  const base = menuItemBasePrice(item);
  return base > 0 ? base : 0;
}

/** True when base (MRP) is higher than selling price — show strike-through. */
export function menuItemShowStrikePrice(item: MenuItemPriceFields): boolean {
  const base = menuItemBasePrice(item);
  const selling = menuItemSellingPrice(item);
  return base > 0 && selling > 0 && base > selling;
}

export function menuItemDiscountPercent(item: MenuItemPriceFields): number {
  const base = menuItemBasePrice(item);
  const selling = menuItemSellingPrice(item);
  if (menuItemShowStrikePrice(item)) {
    return Math.round(((base - selling) / base) * 100);
  }
  const pct = Number(item.discount_percentage);
  return Number.isFinite(pct) && pct > 0 ? Math.round(pct) : 0;
}

