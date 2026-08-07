/** Prefixes aligned with backend `get_order_id_prefix` (orders_core.formatted_order_id). */
const PREFIX_BY_ORDER_TYPE: Record<string, string> = {
  food: "GMF",
  parcel: "GMC",
  person_ride: "GMP",
  ride: "GMP",
};

export type OrderRefLike = {
  formatted_order_id?: string | null;
  formattedOrderId?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  order_type?: string | null;
  orderType?: string | null;
  id?: number;
};

/** Public display id — prefers formatted_order_id (GMF/GMC/GMP), not legacy GM… core id. */
export function formatDisplayOrderId(order: OrderRefLike): string {
  const formatted = (order.formatted_order_id ?? order.formattedOrderId ?? "").trim().replace(/^#/, "");
  if (formatted) return formatted;

  const raw = (order.order_id ?? order.orderId ?? "").trim().replace(/^#/, "");
  if (/^GM[FCPMR]\d/i.test(raw)) return raw.toUpperCase();

  const orderType = (order.order_type ?? order.orderType ?? "").trim().toLowerCase();
  const prefix = PREFIX_BY_ORDER_TYPE[orderType];
  if (raw && /^GM\d/i.test(raw) && prefix) {
    return `${prefix}${raw.replace(/^GM/i, "")}`;
  }

  if (raw) return raw;
  if (order.id != null) return String(order.id);
  return "—";
}

/** Map orders_core.order_type → customer-support help-sections service_type filter. */
export function helpServiceTypeFromOrder(order: OrderRefLike | null | undefined): string | undefined {
  if (!order) return undefined;
  const orderType = (order.order_type ?? order.orderType ?? "").trim().toLowerCase();
  if (orderType === "food") return "food";
  if (orderType === "parcel") return "parcel";
  if (orderType === "person_ride" || orderType === "ride") return "person_ride";

  const ref = formatDisplayOrderId(order).toUpperCase();
  if (ref.startsWith("GMF")) return "food";
  if (ref.startsWith("GMC")) return "parcel";
  if (ref.startsWith("GMP")) return "person_ride";
  return undefined;
}

/** Same as formatDisplayOrderId with leading `#`. */
export function formatDisplayOrderIdHash(order: OrderRefLike): string {
  const id = formatDisplayOrderId(order);
  return id.startsWith("#") ? id : `#${id}`;
}
