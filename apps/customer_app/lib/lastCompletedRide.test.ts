import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderSummary } from "../services/order.service";
import {
  isCompletedPersonRide,
  journeyFromCompletedOrder,
  resolveLastRideCtaMode,
  reverseCompletedRideRoute,
  selectLatestCompletedRide,
  isNearCompletedDrop,
} from "./lastCompletedRide";

function ride(partial: Partial<OrderSummary> & Pick<OrderSummary, "orderId" | "status" | "createdAt">): OrderSummary {
  return {
    orderType: "person_ride",
    ...partial,
  };
}

describe("isCompletedPersonRide", () => {
  it("accepts delivered person rides only", () => {
    assert.equal(
      isCompletedPersonRide(ride({ orderId: "GMP1", status: "DELIVERED", createdAt: "2026-01-01" })),
      true
    );
    assert.equal(
      isCompletedPersonRide(ride({ orderId: "GMP1", status: "completed", createdAt: "2026-01-01" })),
      true
    );
    assert.equal(
      isCompletedPersonRide(ride({ orderId: "GMP1", status: "RIDE_IN_PROGRESS", createdAt: "2026-01-01" })),
      false
    );
    assert.equal(
      isCompletedPersonRide(
        ride({
          orderId: "GMP1",
          status: "DELIVERED",
          createdAt: "2026-01-01",
          cancellationReason: "user cancel",
        })
      ),
      false
    );
    assert.equal(
      isCompletedPersonRide({
        orderId: "GMF1",
        status: "DELIVERED",
        createdAt: "2026-01-01",
        orderType: "food",
      }),
      false
    );
  });
});

describe("selectLatestCompletedRide", () => {
  it("picks the newest completed ride with real coordinates", () => {
    const older = ride({
      orderId: "GMP-old",
      status: "DELIVERED",
      createdAt: "2026-01-01T10:00:00.000Z",
      merchantAddress: "Old pickup street",
      deliveryAddress: "Old drop street",
      pickupLat: 29.39,
      pickupLng: 76.96,
      deliveryLat: 28.61,
      deliveryLng: 77.2,
    });
    const newer = ride({
      orderId: "GMP-new",
      status: "DELIVERED",
      createdAt: "2026-03-01T10:00:00.000Z",
      merchantAddress: "Gali Number 2, Panipat",
      deliveryAddress: "New Delhi, Delhi, India",
      pickupLat: 29.391,
      pickupLng: 76.963,
      deliveryLat: 28.613,
      deliveryLng: 77.209,
    });
    const active = ride({
      orderId: "GMP-live",
      status: "RIDE_IN_PROGRESS",
      createdAt: "2026-04-01T10:00:00.000Z",
      merchantAddress: "Should ignore",
      deliveryAddress: "Should ignore",
      pickupLat: 29.4,
      pickupLng: 76.97,
      deliveryLat: 28.7,
      deliveryLng: 77.1,
    });
    const picked = selectLatestCompletedRide([older, active, newer], null);
    assert.equal(picked?.orderId, "GMP-new");
    assert.match(picked?.pickup.fullAddress ?? "", /Panipat/i);
    assert.match(picked?.drop.fullAddress ?? "", /New Delhi/i);
  });

  it("hides the card when there is no completed ride", () => {
    assert.equal(selectLatestCompletedRide([], null), null);
    assert.equal(
      selectLatestCompletedRide(
        [ride({ orderId: "x", status: "CANCELLED", createdAt: "2026-01-01" })],
        null
      ),
      null
    );
  });

  it("does not use a search-recent fallback that lacks valid coords", () => {
    assert.equal(
      selectLatestCompletedRide([], {
        pickup: { latitude: 0, longitude: 0, primary: "Fake" },
        drop: { latitude: 0, longitude: 0, primary: "Fake" },
        savedAt: Date.now(),
        kind: "ride",
      }),
      null
    );
  });

  it("ignores search recents even with valid coords", () => {
    assert.equal(
      selectLatestCompletedRide([], {
        pickup: { latitude: 29.39, longitude: 76.96, primary: "Search pickup" },
        drop: { latitude: 28.61, longitude: 77.2, primary: "Search drop" },
        savedAt: Date.now(),
        kind: "ride",
      }),
      null
    );
  });

  it("uses a delivered-ride snapshot when order history has no coords", () => {
    const picked = selectLatestCompletedRide([], {
      pickup: { latitude: 29.39, longitude: 76.96, primary: "Panipat pickup" },
      drop: { latitude: 28.61, longitude: 77.2, primary: "Delhi drop" },
      savedAt: Date.now(),
      kind: "ride",
      fromCompletedRide: true,
    });
    assert.equal(picked?.pickup.primary, "Panipat pickup");
    assert.equal(picked?.drop.primary, "Delhi drop");
  });
});

describe("reverseCompletedRideRoute", () => {
  it("swaps A→B into B→A without a new search", () => {
    const journey = journeyFromCompletedOrder(
      ride({
        orderId: "GMP1",
        status: "DELIVERED",
        createdAt: "2026-01-01T10:00:00.000Z",
        merchantAddress: "Panipat pickup",
        deliveryAddress: "Delhi drop",
        pickupLat: 29.39,
        pickupLng: 76.96,
        deliveryLat: 28.61,
        deliveryLng: 77.2,
      })
    );
    assert.ok(journey);
    const reversed = reverseCompletedRideRoute(journey);
    assert.equal(reversed.pickup.latitude, journey.drop.latitude);
    assert.equal(reversed.drop.latitude, journey.pickup.latitude);
    assert.equal(reversed.pickup.fullAddress, journey.drop.fullAddress);
    assert.equal(reversed.drop.fullAddress, journey.pickup.fullAddress);
  });
});

describe("resolveLastRideCtaMode", () => {
  const drop = { latitude: 28.613, longitude: 77.209 };

  it("keeps Book again while GPS is loading or unavailable", () => {
    assert.equal(resolveLastRideCtaMode({ status: "loading" }, drop), "again");
    assert.equal(resolveLastRideCtaMode({ status: "unavailable" }, drop), "again");
    assert.equal(resolveLastRideCtaMode({ status: "idle" }, drop), "again");
  });

  it("uses Return Trip only when current GPS is near the drop", () => {
    assert.equal(
      resolveLastRideCtaMode(
        { status: "available", latitude: 28.614, longitude: 77.21, accuracyM: 25 },
        drop
      ),
      "return"
    );
    assert.equal(
      resolveLastRideCtaMode(
        { status: "available", latitude: 29.39, longitude: 76.96, accuracyM: 25 },
        drop
      ),
      "again"
    );
  });

  it("does not activate Return Trip on a very inaccurate fix", () => {
    assert.equal(
      isNearCompletedDrop({
        currentLat: 28.614,
        currentLng: 77.21,
        dropLat: drop.latitude,
        dropLng: drop.longitude,
        accuracyM: 800,
      }),
      false
    );
  });
});
