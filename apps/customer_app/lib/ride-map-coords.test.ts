import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderDetail } from "../services/order.service";
import {
  RIDE_GPS_AUTO_FOLLOW_DEFAULT,
  isValidMapCoordinate,
  resolveRideDropPoint,
  resolveRidePickupPoint,
  rideTrackingMapInstanceKey,
} from "./ride-map-coords";

function order(partial: Partial<OrderDetail>): OrderDetail {
  return partial as OrderDetail;
}

describe("ride tracking map stability", () => {
  it("keeps a stable map instance key across pickup → navigation", () => {
    const key = rideTrackingMapInstanceKey("ORD-1");
    assert.equal(key, "ORD-1");
    assert.equal(key.includes("nav"), false);
    assert.equal(key.includes("pickup"), false);
    assert.equal(rideTrackingMapInstanceKey("ORD-1"), rideTrackingMapInstanceKey("ORD-1"));
  });

  it("does not auto-follow GPS (locate button enables follow)", () => {
    assert.equal(RIDE_GPS_AUTO_FOLLOW_DEFAULT, false);
  });
});

describe("ride map coordinates", () => {
  it("rejects missing / zero / out-of-footprint coords without throwing", () => {
    assert.equal(isValidMapCoordinate(undefined, undefined), false);
    assert.equal(isValidMapCoordinate(null, null), false);
    assert.equal(isValidMapCoordinate(0, 0), false);
    assert.equal(isValidMapCoordinate(Number.NaN, 76.96), false);
    assert.equal(isValidMapCoordinate(51.5, -0.12), false);
    assert.equal(isValidMapCoordinate(29.37, 76.96), true);
  });

  it("returns null pickup/drop when the order contract is missing coords", () => {
    const missing = order({ pickupLat: null, pickupLng: null, deliveryLat: null, deliveryLng: null });
    assert.equal(resolveRidePickupPoint(missing), null);
    assert.equal(resolveRideDropPoint(missing), null);
  });
});
