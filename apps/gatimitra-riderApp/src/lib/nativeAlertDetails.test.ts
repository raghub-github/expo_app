import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingDispatchOrder } from "@/src/components/orders/IncomingRideOrderModal";
import { buildRiderNativeAlertDetails } from "./nativeAlertDetails.js";

function offer(over: Partial<IncomingDispatchOrder> = {}): IncomingDispatchOrder {
  return {
    id: "ORD9",
    category: "ride",
    formattedOrderId: "GMR10000439",
    customerName: "Rahul S",
    pickup: { address: "MG Road, Kolkata", lat: 22.5, lng: 88.3 },
    delivery: { address: "Salt Lake Sector V", lat: 22.57, lng: 88.43 },
    pickupDistanceKm: 1.2,
    tripDistanceKm: 4.5,
    totalDistanceKm: 5.7,
    estimatedEarning: 70,
    totalEarning: 75,
    appliedSurges: [{ name: "Rain surge", amount: 20 }],
    createdAt: "2026-11-19T10:00:00.000Z",
    acceptDeadlineAt: "2026-11-19T10:00:30.000Z",
    ...over,
  };
}

test("a ride offer reaches native with everything the in-app sheet shows", () => {
  const d = buildRiderNativeAlertDetails(offer());
  assert.deepEqual(d, {
    serviceType: "person_ride",
    formattedOrderId: "GMR10000439",
    amount: 75,
    surgeEarning: 20,
    toPickupKm: 1.2,
    tripDistanceKm: 4.5,
    overallKm: 5.7,
    pickupAddress: "MG Road, Kolkata",
    dropAddress: "Salt Lake Sector V",
    customerName: "Rahul S",
    expiresAt: String(Date.parse("2026-11-19T10:00:30.000Z")),
  });
});

test("the money is the in-app total (totalEarning), never the customer fare", () => {
  assert.equal(buildRiderNativeAlertDetails(offer({ totalEarning: 0, estimatedEarning: 58 }))?.amount, 58);
});

test("food offers carry the store and item count; parcels carry pay-at", () => {
  const food = buildRiderNativeAlertDetails(
    offer({ category: "food", merchantName: "SWAAD SUTRA", itemCount: 3, appliedSurges: [] })
  );
  assert.equal(food?.serviceType, "food");
  assert.equal(food?.storeName, "SWAAD SUTRA");
  assert.equal(food?.itemCount, 3);
  const parcel = buildRiderNativeAlertDetails(
    offer({ category: "parcel", payAt: "drop", paymentMethod: "cash", merchantName: "ignored" })
  );
  assert.equal(parcel?.payAt, "drop");
  assert.equal(parcel?.paymentMethod, "cash");
  assert.equal(parcel?.storeName, undefined);
});

test("unknown values are omitted, never sent as 0 / null / NaN", () => {
  const d = buildRiderNativeAlertDetails(
    offer({
      pickupDistanceKm: undefined,
      tripDistanceKm: undefined,
      distanceKm: undefined,
      totalDistanceKm: Number.NaN,
      acceptDeadlineAt: undefined,
      customerName: "  ",
      appliedSurges: [],
    })
  )!;
  for (const key of ["toPickupKm", "tripDistanceKm", "overallKm", "expiresAt", "customerName", "surgeEarning"]) {
    assert.equal(key in d, false, key);
  }
});

test("no offer → no details (start falls back to the plain alert)", () => {
  assert.equal(buildRiderNativeAlertDetails(null), null);
  assert.equal(buildRiderNativeAlertDetails(undefined), null);
});
