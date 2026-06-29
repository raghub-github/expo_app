import { client as pgClient } from "@/lib/drizzle";
import {
  loadMerchantCompensationPolicyDisplay,
  resolveOrderCancellationCompensationDisplay,
  type MerchantCancellationCompensationDisplay,
} from "@/lib/merchant-cancellation-compensation-display";

type OrderRow = {
  order_id: number;
  order_status?: string | null;
  merchant_store_id?: number | null;
  rejected_reason?: string | null;
  cancelled_by_label?: string | null;
  cancelled_by_type?: string | null;
  created_at?: string | null;
  cancelled_at?: string | null;
  prepared_at?: string | null;
  rider_picked_up_at?: string | null;
  food_items_total_value?: string | number | null;
  grand_total?: string | number | null;
  pricing?: { total?: number } | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function enrichOrdersWithCancellationCompensation<T extends OrderRow>(
  orders: T[]
): Promise<(T & { cancellation_compensation?: MerchantCancellationCompensationDisplay | null })[]> {
  const cancelled = orders.filter(
    (o) => String(o.order_status ?? "").toUpperCase() === "CANCELLED"
  );
  if (cancelled.length === 0) {
    return orders.map((o) => ({ ...o, cancellation_compensation: null }));
  }

  const sql = pgClient;
  const enriched = await Promise.all(
    orders.map(async (order) => {
      if (String(order.order_status ?? "").toUpperCase() !== "CANCELLED") {
        return { ...order, cancellation_compensation: null };
      }
      const storeId = Number(order.merchant_store_id);
      const coreId = Number(order.order_id);
      if (!Number.isFinite(storeId) || storeId <= 0 || !Number.isFinite(coreId) || coreId <= 0) {
        return { ...order, cancellation_compensation: null };
      }

      const netOrderValue =
        num(order.pricing?.total) > 0
          ? num(order.pricing?.total)
          : num(order.food_items_total_value) > 0
            ? num(order.food_items_total_value)
            : num(order.grand_total);

      try {
        const cancellation_compensation = await resolveOrderCancellationCompensationDisplay(sql, {
          orderCoreId: coreId,
          merchantStoreId: storeId,
          cancelledByType: order.cancelled_by_type ?? null,
          cancelledByLabel: order.cancelled_by_label ?? null,
          rejectedReason: order.rejected_reason ?? null,
          orderCreatedAt: order.created_at ?? null,
          cancelledAt: order.cancelled_at ?? null,
          preparedAt: order.prepared_at ?? null,
          riderPickedUpAt: order.rider_picked_up_at ?? null,
          netOrderValue,
        });
        return { ...order, cancellation_compensation };
      } catch {
        return { ...order, cancellation_compensation: null };
      }
    })
  );

  return enriched;
}

export { loadMerchantCompensationPolicyDisplay };
