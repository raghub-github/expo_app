/**
 * ID helpers — keeps order-id and ticket-id patterns in one file so every
 * surface (server validation, client guard rails, ws-gateway channel
 * whitelist) uses the same regex.
 */

/** Order IDs follow the `GM<digits>` pattern (e.g. `GM10000042`). */
export const ORDER_ID_RE = /^GM\d+$/;

/** Backend ticket IDs (support / customer support) — `TKT<digits>`. */
export const TICKET_ID_RE = /^TKT\d+$/;

/** Returns true if `id` matches the GM order pattern. Safe vs null. */
export function isValidOrderId(id: unknown): id is string {
  return typeof id === "string" && ORDER_ID_RE.test(id);
}

export function isValidTicketId(id: unknown): id is string {
  return typeof id === "string" && TICKET_ID_RE.test(id);
}
