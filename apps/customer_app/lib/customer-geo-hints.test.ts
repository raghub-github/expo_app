import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCustomerGeoHints } from "./customer-geo-hints";

describe("extractCustomerGeoHints", () => {
  it("does not treat Current location placeholder as state", () => {
    const hints = extractCustomerGeoHints(
      {
        primary: "Current location",
        secondary: "",
        fullAddress: "Current location",
      },
      null
    );
    assert.equal(hints.state, null);
    assert.equal(hints.pincode, null);
  });

  it("keeps real state and pincode from address", () => {
    const hints = extractCustomerGeoHints(
      {
        primary: "Home",
        secondary: "Panipat",
        fullAddress: "Mahipal House, Panipat, Haryana, 132106",
        state: "Haryana",
        pincode: "132106",
      },
      { latitude: 29.37, longitude: 76.96 }
    );
    assert.equal(hints.state, "Haryana");
    assert.equal(hints.pincode, "132106");
    assert.equal(hints.lat, 29.37);
    assert.equal(hints.lng, 76.96);
  });

  it("ignores India-only trailing part without inventing Current location state", () => {
    const hints = extractCustomerGeoHints({
      primary: "X",
      secondary: "",
      fullAddress: "Some place, India",
    });
    assert.equal(hints.state, "Some place");
  });
});
