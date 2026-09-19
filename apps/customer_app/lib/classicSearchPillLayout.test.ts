import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP,
  CLASSIC_SEARCH_PILL_NAV_CLEARANCE,
  resolveClassicSearchPillBottom,
} from "./classicSearchPillLayout";
import { useClassicFoodChromeStore } from "../store/classicFoodChromeStore";

describe("resolveClassicSearchPillBottom", () => {
  it("clears the HOME edge capsule above chrome bottom", () => {
    const bottom = resolveClassicSearchPillBottom({
      safeBottom: 24,
      resolveChromeBottom: (b) => b + 8,
      cartDockVisible: false,
      floatingCartBarHeight: 64,
      classicNavExpanded: false,
    });
    assert.equal(
      bottom,
      24 + 8 + CLASSIC_SEARCH_PILL_NAV_CLEARANCE + CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP
    );
  });

  it("lifts above cart dock when cart floats above tab", () => {
    const bottom = resolveClassicSearchPillBottom({
      safeBottom: 0,
      resolveChromeBottom: () => 10,
      cartDockVisible: true,
      floatingCartBarHeight: 64,
      classicNavExpanded: false,
    });
    assert.equal(
      bottom,
      10 + CLASSIC_SEARCH_PILL_NAV_CLEARANCE + CLASSIC_SEARCH_PILL_ABOVE_CHROME_GAP + 64 + 16
    );
  });
});

describe("classicFoodChromeStore search pill", () => {
  it("shows while categories stick on scroll up and scroll down", () => {
    const store = useClassicFoodChromeStore.getState();
    store.setActive(false);
    store.setActive(true);
    store.setSearchPressHandler(() => undefined);
    assert.equal(useClassicFoodChromeStore.getState().searchPillVisible, false);

    store.setCategoriesSticky(true);
    assert.equal(useClassicFoodChromeStore.getState().searchPillVisible, true);

    store.onFoodListScrollY(40);
    store.onFoodListScrollY(120);
    assert.equal(useClassicFoodChromeStore.getState().searchPillVisible, true);
    const dirAfterDown = useClassicFoodChromeStore.getState().scrollDir;

    store.onFoodListScrollY(80);
    assert.equal(useClassicFoodChromeStore.getState().searchPillVisible, true);
    // Sticky flings must not rewrite chrome scrollDir (avoids mid-momentum re-renders).
    assert.equal(useClassicFoodChromeStore.getState().scrollDir, dirAfterDown);

    store.setCategoriesSticky(false);
    assert.equal(useClassicFoodChromeStore.getState().searchPillVisible, false);

    store.setActive(false);
  });
});
