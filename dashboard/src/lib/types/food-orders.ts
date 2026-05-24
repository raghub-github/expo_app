/**
 * Store food orders (aligned with partnersite OrdersFoodRow / orders_core + orders_food pipeline).
 */

import type { OrderPricingBreakdown } from "@/lib/orderLineItems";

export type OrdersFoodRow = {
  id: number;
  order_id: number;
  formatted_order_id?: string | null;
  order_status: string;
  created_at: string;
  updated_at?: string;
  accepted_at?: string | null;
  preparing_at?: string | null;
  prepared_at?: string | null;
  handed_over_to_rider_at?: string | null;
  rider_picked_up_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by_type?: string | null;
  cancelled_by?: string | null;
  restaurant_name?: string | null;
  restaurant_phone?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  drop_address_raw?: string | null;
  drop_address_normalized?: string | null;
  delivery_instructions?: string | null;
  food_items_count?: number | null;
  display_item_count?: number | null;
  food_items_total_value?: number | string | null;
  preparation_time_minutes?: number | null;
  prep_ready_by_at?: string | null;
  prep_time_source?: 'merchant' | 'store_default' | string | null;
  prep_delay_minutes?: number | null;
  prepared_late_minutes?: number | null;
  estimated_delivery_time?: string | null;
  items?: Array<{
    name?: string;
    quantity?: number;
    price?: number;
    total?: number;
    customizations?: string[];
    vegNonveg?: string | null;
    menuItemId?: number | null;
    variantName?: string | null;
    variantTag?: string | null;
    categoryName?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    customizationLines?: Array<{
      name: string;
      amount: number;
      kind: "variant" | "addon" | "note";
    }>;
    baseAmount?: number;
    customizationsTotal?: number;
    hasCustomizations?: boolean;
  }> | null;
  pricing?: OrderPricingBreakdown;
  veg_non_veg?: string | null;
  requires_utensils?: boolean | null;
  is_fragile?: boolean | null;
  is_high_value?: boolean | null;
  rejected_reason?: string | null;
  accepted_by_label?: string | null;
  cancelled_by_label?: string | null;
  rider_id?: number | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  rider_details?: {
    id?: number;
    name?: string;
    mobile?: string;
    city?: string;
    status?: string;
    selfie_url?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
  customer_order_count?: number | null;
  customer_platform_order_count?: number | null;
  customer_store_order_ordinal?: number | null;
  customer_platform_order_ordinal?: number | null;
  customer_scores?: {
    trust_score?: number | null;
    fraud_score?: number | null;
    risk_flag?: string | null;
  } | null;
  core_only?: boolean;
  orders_food_row_id?: number | null;
  core_order_id?: number;
  core_status?: string | null;
  current_status?: string | null;
  order_type?: string | null;
  distance_km?: number | null;
  eta_seconds?: number | null;
  merchant_store_id?: number | null;
  pickup_otp?: string | null;
  rto_otp?: string | null;
};

export interface FoodOrderStats {
  ordersToday: number;
  ordersTodayActive?: number;
  activeOrders: number;
  avgPreparationTimeMinutes: number;
  totalRevenueToday: number;
  completionRatePercent: number;
}
