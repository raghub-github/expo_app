import type { QueryClient } from "@tanstack/react-query";
import type { OrderSummary } from "@/services/order.service";
import { rememberDismissedRideOrder } from "@/lib/ride-dismissed-orders";
import { forgetActivePersonRide } from "@/lib/active-person-ride-persist";

function matchesOrderRef(order: OrderSummary, orderRef: string): boolean {
  const id = orderRef.trim();
  if (!id) return false;
  return order.orderId === id || (order.formattedOrderId?.trim() ?? "") === id;
}

function markCancelled(order: OrderSummary): OrderSummary {
  return {
    ...order,
    status: "CANCELLED",
    cancellationReason: order.cancellationReason ?? "Ride search timed out",
  };
}

/** Optimistically drop a cancelled ride from list caches so the tracker pill hides immediately. */
export function purgeRideOrderFromClientCaches(
  queryClient: QueryClient,
  orderRef: string
): void {
  const id = orderRef.trim();
  if (!id) return;

  rememberDismissedRideOrder(id);
  forgetActivePersonRide(id);

  queryClient.setQueryData<OrderSummary[]>(["my-orders"], (prev) => {
    if (!prev) return prev;
    return prev.map((o) => (matchesOrderRef(o, id) ? markCancelled(o) : o));
  });

  queryClient.setQueryData<OrderSummary[]>(["my-orders", "active-rides"], (prev) => {
    if (!prev) return prev;
    return prev.filter((o) => !matchesOrderRef(o, id));
  });
}
