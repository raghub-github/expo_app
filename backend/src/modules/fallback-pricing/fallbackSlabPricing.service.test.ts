import test from "node:test";
import assert from "node:assert/strict";
import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import { fallbackSlabsToDeliveryRows } from "./fallbackSlabPricing.repository.js";
import type { FallbackSlabRow } from "./types.js";

const foodFallbackSlabs: FallbackSlabRow[] = [
  {
    id: 1,
    serviceType: "food",
    pricingSide: "customer",
    vehicleType: null,
    minKm: 0,
    maxKm: 2,
    baseFare: 19,
    perKmRate: 6,
    minCharge: 25,
    waitingChargePerMin: null,
    waitingStartAfter: 0,
    priority: 100,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: 2,
    serviceType: "food",
    pricingSide: "customer",
    vehicleType: null,
    minKm: 2,
    maxKm: 4,
    baseFare: null,
    perKmRate: 7,
    minCharge: null,
    waitingChargePerMin: null,
    waitingStartAfter: 0,
    priority: 100,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: 3,
    serviceType: "food",
    pricingSide: "customer",
    vehicleType: null,
    minKm: 4,
    maxKm: null,
    baseFare: null,
    perKmRate: 8,
    minCharge: null,
    waitingChargePerMin: null,
    waitingStartAfter: 0,
    priority: 100,
    isActive: true,
    createdAt: "",
    updatedAt: "",
  },
];

test("fallback slab rows use shared cumulative engine: food 5 km = 53", () => {
  const rows = fallbackSlabsToDeliveryRows(foodFallbackSlabs, "food");
  const res = calculateProgressiveSlabAmount({ distanceKm: 5, slabs: rows });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 53);
});

test("legacy flat bootstrap slab: base 22 + 5/km at 3 km = 37", () => {
  const legacyBootstrap: FallbackSlabRow[] = [
    {
      id: 99,
      serviceType: "food",
      pricingSide: "customer",
      vehicleType: null,
      minKm: 0,
      maxKm: null,
      baseFare: 22,
      perKmRate: 5,
      minCharge: null,
      waitingChargePerMin: null,
      waitingStartAfter: 0,
      priority: 100,
      isActive: true,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const rows = fallbackSlabsToDeliveryRows(legacyBootstrap, "food");
  const res = calculateProgressiveSlabAmount({ distanceKm: 3, slabs: rows });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.quote.finalAmount, 37);
});
