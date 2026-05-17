import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl.replace(/\/+$/, "");

export type ApiFoodOrderItem = {
  qty: number;
  name: string;
  price: number;
  veg_nonveg?: string | null;
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
  is_bulk_order?: boolean;
  veg_non_veg?: string | null;
  created_at: string;
  delivery_type: "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP" | string;
  rider_id: number | null;
  grand_total: number;
  items: ApiFoodOrderItem[];
  pickup_otp: string | null;
  rto_otp: string | null;
  payment_method: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  prepared_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  rejected_reason: string | null;
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

export async function patchFoodOrderStatus(
  storeId: number,
  ordersFoodId: number,
  token: string,
  status: string,
  rejectedReason?: string
): Promise<ApiFoodOrder> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
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
