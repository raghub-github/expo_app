import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors notificationService.riderDispatchCollapseKey — keep in sync.
 * Ensures FCM Android tag/collapse identity is stable per logical offer.
 */
function riderDispatchCollapseKey(meta: Record<string, unknown>): string | null {
  const orderId = String(meta.orderId ?? meta.order_id ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  if (orderId) return `gm_rider_order_${orderId.slice(0, 48)}`;
  const session = String(meta.alertSessionId ?? meta.alert_session_id ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "");
  if (session) return `gm_rider_${session.slice(0, 64)}`;
  return null;
}

describe("rider dispatch FCM collapse identity", () => {
  it("uses order id so retries/realerts replace one tray card", () => {
    assert.equal(
      riderDispatchCollapseKey({
        alertSessionId: "RIDER_NEW_ORDER:GMP10021:1001:1",
        orderId: "GMP10021",
      }),
      "gm_rider_order_GMP10021"
    );
  });

  it("falls back to session when order id missing", () => {
    assert.equal(
      riderDispatchCollapseKey({
        alertSessionId: "RIDER_NEW_ORDER:GMP10021:1001:1",
      }),
      "gm_rider_RIDER_NEW_ORDER:GMP10021:1001:1"
    );
  });

  it("matches native HeadsUp trayTagForOrder", () => {
    assert.equal(
      riderDispatchCollapseKey({ orderId: "GMP10021" }),
      "gm_rider_order_GMP10021"
    );
  });
});
