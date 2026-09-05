import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOOD_DELIVERY_GEOFENCE_RADIUS_M,
  shouldHighlightFoodDropZone,
} from "./food-delivery-map-phase";
import {
  RIDE_GPS_AUTO_FOLLOW_DEFAULT,
  rideTrackingMapInstanceKey,
} from "./ride-map-coords";

describe("food tracking camera invariants", () => {
  it("200m radar can appear without implying a camera refit", () => {
    assert.equal(FOOD_DELIVERY_GEOFENCE_RADIUS_M, 200);
    assert.equal(
      shouldHighlightFoodDropZone({
        status: "OUT_FOR_DELIVERY",
        riderLat: 29.37,
        riderLng: 76.96,
        dropLat: 29.3705,
        dropLng: 76.96,
      }),
      true
    );
  });
});

describe("ride tracking camera invariants", () => {
  it("does not remount the map when navigation mode starts", () => {
    assert.equal(rideTrackingMapInstanceKey("RIDE-9"), "RIDE-9");
  });

  it("does not auto-pan/zoom from GPS until the user taps locate", () => {
    assert.equal(RIDE_GPS_AUTO_FOLLOW_DEFAULT, false);
  });
});
