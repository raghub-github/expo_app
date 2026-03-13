// Placeholder SVG for menu items when no image (restaurant-style)
export const ITEM_PLACEHOLDER_SVG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" fill="#f3f4f6"/><path d="M32 18c-5 0-9 4-9 9s4 9 9 9 9-4 9-9-4-9-9-9zm0 14c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z" fill="#d1d5db"/><path d="M20 38l4 12h16l4-12H20z" fill="#9ca3af"/><ellipse cx="32" cy="44" rx="12" ry="3" fill="#e5e7eb"/></svg>'
  );

// Suggested category names for type-ahead (max 30 chars)
export const CATEGORY_SUGGESTIONS = [
  "North Indian", "South Indian", "Mughlai", "Punjabi", "Chinese", "Indo-Chinese", "Thai", "Italian", "Mexican", "American",
  "Fast Food", "Street Food", "Cafe", "Bakery", "Desserts", "Beverages", "Pizza", "Burger", "Sandwich", "Momos", "Biryani",
  "Breakfast", "Snacks", "Sweets", "Pure Veg", "Seafood", "Chicken Special", "Healthy Food", "Thali", "Combo Meals",
].map((n) => (n.length > 30 ? n.slice(0, 30) : n));

export const CUSTOMIZATION_VARIANT_LIMIT = 10;
export const FOOD_TYPES = ["Vegetarian", "Non-Vegetarian", "Vegan", "Eggitarian"];
export const SPICE_LEVELS = ["Mild", "Medium", "Hot", "Very Hot"];
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

export const SIZE_UNITS = ["slices", "kg", "litre", "ml", "serves", "cms", "piece", "grams", "inches"];

export interface Addon {
  id?: number;
  addon_id: string;
  customization_id: number;
  addon_name: string;
  addon_price: number;
  addon_image_url?: string;
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
  price_difference?: number;
  in_stock?: boolean;
  display_order?: number;
  is_default?: boolean;
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
  has_customizations?: boolean;
  has_addons?: boolean;
  has_variants?: boolean;
  is_popular?: boolean;
  is_recommended?: boolean;
  item_image_url?: string;
  item_description?: string;
  preparation_time_minutes?: number;
  serves?: number;
  serves_label?: string | null;
  item_size_value?: number | null;
  item_size_unit?: string | null;
  allergens?: string[] | string;
  customizations?: Customization[];
  variants?: Variant[];
  food_type?: string;
  spice_level?: string;
  cuisine_type?: string;
  is_active?: boolean;
  store_id?: number;
  approval_status?: "PENDING" | "APPROVED" | "REJECTED" | null;
  has_pending_change_request?: boolean;
  pending_change_request_type?: "CREATE" | "UPDATE" | "DELETE" | null;
}

export interface MenuCategory {
  id: number;
  store_id: number;
  category_name: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}
