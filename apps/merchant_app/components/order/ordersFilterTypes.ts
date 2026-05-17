import type { OrderRecord, OrderStage } from "@/hooks/useOrders";
import { isOrderVegOnly } from "@/lib/orderItemVeg";

export type OrderTypeFilterId = "self_delivery" | "bulk" | "veg_only" | "gatimitra";

export type OrdersSheetCategory =
  | "status"
  | "ratings"
  | "kpt"
  | "complaints"
  | "order_type";

export type OrdersFilters = {
  statuses: OrderStage[];
  orderTypes: OrderTypeFilterId[];
  /** Visual-only until ratings are on orders API */
  ratings: string[];
  kptDelays: string[];
  complaints: string[];
};

export const EMPTY_ORDERS_FILTERS: OrdersFilters = {
  statuses: [],
  orderTypes: [],
  ratings: [],
  kptDelays: [],
  complaints: [],
};

export function countActiveFilters(f: OrdersFilters): number {
  return (
    f.statuses.length +
    f.orderTypes.length +
    f.ratings.length +
    f.kptDelays.length +
    f.complaints.length
  );
}

export function orderMatchesSheetFilters(order: OrderRecord, f: OrdersFilters): boolean {
  if (f.statuses.length > 0 && !f.statuses.includes(order.status)) return false;
  if (f.orderTypes.length > 0) {
    const hit = f.orderTypes.some((t) => {
      if (t === "self_delivery") return order.deliveryType === "SELF_DELIVERY";
      if (t === "gatimitra") return order.deliveryType === "GATIMITRA_RIDER";
      if (t === "bulk") return order.isBulkOrder === true;
      if (t === "veg_only") {
        return isOrderVegOnly(
          order.lineItems.map((it) => ({ name: it.name, vegNonveg: it.vegNonveg })),
          order.vegNonVeg
        );
      }
      return false;
    });
    if (!hit) return false;
  }
  return true;
}
