import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRiderCancellationAnalytics,
  percentage,
  type CancellationCountRow,
} from "./rider-cancellation-analytics";
import {
  resolveCancellationResponsibility,
  resolveLegResponsibility,
  responsibilityFromCatalogAttribute,
  responsibilityFromRawActor,
} from "./cancellation-responsibility";

const SERVICES = ["food", "parcel", "person_ride"];

// --- percentage() ---------------------------------------------------------

test("percentage: exact and rounded to 2dp", () => {
  assert.equal(percentage(20, 50), 40);
  assert.equal(percentage(12, 50), 24);
  assert.equal(percentage(4, 12), 33.33);
  assert.equal(percentage(8, 12), 66.67);
});

test("percentage: zero denominator returns null (UI shows 0%), never NaN/Infinity", () => {
  assert.equal(percentage(0, 0), null);
  assert.equal(percentage(5, 0), null);
});

// --- responsibility mapping ----------------------------------------------

test("catalog attribute RIDER => RIDER_FAULT; only explicit rider fault", () => {
  assert.equal(responsibilityFromCatalogAttribute("RIDER"), "RIDER_FAULT");
  assert.equal(responsibilityFromCatalogAttribute("3pl_fault"), "RIDER_FAULT");
  assert.equal(responsibilityFromCatalogAttribute("CUSTOMER"), "CUSTOMER_FAULT");
  assert.equal(responsibilityFromCatalogAttribute("MERCHANT"), "MERCHANT_FAULT");
  assert.equal(responsibilityFromCatalogAttribute("OTHER"), "UNKNOWN");
  assert.equal(responsibilityFromCatalogAttribute("some_new_attr"), "UNKNOWN");
  assert.equal(responsibilityFromCatalogAttribute(""), null);
});

test("raw actor fallback maps correctly; system vs company distinct", () => {
  assert.equal(responsibilityFromRawActor("rider"), "RIDER_FAULT");
  assert.equal(responsibilityFromRawActor("customer"), "CUSTOMER_FAULT");
  assert.equal(responsibilityFromRawActor("merchant"), "MERCHANT_FAULT");
  assert.equal(responsibilityFromRawActor("SYSTEM"), "SYSTEM_FAULT");
  assert.equal(responsibilityFromRawActor("admin"), "COMPANY_FAULT");
  assert.equal(responsibilityFromRawActor("agent"), "COMPANY_FAULT");
  assert.equal(responsibilityFromRawActor("mystery"), "UNKNOWN");
});

test("resolve: catalog attribute wins over raw actor", () => {
  assert.equal(
    resolveCancellationResponsibility({ catalogAttribute: "CUSTOMER", cancelledBy: "rider" }),
    "CUSTOMER_FAULT"
  );
  // No catalog => fall back to actor.
  assert.equal(
    resolveCancellationResponsibility({ catalogAttribute: null, cancelledBy: "SYSTEM" }),
    "SYSTEM_FAULT"
  );
  // Nothing => UNKNOWN (never dropped, never rider).
  assert.equal(resolveCancellationResponsibility({}), "UNKNOWN");
});

// --- per-leg responsibility precedence ------------------------------------

test("leg: rider self-cancel is rider fault unless the reason is attributed otherwise", () => {
  // No catalogued reason -> explicit rider self-cancel is rider fault.
  assert.equal(
    resolveLegResponsibility({ exclusionSource: "rider_cancel_assigned", exclusionAttribute: null }),
    "RIDER_FAULT"
  );
  // Rider cancelled but the reason is a customer reason -> not blamed on the rider.
  assert.equal(
    resolveLegResponsibility({ exclusionSource: "rider_cancel_assigned", exclusionAttribute: "CUSTOMER" }),
    "CUSTOMER_FAULT"
  );
});

test("leg: admin unassign is NOT rider fault by default (only when reason says RIDER)", () => {
  assert.equal(
    resolveLegResponsibility({ exclusionSource: "admin_unassign", exclusionAttribute: null }),
    "UNKNOWN"
  );
  assert.equal(
    resolveLegResponsibility({ exclusionSource: "admin_unassign", exclusionAttribute: "RIDER" }),
    "RIDER_FAULT"
  );
});

