export type AllOfferTypes =
  | "PERCENTAGE"
  | "FLAT"
  | "CART_PERCENTAGE"
  | "CART_FLAT"
  | "BUY_X_GET_Y"
  | "BUY_N_GET_M"
  | "BOGO"
  | "FREE_ITEM"
  | "FREE_DELIVERY"
  | "BUNDLE"
  | "TIERED"
  | "COUPON";

export interface Offer {
  id?: number;
  offer_id: string;
  store_id: number;
  offer_title: string;
  offer_description: string | null;
  offer_type: AllOfferTypes;
  offer_sub_type: "ALL_ORDERS" | "SPECIFIC_ITEM";
  menu_item_ids: string[] | null;
  discount_value: string | null;
  discount_percentage: string | null;
  max_discount_amount: string | null;
  min_order_amount: string | null;
  max_order_amount: string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  coupon_code: string | null;
  image_url: string | null;
  /** width/height (e.g. 2 for 800x400). Saved into offer_metadata. */
  offer_image_aspect_ratio?: number | null;
  valid_from: string;
  valid_till: string;
  is_active: boolean | null;
  auto_apply: boolean | null;
  is_stackable: boolean | null;
  priority: number | null;
  per_order_limit: number | null;
  first_order_only: boolean | null;
  new_user_only: boolean | null;
  max_uses_total: number | null;
  max_uses_per_user: number | null;
  current_uses: number | null;
  applicable_on_days: string[] | null;
  applicable_time_start: string | null;
  applicable_time_end: string | null;
  offer_metadata: Record<string, unknown> | null;
  created_source_platform: string | null;
  created_by_role: string | null;
  approval_status: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  updated_by_name: string | null;
}

export interface MenuItemForOffer {
  item_id: string;
  item_name: string;
  category_type?: string;
  food_category_item?: string;
  actual_price?: number;
  base_price?: number;
  selling_price?: number;
  in_stock?: boolean;
}

export interface OfferTier {
  min_order: string;
  discount_pct: string;
  discount_flat: string;
}
