/**
 * Parsing for the Accept/Reject the native alert performed while JS was dead.
 *
 * Kept free of react-native so it is unit-testable: the stash is the only
 * evidence the app has that a background accept happened, and misreading it
 * means telling a rider they hold an order they do not.
 */

export type NativePendingOrderAction = {
  action: "accept" | "reject";
  sessionId: string;
  orderId: string;
  offerId: string;
  foodOrderId: string;
  displayOrderId: string;
  storeId: string;
  /**
   * Outcome of the accept native fired on the rider's behalf.
   *
   * "pending" is a real state, not a default: native writes the stash before the
   * HTTP call, so an app that cold-starts mid-flight must not read a success
   * that has not happened yet. A reject is always "ok" — native posts nothing,
   * the app still collects a reason.
   */
  result: "ok" | "failed" | "pending";
  httpStatus: number;
  /** Server's `error` string, or a native reason like "network" / "not_signed_in". */
  detail: string;
  at: number;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseNativePendingOrderAction(
  raw: string | null | undefined
): NativePendingOrderAction | null {
  const source = text(raw);
  if (!source) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(source) as Record<string, unknown>;
  } catch {
    return null;
  }
  const action = text(parsed.action).toLowerCase();
  if (action !== "accept" && action !== "reject") return null;

  const result = text(parsed.result).toLowerCase();
  const httpStatus = Number(parsed.httpStatus);
  return {
    action,
    sessionId: text(parsed.sessionId),
    orderId: text(parsed.orderId),
    offerId: text(parsed.offerId),
    foodOrderId: text(parsed.foodOrderId),
    displayOrderId: text(parsed.displayOrderId),
    storeId: text(parsed.storeId),
    // A stash written by an older build carries no result. Treat it as pending,
    // never ok — the app then reconciles with the server instead of announcing
    // an accept on no evidence.
    result: result === "ok" || result === "failed" ? result : "pending",
    httpStatus: Number.isFinite(httpStatus) && httpStatus > 0 ? Math.trunc(httpStatus) : 0,
    detail: text(parsed.detail),
    at: Number(parsed.at) || 0,
  };
}
