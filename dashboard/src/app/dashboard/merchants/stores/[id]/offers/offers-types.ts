export interface Offer {
  id?: number;
  offer_id: string;
  store_id: number;
  offer_title: string;
  offer_description: string | null;
  offer_type: "BUY_N_GET_M" | "PERCENTAGE" | "FLAT" | "COUPON" | "FREE_ITEM";
  offer_sub_type: "ALL_ORDERS" | "SPECIFIC_ITEM";
  menu_item_ids: string[] | null;
  discount_value: string | null;
  min_order_amount: string | null;
  buy_quantity: number | null;
  get_quantity: number | null;
  coupon_code: string | null;
  image_url: string | null;
  /** width/height (e.g. 2 for 800x400). Saved into offer_metadata. */
  offer_image_aspect_ratio?: number | null;
  valid_from: string;
  valid_till: string;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
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
