import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl.replace(/\/+$/, "");

export type ApiFoodOrderCustomizationLine = {
  name: string;
  amount: number;
  kind: "variant" | "addon" | "note";
};

export type ApiFoodOrderItem = {
  qty: number;
  name: string;
  price: number;
  menu_item_id?: number | null;
  veg_nonveg?: string | null;
  customizations?: string[];
  variant_tag?: string | null;
  category_name?: string | null;
  customization_lines?: ApiFoodOrderCustomizationLine[];
  base_amount?: number;
  customizations_total?: number;
  captured_base_amount?: number;
  captured_addon_amount?: number;
  has_customizations?: boolean;
};

export type ApiFoodOrderPricing = {
  subtotal: number;
  packaging: number;
  taxes: number;
  discount: number;
  total: number;
};

export type ApiFoodOrder = {
  orders_food_id: number;
  orders_core_id: number;
  core_only?: boolean;
  formatted_order_id: string | null;
  order_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  drop_address: string | null;
  distance_km: number | null;
  customer_store_order_ordinal: number | null;
  customer_store_orders_total: number | null;
  customer_platform_orders_total: number | null;
  is_bulk_order?: boolean;
  veg_non_veg?: string | null;
  created_at: string;
  delivery_type: "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP" | string;
  rider_id: number | null;
  rider_name?: string | null;
  rider_mobile?: string | null;
  rider_selfie_url?: string | null;
  rider_assignment_status?: string | null;
  rider_reached_at?: string | null;
  rider_display_variant?:
    | "on_the_way"
    | "arrived"
    | "picked_up"
    | "delivered"
    | "cancelled"
    | "rto"
    | null;
  core_status?: string | null;
  current_status?: string | null;
  reached_merchant_at?: string | null;
  rider_reached_pickup_at?: string | null;
  pickup_wait_seconds?: number | null;
  rider_store_wait_live?: boolean;
  rider_store_wait_anchor_at?: string | null;
  grand_total: number;
  food_items_total_value?: number | null;
  pricing?: ApiFoodOrderPricing | null;
  billing_snapshot?: Record<string, unknown> | null;
  payment_status?: string | null;
  items: ApiFoodOrderItem[];
  pickup_otp: string | null;
  rto_otp: string | null;
  requires_utensils?: boolean | null;
  delivery_instructions?: string | null;
  merchant_instructions_list?: unknown;
  payment_method: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  prepared_at: string | null;
  dispatched_at: string | null;
  preparation_time_minutes?: number | null;
  prep_ready_by_at?: string | null;
  expected_ready_at?: string | null;
  prep_delay_minutes?: number | null;
  prep_delay_use_count?: number | null;
  last_prep_delay_minutes_added?: number | null;
  prepared_late_minutes?: number | null;
  handed_over_to_rider_at?: string | null;
  rider_picked_up_at?: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  rejected_reason: string | null;
  accepted_by_label: string | null;
  cancelled_by_label: string | null;
  cancelled_by_type?: string | null;
  cancellation_compensation?: import("@/lib/merchantCancellationCompensation").MerchantCancellationCompensationDisplay | null;
  is_scheduled_order?: boolean;
  scheduled_delivery_summary?: string | null;
  merchant_response_deadline_at?: string | null;
  merchant_response_timeout_seconds?: number | null;
};

export async function fetchFoodOrders(
  storeId: number,
  token: string,
  opts?: { limit?: number }
): Promise<ApiFoodOrder[]> {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders${qs ? `?${qs}` : ""}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load orders");
  }
  const data = (await res.json()) as { orders?: ApiFoodOrder[] };
  return Array.isArray(data.orders) ? data.orders : [];
}

