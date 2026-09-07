import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRestaurantShareMessage,
  buildRestaurantShareUrl,
  extractRestaurantShareSlug,
  isRestaurantSharePath,
} from "./restaurantShareLink";

describe("restaurantShareLink", () => {
  it("builds a gatimitra.com restaurant URL", () => {
    assert.equal(
      buildRestaurantShareUrl("roll-club-panipat"),
      "https://gatimitra.com/restaurant/roll-club-panipat"
    );
  });

  it("builds a Zomato-style share body", () => {
    assert.equal(
      buildRestaurantShareMessage("Roll Club", "https://gatimitra.com/restaurant/roll-club-panipat"),
      "Roll Club\nhttps://gatimitra.com/restaurant/roll-club-panipat"
    );
  });

  it("reads the canonical restaurant path", () => {
    assert.equal(
      extractRestaurantShareSlug("https://gatimitra.com/restaurant/roll-club-panipat"),
      "roll-club-panipat"
    );
  });

  it("detects share paths", () => {
    assert.equal(isRestaurantSharePath("https://gatimitra.com/restaurant/x"), true);
    assert.equal(isRestaurantSharePath("https://gatimitra.com/home"), false);
  });
});
