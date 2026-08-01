import type { SupabaseClient } from "@supabase/supabase-js";

export function shouldClearOrderNotifications(newStatus: string): boolean {
  const s = String(newStatus ?? "").trim().toUpperCase();
  return s !== "CREATED" && s !== "NEW" && s !== "ORDER_PLACED" && s !== "PENDING";
}

/** Delivered / cancelled / completed — list purge drops every linked order inbox row. */
export const ORDER_NOTIFICATION_TERMINAL = new Set([
  "DELIVERED",
  "COMPLETED",
  "COMPLETE",
  "CANCELLED",
  "CANCELED",
  "REJECTED",
  "FAILED",
  "EXPIRED",
  "RTO_DELIVERED",
  "RTO_COMPLETED",
]);


/** Delete order-type in-app notifications for a food order (Supabase partnersite). */
export async function clearStoreOrderNotifications(
  db: SupabaseClient,
  args: {
    storeId: number;
    ordersFoodId: number;
    orderCoreId?: number | null;
    formattedOrderId?: string | null;
  }
): Promise<void> {
  const actionPath = `/order/${args.ordersFoodId}`;
  const displayId = (args.formattedOrderId ?? "").trim();

  const filters = db
    .from("merchant_store_notifications")
    .delete()
    .eq("store_id", args.storeId)
    .eq("type", "order");

  const orParts = [`order_id.eq.${args.ordersFoodId}`, `action_url.eq.${actionPath}`];
  if (args.orderCoreId != null) {
    orParts.push(`order_id.eq.${args.orderCoreId}`);
  }
  if (displayId) {
    orParts.push(`body.ilike.%${displayId}%`);
  }

  const { error } = await filters.or(orParts.join(","));
  if (error) {
    console.warn("[clearStoreOrderNotifications]", error.message);
  }
}

export const PARTNER_NOTIFICATIONS_CHANGED = "partner-notifications-changed";

export function dispatchPartnerNotificationsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PARTNER_NOTIFICATIONS_CHANGED));
  }
}