/** Cancel unaccepted orders past the acceptance window (portal-open flush). */
export async function syncAcceptanceTimeout(
  storeId: number,
  token: string
): Promise<{ cancelled: number }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/sync-acceptance-timeout`,
    token,
    { method: "POST" }
  );
  const data = (await res.json().catch(() => ({}))) as { cancelled?: number; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Failed to sync acceptance timeout");
  }
  return { cancelled: Number(data.cancelled ?? 0) };
}

export async function fetchFoodOrder(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<ApiFoodOrder> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load order");
  }
  const data = (await res.json()) as { order?: ApiFoodOrder };
  if (!data.order) throw new Error("Order not found");
  return data.order;
}

export type NearbyDispatchRiderSummary = {
  nearbyCount: number;
  radiusKm: number;
  assignSoonMessage: string;
};

export async function fetchNearbyDispatchRiders(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<{ summary: NearbyDispatchRiderSummary | null; riderAssigned: boolean }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/nearby-dispatch-riders`,
    token
  );
  if (!res.ok) {
    return { summary: null, riderAssigned: false };
  }
  const data = (await res.json()) as {
    ok?: boolean;
    summary?: NearbyDispatchRiderSummary | null;
    riderAssigned?: boolean;
  };
  return {
    summary: data.summary ?? null,
    riderAssigned: Boolean(data.riderAssigned),
  };
}

export type FoodOrderRiderLogEntry = {
  rider_id: number;
  rider_name: string | null;
  rider_mobile: string | null;
  selfie_url: string | null;
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

export type FoodOrderTimelineEntry = {
  id: number;
  status: string;
  previous_status: string | null;
  status_message: string | null;
  actor_type: string | null;
  occurred_at: string;
  expected_by_at: string | null;
  metadata: Record<string, unknown> | null;
};

export async function fetchFoodOrderTimeline(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<FoodOrderTimelineEntry[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/timeline`,
    token
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { timeline?: FoodOrderTimelineEntry[] };
  return Array.isArray(data.timeline) ? data.timeline : [];
}

export type MerchantOrderActionForTimeline = {
  to_status: string;
  action_source?: string | null;
  actor_label?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export async function fetchFoodOrderActions(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<MerchantOrderActionForTimeline[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/activity`,
    token
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { actions?: MerchantOrderActionForTimeline[] };
  return Array.isArray(data.actions) ? data.actions : [];
}

export async function fetchFoodOrderRidersLog(
  storeId: number,
  ordersFoodId: number,
  token: string
): Promise<FoodOrderRiderLogEntry[]> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/riders-log`,
    token
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { riders?: FoodOrderRiderLogEntry[] };
  return Array.isArray(data.riders) ? data.riders : [];
}

export async function patchFoodOrderStatus(
  storeId: number,
  ordersFoodId: number,
  token: string,
  status: string,
  rejectedReason?: string,
  opts?: {
    action_source?: string;
    accept_mode?: "auto" | "manual";
    cancel_mode?: "auto" | "manual";
    preparation_time_minutes?: number;
  }
): Promise<ApiFoodOrder> {
  const st = status.toUpperCase();
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        action_source: opts?.action_source ?? "app",
        ...(st === "ACCEPTED"
          ? {
              accept_mode: opts?.accept_mode ?? "manual",
              ...(opts?.preparation_time_minutes != null
                ? { preparation_time_minutes: opts.preparation_time_minutes }
                : {}),
            }
          : {}),
        ...(st === "CANCELLED" ? { cancel_mode: opts?.cancel_mode ?? "manual" } : {}),
        ...(rejectedReason ? { rejected_reason: rejectedReason } : {}),
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to update order");
  }
  const data = (await res.json()) as { order?: ApiFoodOrder };
  if (!data.order) throw new Error("Order update failed");
  return data.order;
}

export async function postFoodOrderPrepDelay(
  storeId: number,
  ordersFoodId: number,
  token: string,
  additionalMinutes: number
): Promise<ApiFoodOrder> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/prep-delay`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ additional_minutes: additionalMinutes }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to extend preparation time");
  }
  const data = (await res.json()) as { order?: ApiFoodOrder };
  if (!data.order) throw new Error("Prep delay update failed");
  return data.order;
}
