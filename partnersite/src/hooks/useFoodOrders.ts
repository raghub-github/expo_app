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
  merchant_store_id: number | null;
  merchant_parent_id: number | null;
  restaurant_name: string | null;
  restaurant_phone: string | null;
  preparation_time_minutes: number | null;
  food_items_count: number | null;
  food_items_total_value: string | number | null;
  items?: any; // JSONB array of items
  requires_utensils: boolean | null;
  is_fragile: boolean | null;
  is_high_value: boolean | null;
  veg_non_veg: 'veg' | 'non_veg' | 'mixed' | 'na' | null;
  delivery_instructions: string | null;
  // Customer details
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
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
  // Customer character flags
  customer_scores?: {
    trust_score?: number | null;
    fraud_score?: number | null;
    risk_flag?: string | null;
  } | null;
  order_status?: string;
  accepted_at?: string | null;
  prepared_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  rejected_reason?: string | null;
  cancelled_by?: string | null;
  cancelled_by_type?: string | null;
  cancellation_details?: any; // JSONB
  created_at: string;
  updated_at: string;
}

export interface FoodOrderStats {
  ordersToday: number;
  activeOrders: number;
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
