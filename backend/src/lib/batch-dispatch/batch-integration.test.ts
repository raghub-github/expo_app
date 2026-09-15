import { test } from "node:test";
import assert from "node:assert/strict";
import { decideBatchGate, type BatchGateInput, type ActiveOrderStops } from "./batch-dispatch-integration.js";
import type { ServiceBatchConfig } from "./batch-config.js";

const CFG: ServiceBatchConfig = {
  serviceType: "food", enabled: true, avgSpeedKmph: 24, pickupServiceMin: 3, dropServiceMin: 2,
  maxPickupDetourKm: 2.5, maxPickupDetourMin: 12, maxExtraDropDelayMin: 12, sameStoreBonus: 6, batchWindowSec: 20,
};
const KM = 0.008993;
const P = (km: number) => ({ lat: km * KM, lng: 0 });
const now = Date.now();

const activePrePickup: ActiveOrderStops = {
  orderId: 1, status: "assigned", pickup: P(1), drop: P(2), createdAtMs: now, storeKey: "storeX",
};

function gate(over: Partial<BatchGateInput> = {}): BatchGateInput {
  return {
    serviceType: "food", candidateOrderId: 2, candidatePickup: P(1), candidateDrop: P(2.2),
    candidateCreatedAtMs: now, candidateStoreKey: "storeX", riderLoc: P(0),
    activeOrders: [activePrePickup], config: CFG, nowMs: now, ...over,
  };
}

test("idle rider → passthrough (allow, not a batch)", () => {
  const r = decideBatchGate(gate({ activeOrders: [] }));
  assert.equal(r.allow, true);
  assert.equal(r.offered, false);
});

test("rider carrying an order (picked_up) → gate blocks the additional order (§37–39)", () => {
  const r = decideBatchGate(gate({ activeOrders: [{ ...activePrePickup, status: "picked_up" }] }));
  assert.equal(r.allow, false);
  assert.equal(r.reason, "RIDER_IN_PICKUP_TO_DROP_STATE");
});

test("feasible same-store batch → allow (offered)", () => {
  const r = decideBatchGate(gate());
  assert.equal(r.allow, true);
  assert.equal(r.offered, true);
});

test("far candidate pickup → gate blocks (detour)", () => {
  const r = decideBatchGate(gate({ candidatePickup: P(10), candidateDrop: P(11), candidateStoreKey: "far" }));
  assert.equal(r.allow, false);
  assert.equal(r.reason, "PICKUP_DETOUR_TOO_LARGE");
});

test("candidate that cannot be delivered on time → gate blocks (SLA always wins)", () => {
  // Candidate created 60 min ago → deadline already ~15 min in the past for food (45 min window).
  const r = decideBatchGate(gate({ candidateCreatedAtMs: now - 60 * 60_000 }));
  assert.equal(r.allow, false);
  assert.equal(r.reason, "SLA_RISK");
});
