/**
 * Types aligned to public.merchant_menu_items and public.merchant_stores.
 * Only fields used by the customer app are included.
 */

export type MerchantMenuItemRow = {
  id: number;
  store_id: number;
  category_id: number | null;
  item_id: string;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  food_type: string | null;
  spice_level: string | null;
  cuisine_type: string | null;
  base_price: string;
  selling_price: string;
  discount_percentage: string | null;
  in_stock: boolean | null;
  is_active: boolean | null;
  is_popular: boolean | null;
  is_recommended: boolean | null;
  preparation_time_minutes: number | null;
  has_customizations?: boolean | null;
  has_addons?: boolean | null;
  has_variants?: boolean | null;
};

export type MenuItemVariantRow = {
  id: number;
  variant_id: string;
  menu_item_id: number;
  variant_name: string;
  variant_type: string | null;
  variant_price: string;
  price_difference: string | null;
  in_stock: boolean | null;
  display_order: number | null;
  is_default: boolean | null;
};

export type MenuItemCustomizationRow = {
  id: number;
  customization_id: string;
  menu_item_id: number;
  customization_title: string;
  customization_type: string | null;
  is_required: boolean | null;
  min_selection: number | null;
  max_selection: number | null;
  display_order: number | null;
};

export type MenuItemAddonRow = {
  id: number;
  addon_id: string;
  customization_id: number;
  addon_name: string;
  addon_price: string | null;
  addon_image_url: string | null;
  in_stock: boolean | null;
  display_order: number | null;
};

export type MerchantStoreRow = {
  id: number;
  store_id: string;
  store_name: string;
  store_display_name: string | null;
  store_description: string | null;
  full_address?: string | null;
  postal_code?: string | null;
  logo_url: string | null;
  banner_url: string | null;
  gallery_images?: string[] | null;
  ads_images?: string[] | null;
  cuisine_types: string[] | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  operational_status: string | null;
  avg_preparation_time_minutes: number | null;
  is_active: boolean | null;
  is_available: boolean | null;
  is_accepting_orders: boolean | null;
  status: string | null;
  created_at?: string | null;
  /** From DB generated column (migration 0054). UI must read this only. Fallback: computeLiveStatus(). */
  live_status?: string | null;
  /** Parent merchant id; used by order creation (never from frontend). */
  parent_id?: number | null;
};

/** Fallback when DB live_status not available. OPEN only when all four conditions met. */
export function computeLiveStatus(row: {
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  operational_status?: string | null;
}): "OPEN" | "CLOSED" {
  const op = (row.operational_status ?? "").toString().trim().toUpperCase();
  const isAvailable = row.is_available === undefined ? true : row.is_available === true;
  if (
    row.is_active === true &&
    isAvailable &&
    row.is_accepting_orders === true &&
    op === "OPEN"
  ) {
    return "OPEN";
  }
  return "CLOSED";
}

/** display_image from RPC; live_status from DB (single source of truth). */
export type NearbyStoreRow = MerchantStoreRow & {
  distance_km: number;
  display_image?: string | null;
  avg_preparation_time_minutes?: number | null;
  live_status?: string | null;
};

export type MerchantMenuCategoryRow = {
  id: number;
  store_id: number;
  category_name: string;
  display_order: number | null;
};

