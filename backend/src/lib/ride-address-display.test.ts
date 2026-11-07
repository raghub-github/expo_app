import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSavedPlaceNickname,
  meaningfulAddressSnippet,
  resolveRideAddressDisplayLabel,
  rideTripDistanceFromCheckoutMetadata,
  roundRideTripDistanceKm,
} from "./ride-address-display.js";

describe("ride address display for riders", () => {
  it("treats HOME / Work as nicknames", () => {
    assert.equal(isSavedPlaceNickname("HOME"), true);
    assert.equal(isSavedPlaceNickname("Work"), true);
    assert.equal(isSavedPlaceNickname("12 MG Road, Panipat"), false);
  });

  it("keeps multi-part street snippets", () => {
    assert.equal(
      meaningfulAddressSnippet("Sector 12, Model Town, Panipat, Haryana, India"),
      "Sector 12, Model Town, Panipat"
    );
  });

  it("prefers full address over HOME label", () => {
    const out = resolveRideAddressDisplayLabel({
      label: "HOME",
      fullAddress: "House 42, Sector 12, Panipat, Haryana",
      fallbacks: [],
      defaultLabel: "Pickup",
    });
    assert.match(out, /Sector 12|House 42/i);
    assert.notEqual(out.toLowerCase(), "home");
  });

  it("does not collapse drop to a lone city when fuller text exists", () => {
    const out = resolveRideAddressDisplayLabel({
      label: null,
      fullAddress: "Near Bus Stand, Panipat, Haryana, India",
      fallbacks: ["Panipat"],
      defaultLabel: "Drop location",
    });
    assert.match(out, /Bus Stand/i);
  });
});

describe("ride/parcel trip km SSOT from checkout metadata", () => {
  it("prefers routeDistanceKm over tripKm and rounds to 1 decimal", () => {
    assert.equal(
      rideTripDistanceFromCheckoutMetadata({
        routeDistanceKm: 4.74,
        tripKm: 4.2,
      }),
      4.7
    );
  });

  it("falls back to tripKm when routeDistanceKm missing", () => {
    assert.equal(
      rideTripDistanceFromCheckoutMetadata({ tripKm: 5.15 }),
      5.2
    );
  });

  it("matches offer/accept fallback: metadata then core distance_km", () => {
    const meta = { routeDistanceKm: 4.74 };
    const coreKm = 4.2; // haversine-ish understatement
    const offerOrAcceptTripKm =
      rideTripDistanceFromCheckoutMetadata(meta) ??
      roundRideTripDistanceKm(coreKm);
    assert.equal(offerOrAcceptTripKm, 4.7);
    // Without metadata precedence, freezing core-only would diverge from offer.
    assert.notEqual(roundRideTripDistanceKm(coreKm), offerOrAcceptTripKm);
  });

  it("rejects zero / invalid km", () => {
    assert.equal(rideTripDistanceFromCheckoutMetadata({ routeDistanceKm: 0 }), undefined);
    assert.equal(rideTripDistanceFromCheckoutMetadata({ tripKm: -1 }), undefined);
    assert.equal(rideTripDistanceFromCheckoutMetadata(null), undefined);
  });
});

