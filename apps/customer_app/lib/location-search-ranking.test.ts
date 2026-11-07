import { test } from "node:test";
import assert from "node:assert/strict";
import {
  finalizeRapidoSuggestions,
  mergeProviderResults,
  simplifySearchQuery,
} from "./location-search-ranking";
import type { EnrichedPlaceResult } from "../services/locationSearch.service";

const PATNA = { latitude: 25.5941, longitude: 85.1376 };

const place = (over: Partial<EnrichedPlaceResult> & { primary: string }): EnrichedPlaceResult => ({
  secondary: "",
  fullAddress: over.primary,
  latitude: PATNA.latitude,
  longitude: PATNA.longitude,
  source: "mapbox",
  ...over,
});

test("the same place from both providers is kept once, as the v6 entry (no retrieve needed)", () => {
  const sb = place({ primary: "Kankarbagh", city: "Patna", pendingRetrieve: true, latitude: 0, longitude: 0 });
  const v6 = place({ primary: "Kankarbagh", city: "Patna", pendingRetrieve: false });
  const merged = mergeProviderResults([sb], [v6], PATNA);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.pendingRetrieve, false);
});

test("what only one provider knows survives: the road from v6, the station from Search Box", () => {
  const merged = mergeProviderResults(
    [place({ primary: "Patna Junction", featureType: "poi", city: "Patna" })],
    [place({ primary: "Boring Rd", featureType: "street", city: "Patna" })],
    PATNA
  );
  assert.deepEqual(merged.map((r) => r.primary).sort(), ["Boring Rd", "Patna Junction"]);
});

test("same name in different cities are different places", () => {
  const merged = mergeProviderResults(
    [place({ primary: "MG Road", city: "Pune" })],
    [place({ primary: "MG Road", city: "Patna" })],
    PATNA
  );
  assert.equal(merged.length, 2);
});

test("distance is filled from coordinates, but never computed from a pending (0,0) result", () => {
  const merged = mergeProviderResults(
    [place({ primary: "Pending", pendingRetrieve: true, latitude: 0, longitude: 0 })],
    [place({ primary: "Known", latitude: 25.6, longitude: 85.14 })],
    PATNA
  );
  const known = merged.find((r) => r.primary === "Known")!;
  const pending = merged.find((r) => r.primary === "Pending")!;
  assert.ok(known.distanceKm != null && known.distanceKm < 2);
  assert.equal(pending.distanceKm, undefined);
});

test("a nearby match beats an equally-worded one in another state", () => {
  const ranked = finalizeRapidoSuggestions(
    [
      place({ primary: "Apollo Hospital Road", featureType: "street", distanceKm: 900, confidenceScore: 0.98 }),
      place({ primary: "Apollo Hospital", featureType: "poi", distanceKm: 4, confidenceScore: 1 }),
    ],
    "apollo hospital"
  );
  assert.equal(ranked[0]!.primary, "Apollo Hospital");
});

test("a far exact match still ranks above a weak nearby one (searching another city)", () => {
  const ranked = finalizeRapidoSuggestions(
    [
      place({ primary: "Andheri Sweet Corner Lane", featureType: "street", distanceKm: 2, confidenceScore: 0.5 }),
      place({ primary: "Andheri West", featureType: "locality", distanceKm: 1500, confidenceScore: 1 }),
    ],
    "andheri west"
  );
  assert.equal(ranked[0]!.primary, "Andheri West");
});

test("simplifySearchQuery: full typed address falls back to the parts a map knows", () => {
  const variants = simplifySearchQuery("Flat 203, Shanti Apartment, Kankarbagh, Patna");
  assert.equal(variants[0], "Shanti Apartment, Kankarbagh, Patna");
  assert.ok(variants.includes("Kankarbagh, Patna"));
});

test("simplifySearchQuery: strips relation words and house numbers", () => {
  assert.equal(simplifySearchQuery("near gandhi maidan")[0], "gandhi maidan");
  assert.equal(simplifySearchQuery("house 12 boring road patna")[0], "boring road patna");
  assert.equal(simplifySearchQuery("h.no 5/2 kankarbagh")[0], "kankarbagh");
});

test("simplifySearchQuery: never repeats the original or offers a too-short query", () => {
  assert.deepEqual(simplifySearchQuery("patna"), []);
  const variants = simplifySearchQuery("shanti apartment kankarbagh main road");
  assert.ok(!variants.includes("shanti apartment kankarbagh main road"));
  assert.equal(new Set(variants).size, variants.length);
  assert.ok(variants.every((v) => v.length >= 3));
});

// Shapes and scores below come from live Mapbox answers for these queries.
test("the place actually named this beats businesses merely located in it", () => {
  const ranked = finalizeRapidoSuggestions(
    [
      place({
        primary: "Lakme Salon For Him and Her in Koramangala 5th Block,Bengaluru",
        area: "Koramangala 5th Block",
        featureType: "poi",
        distanceKm: 1612,
        confidenceScore: 0.75,
      }),
      place({
        primary: "OYO Rooms Koramangala 5th Block",
        area: "Koramangala 5th Block",
        featureType: "poi",
        distanceKm: 1613,
        confidenceScore: 0.75,
      }),
      place({
        primary: "Wellness Forever Phamacy - 60 Feet Road",
        area: "Koramangala 5th Block",
        featureType: "poi",
        distanceKm: 1612,
        confidenceScore: 0.4,
      }),
      place({
        primary: "Koramangala 5th Block",
        featureType: "neighborhood",
        distanceKm: 1613,
        confidenceScore: 1,
      }),
    ],
    "koramangala 5th block"
  );
  assert.equal(ranked[0]!.primary, "Koramangala 5th Block");
});

test("a locality and a street with one name collapse to the locality, in any order", () => {
  const locality = place({ primary: "Andheri West", city: "Mumbai", featureType: "locality", confidenceScore: 1 });
  const street = place({ primary: "Andheri West", city: "Mumbai", featureType: "street", confidenceScore: 1 });
  for (const input of [[locality, street], [street, locality]]) {
    const ranked = finalizeRapidoSuggestions(input, "andheri west");
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]!.featureType, "locality");
  }
});

test("searching another city: its locality leads, ahead of POIs named after it", () => {
  const ranked = finalizeRapidoSuggestions(
    [
      place({ primary: "Andheri West Market", city: "Mumbai", featureType: "poi", distanceKm: 1453, confidenceScore: 0.98 }),
      place({ primary: "Andheri West Metro Station", city: "Mumbai", featureType: "poi", distanceKm: 1454, confidenceScore: 0.98 }),
      place({ primary: "Andheri West", city: "Mumbai", featureType: "locality", distanceKm: 1454, confidenceScore: 1 }),
    ],
    "andheri west"
  );
  assert.equal(ranked[0]!.primary, "Andheri West");
});

test("a business found only through its address still appears", () => {
  const ranked = finalizeRapidoSuggestions(
    [place({ primary: "Some Clinic", area: "Rajendra Nagar", source: "local", featureType: "poi" })],
    "rajendra nagar"
  );
  assert.equal(ranked.length, 1);
});
