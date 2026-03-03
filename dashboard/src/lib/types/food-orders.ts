/**
 * Types for store food orders (MX-compatible shape).
 */

export interface OrdersFoodRow {
  id: number;
  order_id: number;
  formatted_order_id?: string | null;
  order_status: string;
  created_at: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by_type?: string | null;
  restaurant_name?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  drop_address_raw?: string | null;
  drop_address_normalized?: string | null;
  delivery_instructions?: string | null;
  food_items_count?: number | null;
  food_items_total_value?: number | string | null;
  preparation_time_minutes?: number | null;
  items?: Array<{
    name?: string;
    quantity?: number;
    price?: number;
    total?: number;
    customizations?: string[];
  }> | null;
  veg_non_veg?: string | null;
  requires_utensils?: boolean | null;
  is_fragile?: boolean | null;
  is_high_value?: boolean | null;
  rejected_reason?: string | null;
  rider_id?: number | null;
  rider_name?: string | null;
  rider_details?: {
    id?: number;
    name?: string;
    mobile?: string;
    city?: string;
    status?: string;
    selfie_url?: string | null;
  } | null;
  customer_scores?: { trust_score?: number } | null;
}

export interface FoodOrderStats {
  ordersToday: number;
  activeOrders: number;
  avgPreparationTimeMinutes: number;
  totalRevenueToday: number;
  completionRatePercent: number;
}
