import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  geoOpenToLocationMapPath,
  isGeoOrMapsOpenPath,
  parseGeoOpenLink,
} from "./geoOpenLink";

describe("parseGeoOpenLink", () => {
  it("parses geo:lat,lng", () => {
    assert.deepEqual(parseGeoOpenLink("geo:28.4595,77.0266"), {
      latitude: 28.4595,
      longitude: 77.0266,
    });
  });

  it("parses geo:0,0?q=lat,lng(Label)", () => {
    assert.deepEqual(parseGeoOpenLink("geo:0,0?q=28.4595,77.0266(Gurgaon%20Hr)"), {
      latitude: 28.4595,
      longitude: 77.0266,
      label: "Gurgaon Hr",
    });
  });

  it("parses Google Maps query URL", () => {
    assert.deepEqual(
      parseGeoOpenLink("https://www.google.com/maps/search/?api=1&query=28.4595,77.0266"),
      {
        latitude: 28.4595,
        longitude: 77.0266,
      },
    );
  });

  it("parses Google Maps @lat,lng path", () => {
    assert.deepEqual(parseGeoOpenLink("https://www.google.com/maps/@28.4595,77.0266,17z"), {
      latitude: 28.4595,
      longitude: 77.0266,
    });
  });

  it("detects geo/maps paths", () => {
    assert.equal(isGeoOrMapsOpenPath("geo:1,2"), true);
    assert.equal(isGeoOrMapsOpenPath("https://maps.google.com/?q=1,2"), true);
    assert.equal(isGeoOrMapsOpenPath("https://gatimitra.com/ref/x"), false);
  });

  it("builds location-map path", () => {
    const path = geoOpenToLocationMapPath({
      latitude: 28.4,
      longitude: 77.0,
      label: "Test",
    });
    assert.equal(path.includes("/location-map?"), true);
    assert.equal(path.includes("latitude=28.4"), true);
  });
});
