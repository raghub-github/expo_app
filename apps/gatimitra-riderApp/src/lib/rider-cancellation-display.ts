export type RiderCancellationActor = "customer" | "rider" | "admin" | "system" | null;

export function normalizeRiderCancellationActor(
  raw: string | null | undefined
): RiderCancellationActor {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (t === "customer" || t === "user" || t.includes("customer")) return "customer";
  if (
    t === "rider" ||
    t === "you" ||
    t === "self" ||
    t === "driver" ||
    t.includes("rider")
  ) {
    return "rider";
  }
  if (t === "admin" || t === "agent" || t === "support" || t.includes("gatimitra")) return "admin";
  if (t === "system") return "system";
  return null;
}

/** Rider-facing cancellation headline for the full-screen ack sheet. */
export function riderCancellationTitle(actor: RiderCancellationActor): string {
  switch (actor) {
    case "customer":
      return "Cancelled by User";
    case "rider":
      return "Cancelled by You";
    case "admin":
    case "system":
      return "Cancelled by GatiMitra Team";
    default:
      return "Order cancelled";
  }
}

/** User-facing id is formatted_order_id (GMF…), never the GM order_id or a numeric PK. */
export function riderFacingOrderId(
  formattedOrderId: string | null | undefined,
  routeOrderId?: string | null
): string | null {
  const formatted = String(formattedOrderId ?? "").trim();
  if (formatted && !/^\d+$/.test(formatted) && !/^GM\d+$/i.test(formatted)) return formatted;
  const route = String(routeOrderId ?? "").trim();
  if (/^GM[A-Z]/i.test(route)) return route;
  return null;
}
