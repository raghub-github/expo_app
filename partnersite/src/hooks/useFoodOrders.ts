'use client';

import { useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export type FoodOrderStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RTO'
  | 'CANCELLED';

export interface OrdersFoodRow {
  id: number;
  order_id: number;
  formatted_order_id?: string | null;
  /** Unique, immutable tax invoice number (GM/<FY>/<serial>) — same across every surface. */
  tax_invoice_number?: string | null;
  merchant_store_id: number | null;
  merchant_parent_id: number | null;
  restaurant_name: string | null;
  restaurant_phone: string | null;
  preparation_time_minutes: number | null;
  prep_ready_by_at?: string | null;
  expected_ready_at?: string | null;
  prep_time_source?: string | null;
  prep_delay_minutes?: number | null;
  prep_delay_use_count?: number | null;
  last_prep_delay_minutes_added?: number | null;
  prepared_late_minutes?: number | null;
  food_items_count: number | null;
  display_item_count?: number | null;
  food_items_total_value: string | number | null;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
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
      kind: 'variant' | 'addon' | 'note';
    }>;
    baseAmount?: number;
    customizationsTotal?: number;
    hasCustomizations?: boolean;
  }>;
  item_total?: number | null;
  addon_total?: number | null;
  grand_total?: number | null;
  /** Frozen SSOT precision discount (orders_core.merchant_precision_discount) — pass-through, never recomputed. */
  merchant_precision_discount?: number | null;
  pricing?: {
    subtotal: number;
    packaging: number;
    taxes: number;
    discount: number;
    total: number;
  };
  requires_utensils: boolean | null;
  is_fragile: boolean | null;
  is_high_value: boolean | null;
  veg_non_veg: 'veg' | 'non_veg' | 'mixed' | 'na' | null;
  delivery_instructions: string | null;
  /** Kitchen / merchant notes from checkout (orders_food.merchant_instructions_list). */
  merchant_instructions_list?: string[] | null;
  // Customer details
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  /** Total historical orders for this customer at this store (orders_core count). */
  customer_order_count?: number | null;
  customer_platform_order_count?: number | null;
  /** 1-based ordinal of this order for the customer at this store. */
  customer_store_order_ordinal?: number | null;
  customer_platform_order_ordinal?: number | null;
  is_bulk_order?: boolean;
  /** Merchant answer: was rider in uniform? */
  merchant_rider_in_uniform?: boolean | null;
  // Rider details
  rider_id?: number | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  rider_details?: {
    id: number;
    name: string;
    mobile: string;
    selfie_url?: string | null;
    status?: string;
    city?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
  // Drop address
  drop_address_raw?: string | null;
  drop_address_normalized?: string | null;
  /** Store → customer distance (orders_core.distance_km). */
  distance_km?: number | null;
  /** Estimated delivery ETA in seconds (orders_core.eta_seconds). */
  eta_seconds?: number | null;
  /** Immutable First ETA at placement (orders_core.first_eta_at). */
  first_eta_at?: string | null;
  promised_delivery_at?: string | null;
  estimated_delivery_time?: string | null;
  // Customer character flags
  customer_scores?: {
    trust_score?: number | null;
    fraud_score?: number | null;
    risk_flag?: string | null;
  } | null;
  order_status?: string;
  accepted_at?: string | null;
  preparing_at?: string | null;
  prepared_at?: string | null;
  handed_over_to_rider_at?: string | null;
  rider_picked_up_at?: string | null;
  reached_merchant_at?: string | null;
  rider_reached_pickup_at?: string | null;
  pickup_wait_seconds?: number | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  rejected_reason?: string | null;
  accepted_by_label?: string | null;
  cancelled_by_label?: string | null;
  cancelled_by?: string | null;
  cancelled_by_type?: string | null;
  cancellation_details?: any;
  cancellation_compensation?: import('@/lib/merchantCancellationCompensation').MerchantCancellationCompensationDisplay | null;
  pickup_otp?: string | null;
  /** Secure pickup QR token (order_pickup_tokens.token) — merchant/partner print only. */
  pickup_token?: string | null;
  /** Backend-generated KOT number (store-scoped). */
  kot_number?: string | null;
  rto_otp?: string | null;
  payment_method?: string | null;
  /** True when this order has been returned to merchant (RTO). */
  is_rto?: boolean | null;
  /** GATIMITRA_RIDER | SELF_DELIVERY | SELF_PICKUP — drives merchant-complete UI. */
  delivery_type?: string | null;
  created_at: string;
  updated_at: string;
  /** True when this pipeline row is backed only by orders_core (e.g. parcel / before kitchen row exists). */
  core_only?: boolean;
  orders_food_row_id?: number | null;
  core_order_id?: number;
  core_status?: string | null;
  /** Kitchen / state machine (PLACED, ACCEPTED, PREPARING, …) — drives tabs with orders_core.status */
  current_status?: string | null;
  order_type?: string | null;
  merchant_response_deadline_at?: string | null;
  merchant_response_timeout_seconds?: number | null;
}

export interface FoodOrderStats {
  ordersToday: number;
  /** Orders placed today that are still in the active pipeline (not delivered / cancelled / RTO). */
  ordersTodayActive?: number;
  deliveredTodayCount?: number;
  /** Pending live-board orders (today + older) using unified pipeline status. */
  activeOrders: number;
  pendingCount?: number;
  avgPreparationTimeMinutes: number;
  totalRevenueToday: number;
  completionRatePercent: number;
}

export function useFoodOrders(storeId: string | null, storeInternalId: number | null) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  const subscribe = useCallback(
    (onInsert: (row: OrdersFoodRow) => void, onUpdate: (row: OrdersFoodRow) => void) => {
      if (!storeInternalId || !storeId) return () => {};
      const supabase = createClient();
      const channel = supabase
        .channel(`food_orders:${storeInternalId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders_food',
            filter: `merchant_store_id=eq.${storeInternalId}`,
          },
          (payload) => {
            onInsert(payload.new as OrdersFoodRow);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders_food',
            filter: `merchant_store_id=eq.${storeInternalId}`,
          },
          (payload) => {
            onUpdate(payload.new as OrdersFoodRow);
          }
        )
        .subscribe();

      channelRef.current = channel;
      return () => {
        channel.unsubscribe();
        channelRef.current = null;
      };
    },
    [storeId, storeInternalId]
  );

  return { subscribe };
}
