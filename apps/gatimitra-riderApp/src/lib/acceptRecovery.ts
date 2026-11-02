/**
 * Decide whether an accept that *errored* actually landed on the server.
 *
 * The rider app asks this question in two places: the wedge-release watchdog
 * (did the background retry queue get there in the end?) and the 409 recovery
 * probe (was the conflict our own earlier attempt succeeding?). The answer
 * decides whether the rider is navigated into the order or released back to
 * the offer, so getting it wrong strands them either way: a false negative
 * drops an order they actually hold, a false positive sends them to one they
 * never got.
 *
 * Both call sites used to carry their own copy of this comparison. A
 * divergence between them was a silent, order-losing bug waiting to happen, so
 * it lives here, once, and is tested.
 */

export type AcceptedOrderCandidate = {
  id?: string | null;
  formattedOrderId?: string | null;
};

function normalizeRef(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Collect every identifier that legitimately names the order we tried to
 * accept, de-duplicated, with blanks dropped.
 *
 * Dropping blanks is the point: an order object that came back with no id must
 * never match a ref we don't have. `undefined === undefined` is true, and that
 * would have read as "your accept landed".
 */
export function acceptOrderRefs(...values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const value of values) {
    const ref = normalizeRef(value);
    if (ref !== "" && !out.includes(ref)) out.push(ref);
  }
  return out;
}

/**
 * Find the order among the rider's active orders that corresponds to `refs`.
 * Returns null when it is genuinely absent — which is the signal to release
 * the accept latch rather than keep the rider waiting.
 */
export function findAcceptedOrder<T extends AcceptedOrderCandidate>(
  active: readonly T[] | null | undefined,
  refs: readonly string[]
): T | null {
  if (!Array.isArray(active) || active.length === 0) return null;
  if (refs.length === 0) return null;

  const wanted = new Set(refs);
  for (const order of active) {
    if (!order) continue;
    const id = normalizeRef(order.id);
    if (id !== "" && wanted.has(id)) return order;
    const formatted = normalizeRef(order.formattedOrderId);
    if (formatted !== "" && wanted.has(formatted)) return order;
  }
  return null;
}

/** Convenience wrapper: did this accept land? */
export function acceptDidLand(
  active: readonly AcceptedOrderCandidate[] | null | undefined,
  ...refs: Array<string | null | undefined>
): boolean {
  return findAcceptedOrder(active, acceptOrderRefs(...refs)) != null;
}