test("leg: terminal cancel uses order-cancellation attribute, then raw actor", () => {
  assert.equal(
    resolveLegResponsibility({ exclusionSource: null, terminalAttribute: "MERCHANT" }),
    "MERCHANT_FAULT"
  );
  assert.equal(
    resolveLegResponsibility({ exclusionSource: null, terminalAttribute: null, cancelledBy: "SYSTEM" }),
    "SYSTEM_FAULT"
  );
  assert.equal(resolveLegResponsibility({ exclusionSource: null }), "UNKNOWN");
});

// --- engine: spec §10 Food example ---------------------------------------

function foodExampleCancellations(): CancellationCountRow[] {
  // Food: 20 cancelled = 15 pre + 5 post. Rider fault = 12 (4 pre + 8 post).
  // Non-rider = 8 (distribute across pre/post so pre=15, post=5).
  // pre: rider 4, remaining 11 non-rider ; post: rider 8, remaining -3 -> impossible.
  // Reconcile to the spec: rider pre 4, rider post 8; pre total 15 => non-rider pre 11;
  // post total 5 => but rider post 8 > 5. The spec's illustrative numbers are internally
  // inconsistent (post=5 yet rider-post=8). Use a self-consistent variant that preserves
  // the headline figures the UI must show: cancelled 20, rider 12, rate 40%, rf-rate 24%,
  // rf-share 60% — with pre=15/post=5 and rider pre=4/post=8 REPLACED by a consistent
  // split pre=8/post=12? No — keep cancelled/rider fixed, choose pre/post that reconcile.
  return [
    // Pre-pickup: 12 total (rider 4, customer 6, merchant 2)
    { service: "food", stage: "PRE_PICKUP", responsibility: "RIDER_FAULT", count: 4 },
    { service: "food", stage: "PRE_PICKUP", responsibility: "CUSTOMER_FAULT", count: 6 },
    { service: "food", stage: "PRE_PICKUP", responsibility: "MERCHANT_FAULT", count: 2 },
    // Post-pickup: 8 total (rider 8)
    { service: "food", stage: "POST_PICKUP", responsibility: "RIDER_FAULT", count: 8 },
  ];
}

test("engine: Food headline metrics (cancelled 20/50 = 40%, rider 12 => 24% rate, 60% share)", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [{ service: "food", accepted: 50 }],
    cancellations: foodExampleCancellations(),
  });
  const food = result.services.food;
  assert.equal(food.accepted, 50);
  assert.equal(food.cancelled, 20);
  assert.equal(food.cancellationRate, 40);
  assert.equal(food.riderFault, 12);
  assert.equal(food.riderFaultRate, 24);
  assert.equal(food.riderFaultShare, 60);
  assert.equal(food.riderFaultPrePickup, 4);
  assert.equal(food.riderFaultPostPickup, 8);
  assert.equal(food.riderFaultPrePickupShare, percentage(4, 12)); // 33.33
  assert.equal(food.riderFaultPostPickupShare, percentage(8, 12)); // 66.67
  // No reconciliation errors.
  assert.equal(result.reconciliationErrors, undefined);
});

// --- engine: overall is weighted, never averaged (§12/§13) ----------------

test("overall cancellation rate uses summed counts, not averaged service rates", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [
      { service: "food", accepted: 50 },
      { service: "parcel", accepted: 60 },
      { service: "person_ride", accepted: 100 },
    ],
    cancellations: [
      { service: "food", stage: "PRE_PICKUP", responsibility: "RIDER_FAULT", count: 20 }, // 40%
      { service: "parcel", stage: "PRE_PICKUP", responsibility: "CUSTOMER_FAULT", count: 6 }, // 10%
      { service: "person_ride", stage: "POST_PICKUP", responsibility: "RIDER_FAULT", count: 10 }, // 10%
    ],
  });
  // Averaged (wrong) would be (40+10+10)/3 = 20. Weighted (right) = 36/210 = 17.14.
  assert.equal(result.overall.accepted, 210);
  assert.equal(result.overall.cancelled, 36);
  assert.equal(result.overall.cancellationRate, percentage(36, 210)); // 17.14
  assert.equal(result.overall.riderFault, 30);
  assert.equal(result.overall.riderFaultRate, percentage(30, 210)); // 14.29
  assert.equal(result.overall.riderFaultShare, percentage(30, 36)); // 83.33
});

// --- edge cases (§28) -----------------------------------------------------

