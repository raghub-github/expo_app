import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NAV_ROUTE_HIDE_DISTANCE_M, shouldHideNavigationRoute } from "./route-visibility";

describe("shouldHideNavigationRoute", () => {
  it("keeps the polyline visible until the ~40m at-pin rule", () => {
    assert.equal(NAV_ROUTE_HIDE_DISTANCE_M, 40);
    assert.equal(shouldHideNavigationRoute(false, 41), false);
    assert.equal(shouldHideNavigationRoute(false, 40), true);
    assert.equal(shouldHideNavigationRoute(true, 500), true);
  });
});
