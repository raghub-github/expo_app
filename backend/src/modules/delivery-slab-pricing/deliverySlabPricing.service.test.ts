import test from "node:test";
import assert from "node:assert/strict";
import { calculateProgressiveSlabAmount } from "./deliverySlabPricing.service.js";
import type { DeliveryRateSlabRow } from "./types.js";

function slab(
  row: Pick<DeliveryRateSlabRow, "id" | "minKm" | "maxKm" | "perKmRate"> &
    Partial<
      Pick<
        DeliveryRateSlabRow,
        | "geoLevel"
        | "geoRefId"
        | "serviceType"
        | "actorType"
        | "baseFare"
        | "minCharge"
        | "priority"
        | "isActive"
      >
    >
): DeliveryRateSlabRow {
  return {
    id: row.id,
    geoLevel: row.geoLevel ?? "state",
    geoRefId: row.geoRefId ?? "x",
    serviceType: row.serviceType ?? "food",
    actorType: row.actorType ?? "customer",
    minKm: row.minKm,
    maxKm: row.maxKm,
    baseFare: row.baseFare ?? null,
    perKmRate: row.perKmRate,
    minCharge: row.minCharge ?? null,
    priority: row.priority ?? 100,
    isActive: row.isActive ?? true,
  };
}

function foodCustomerSlabs(): DeliveryRateSlabRow[] {
  return [
    slab({ id: 1, minKm: 0, maxKm: 2, baseFare: 19, perKmRate: 6, minCharge: 25 }),
    slab({ id: 2, minKm: 2, maxKm: 4, perKmRate: 7 }),
    slab({ id: 3, minKm: 4, maxKm: 7, perKmRate: 8 }),
    slab({ id: 4, minKm: 7, maxKm: 10, perKmRate: 9 }),
    slab({ id: 5, minKm: 10, maxKm: null, perKmRate: 11 }),
  ];
}

test("Food customer delivery fee via backend wrapper: 5 km = 53", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 5, slabs: foodCustomerSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.baseFareApplied, 19);
  assert.equal(res.quote.finalAmount, 53);
});

test("min charge floor on short customer distance", () => {
  const res = calculateProgressiveSlabAmount({ distanceKm: 1, slabs: foodCustomerSlabs() });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 25);
});

test("rejects overlap", () => {
  const bad: DeliveryRateSlabRow[] = [
    slab({ id: 1, minKm: 0, maxKm: 2, baseFare: 10, perKmRate: 1, geoLevel: "pincode" }),
    slab({ id: 2, minKm: 1, maxKm: 3, baseFare: null, perKmRate: 1, geoLevel: "pincode" }),
  ];
  const res = calculateProgressiveSlabAmount({ distanceKm: 2, slabs: bad });
  assert.equal(res.ok, false);
});
