import { test } from "node:test";
import assert from "node:assert/strict";
import { parseV6Reverse, type V6ReverseFeature } from "./mapboxReverseParse";

const LAT = 25.5941;
const LNG = 85.1376;

const feature = (
  type: string,
  name: string,
  coords: [number, number] = [LNG, LAT],
  extra: Partial<NonNullable<V6ReverseFeature["properties"]>> = {}
): V6ReverseFeature => ({
  geometry: { coordinates: coords },
  properties: { feature_type: type, name, ...extra },
});

// Shapes copied from live v6 responses (no `types` param).
const TOWN: V6ReverseFeature[] = [
  feature("address", "Near Midil School 1", [LNG, LAT], {
    full_address: "Near Midil School 1, Patna, 800001, India",
  }),
  feature("postcode", "800001"),
  feature("locality", "Mithapur"),
  feature("place", "Patna"),
  feature("region", "Bihar"),
  feature("country", "India"),
];
const RURAL: V6ReverseFeature[] = [
  feature("postcode", "848117"),
  feature("locality", "Lakhanpatti"),
  feature("place", "Khanpur"),
  feature("district", "Samastipur"),
  feature("region", "Bihar"),
  feature("country", "India"),
];

test("town: street address names the point; PIN, area, city, state all filled", () => {
  const r = parseV6Reverse(TOWN, LAT, LNG)!;
  assert.equal(r.name, "Near Midil School 1");
  assert.equal(r.fullAddress, "Near Midil School 1, Patna, 800001, India");
  assert.equal(r.area, "Mithapur");
  assert.equal(r.city, "Patna");
  assert.equal(r.state, "Bihar");
  assert.equal(r.pincode, "800001");
  assert.equal(r.approximate, false);
});

test("rural: no address feature still yields a real name and PIN", () => {
  const r = parseV6Reverse(RURAL, LAT, LNG)!;
  assert.equal(r.name, "Lakhanpatti");
  assert.equal(r.city, "Khanpur");
  assert.equal(r.pincode, "848117");
  assert.equal(r.approximate, true);
  assert.ok(r.fullAddress.includes("Lakhanpatti"));
  assert.ok(r.fullAddress.includes("848117"));
});

test("a street address far from the point is not presented as the point", () => {
  const farStreet = feature("address", "Some Far Road 9", [LNG + 0.01, LAT], {
    full_address: "Some Far Road 9, Patna, 800001, India",
  });
  const r = parseV6Reverse([farStreet, ...TOWN.slice(1)], LAT, LNG)!;
  assert.equal(r.name, "Mithapur");
  assert.ok(!r.fullAddress.includes("Some Far Road"));
  assert.equal(r.approximate, true);
});

test("a street just past the exact-match radius is used but marked approximate", () => {
  // ~90 m: inside the trust radius, outside the exact one.
  const near = feature("address", "Near Road", [LNG + 0.0009, LAT], {
    full_address: "Near Road, Patna, 800001, India",
  });
  const r = parseV6Reverse([near, ...TOWN.slice(1)], LAT, LNG)!;
  assert.equal(r.name, "Near Road");
  assert.equal(r.approximate, true);
});

test("fields missing as features are recovered from another feature's context", () => {
  const r = parseV6Reverse(
    [
      feature("address", "X Road", [LNG, LAT], {
        full_address: "X Road, Patna",
        context: {
          postcode: { name: "800020" },
          place: { name: "Patna" },
          region: { name: "Bihar" },
          neighborhood: { name: "Kankarbagh" },
        },
      }),
    ],
    LAT,
    LNG
  )!;
  assert.equal(r.pincode, "800020");
  assert.equal(r.city, "Patna");
  assert.equal(r.state, "Bihar");
  assert.equal(r.area, "Kankarbagh");
});

test("no repeated parts in a composed address", () => {
  const r = parseV6Reverse(
    [feature("place", "Patna"), feature("locality", "Patna"), feature("region", "Bihar")],
    LAT,
    LNG
  )!;
  assert.equal(r.fullAddress, "Patna, Bihar, India");
});

test("empty, null and nameless responses return null, so the next provider runs", () => {
  assert.equal(parseV6Reverse([], LAT, LNG), null);
  assert.equal(parseV6Reverse(null, LAT, LNG), null);
  assert.equal(parseV6Reverse([{ properties: { feature_type: "place" } }], LAT, LNG), null);
});
