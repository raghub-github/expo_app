/**
 * Catalog search unit tests — normalize, typo, rank, serviceability.
 * Run: node --import tsx --test src/modules/merchants/search*.test.ts
 * (or project’s existing node:test runner for merchants).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSearchQuery } from "./searchNormalize.js";
import { suggestTypoCorrection, TYPO_MIN_CONFIDENCE } from "./searchTypo.js";
import { rankSearchResults, scoreDishName, scoreStoreName } from "./searchRank.js";
import { isStoreServiceableAt, filterServiceableStoreIds } from "./searchServiceability.js";

describe("searchNormalize", () => {
  it("trims, lowercases, collapses spaces, strips punct", () => {
    const n = normalizeSearchQuery("  Biryani!!  Extra  ");
    assert.equal(n.normalized, "biryani extra");
    assert.deepEqual(n.tokens, ["biryani", "extra"]);
  });

  it("preserves food-ish tokens with apostrophe / hyphen", () => {
    const n = normalizeSearchQuery("McDonald's t-bone");
    assert.ok(n.normalized.includes("mcdonald"));
    assert.ok(n.normalized.includes("t-bone") || n.normalized.includes("t bone"));
  });
});

describe("searchTypo", () => {
  it("suggests biryani for biriyani above confidence gate", () => {
    const s = suggestTypoCorrection("biriyani");
    assert.ok(s);
    assert.equal(s!.correctedQuery, "biryani");
    assert.ok(s!.confidence >= TYPO_MIN_CONFIDENCE);
  });

  it("does not invent corrections for unrelated tokens", () => {
    const s = suggestTypoCorrection("zzzznotarealfoodtoken");
    assert.equal(s, null);
  });
});

describe("searchRank", () => {
  it("ranks exact store name above distant weak dish match", () => {
    const stores = [
      {
        id: 1,
        store_name: "Dominos Pizza",
        store_display_name: "Dominos Pizza",
        distance_km: 4,
      },
      {
        id: 2,
        store_name: "Random Cafe",
        store_display_name: null,
        distance_km: 0.5,
      },
    ];
    const dishes = [
      {
        store_id: 2,
        item_name: "Garlic Bread",
        distance_km: 0.5,
      },
      {
        store_id: 1,
        item_name: "Farmhouse Pizza",
        distance_km: 4,
        is_popular: true,
      },
    ];
    const ranked = rankSearchResults("dominos", stores, dishes);
    assert.equal(ranked.stores[0]!.id, 1);
    assert.equal(ranked.preferStores, true);
  });

  it("ranks cuisine/item-matched kitchens for dish queries like pizza", () => {
    const stores = [
      {
        id: 1,
        store_name: "Swaad Sutra",
        store_display_name: "Swaad Sutra",
        cuisine_types: ["Pizza", "Italian"],
        matchedViaItem: true,
        distance_km: 2,
      },
      {
        id: 2,
        store_name: "Tea Stall",
        store_display_name: null,
        cuisine_types: ["Tea"],
        distance_km: 0.4,
      },
    ];
    const dishes = [
      { store_id: 1, item_name: "Farmhouse Pizza", distance_km: 2 },
    ];
    const ranked = rankSearchResults("pizza", stores, dishes);
    assert.equal(ranked.stores[0]!.id, 1);
    assert.ok(ranked.stores.length === 2);
  });

  it("scores exact dish higher than substring", () => {
    const exact = scoreDishName({ store_id: 1, item_name: "Momos" }, "momos");
    const weak = scoreDishName({ store_id: 1, item_name: "Chicken Momos Platter" }, "xyz");
    assert.ok(exact > weak);
  });

  it("applies distance as secondary (exact still wins)", () => {
    const nearWeak = scoreStoreName(
      { id: 1, store_name: "Abc", store_display_name: null, distance_km: 0.2 },
      "pizza hut"
    );
    const farExact = scoreStoreName(
      { id: 2, store_name: "Pizza Hut", store_display_name: "Pizza Hut", distance_km: 8 },
      "pizza hut"
    );
    assert.ok(farExact > nearWeak);
  });
});

describe("searchServiceability", () => {
  it("rejects stores beyond delivery_radius_km even if under global cap", () => {
    // ~5km apart roughly: Delhi coords
    const userLat = 28.6139;
    const userLng = 77.209;
    const store = {
      id: 1,
      latitude: 28.65,
      longitude: 77.25,
      delivery_radius_km: 2,
      is_active: true,
      has_customer_visible_menu: true,
    };
    const r = isStoreServiceableAt(store, userLat, userLng, 15);
    assert.equal(r.ok, false);
    assert.ok((r.distanceKm ?? 0) > 2);
  });

  it("accepts stores within min(cap, delivery_radius)", () => {
    const userLat = 28.6139;
    const userLng = 77.209;
    const store = {
      id: 2,
      latitude: 28.6145,
      longitude: 77.2095,
      delivery_radius_km: 5,
      is_active: true,
      has_customer_visible_menu: true,
    };
    const r = isStoreServiceableAt(store, userLat, userLng, 15);
    assert.equal(r.ok, true);
  });

  it("filterServiceableStoreIds drops inactive / no-menu", () => {
    const map = filterServiceableStoreIds(
      [
        {
          id: 1,
          latitude: 28.614,
          longitude: 77.209,
          delivery_radius_km: 10,
          is_active: false,
          has_customer_visible_menu: true,
        },
        {
          id: 2,
          latitude: 28.614,
          longitude: 77.209,
          delivery_radius_km: 10,
          is_active: true,
          has_customer_visible_menu: false,
        },
        {
          id: 3,
          latitude: 28.614,
          longitude: 77.209,
          delivery_radius_km: 10,
          is_active: true,
          has_customer_visible_menu: true,
        },
      ],
      28.6139,
      77.209,
      15
    );
    assert.equal(map.has(1), false);
    assert.equal(map.has(2), false);
    assert.equal(map.has(3), true);
  });
});