test("edge: 0 accepted => rates are null (UI 0%), no NaN", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [],
    cancellations: [],
  });
  assert.equal(result.services.food.accepted, 0);
  assert.equal(result.services.food.cancelled, 0);
  assert.equal(result.services.food.cancellationRate, null);
  assert.equal(result.services.food.riderFaultRate, null);
  assert.equal(result.services.food.riderFaultShare, null);
  assert.equal(result.overall.cancellationRate, null);
});

test("edge: all accepted cancelled, all rider fault", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [{ service: "parcel", accepted: 3 }],
    cancellations: [
      { service: "parcel", stage: "PRE_PICKUP", responsibility: "RIDER_FAULT", count: 1 },
      { service: "parcel", stage: "POST_PICKUP", responsibility: "RIDER_FAULT", count: 2 },
    ],
  });
  const p = result.services.parcel;
  assert.equal(p.cancellationRate, 100);
  assert.equal(p.riderFaultRate, 100);
  assert.equal(p.riderFaultShare, 100);
  assert.equal(p.riderFaultPrePickup, 1);
  assert.equal(p.riderFaultPostPickup, 2);
});

test("edge: no rider-fault cancellations => rider share 0, unknown preserved", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [{ service: "food", accepted: 10 }],
    cancellations: [
      { service: "food", stage: "PRE_PICKUP", responsibility: "CUSTOMER_FAULT", count: 2 },
      { service: "food", stage: "PRE_PICKUP", responsibility: "UNKNOWN", count: 1 },
    ],
  });
  const f = result.services.food;
  assert.equal(f.cancelled, 3);
  assert.equal(f.riderFault, 0);
  assert.equal(f.riderFaultRate, 0);
  assert.equal(f.riderFaultShare, 0);
  assert.equal(f.byFault.UNKNOWN, 1); // never dropped (§9)
});

test("edge: only post-pickup cancellations", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [{ service: "person_ride", accepted: 5 }],
    cancellations: [
      { service: "person_ride", stage: "POST_PICKUP", responsibility: "RIDER_FAULT", count: 2 },
    ],
  });
  const r = result.services.person_ride;
  assert.equal(r.prePickup, 0);
  assert.equal(r.postPickup, 2);
  assert.equal(r.riderFaultPrePickupShare, percentage(0, 2)); // 0
  assert.equal(r.riderFaultPostPickupShare, percentage(2, 2)); // 100
});

// --- reconciliation invariants (§9/§27) -----------------------------------

test("reconciliation: every service and overall satisfy the identities", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [
      { service: "food", accepted: 50 },
      { service: "parcel", accepted: 60 },
      { service: "person_ride", accepted: 100 },
    ],
    cancellations: [
      ...foodExampleCancellations(),
      { service: "parcel", stage: "PRE_PICKUP", responsibility: "CUSTOMER_FAULT", count: 5 },
      { service: "parcel", stage: "POST_PICKUP", responsibility: "RIDER_FAULT", count: 3 },
      { service: "person_ride", stage: "PRE_PICKUP", responsibility: "SYSTEM_FAULT", count: 7 },
      { service: "person_ride", stage: "POST_PICKUP", responsibility: "MERCHANT_FAULT", count: 1 },
    ],
  });

  for (const svc of Object.values(result.services)) {
    assert.ok(svc.accepted >= svc.cancelled, `${svc.service}: accepted >= cancelled`);
    assert.equal(svc.prePickup + svc.postPickup, svc.cancelled);
    const faultSum =
      svc.byFault.RIDER_FAULT +
      svc.byFault.CUSTOMER_FAULT +
      svc.byFault.MERCHANT_FAULT +
      svc.byFault.COMPANY_FAULT +
      svc.byFault.SYSTEM_FAULT +
      svc.byFault.UNKNOWN;
    assert.equal(faultSum, svc.cancelled);
    assert.equal(svc.riderFaultPrePickup + svc.riderFaultPostPickup, svc.riderFault);
  }
  assert.equal(result.reconciliationErrors, undefined);
});

test("engine seeds all requested services even with no data", () => {
  const result = computeRiderCancellationAnalytics({
    services: SERVICES,
    accepted: [{ service: "food", accepted: 5 }],
    cancellations: [],
  });
  assert.deepEqual(Object.keys(result.services), SERVICES);
});
