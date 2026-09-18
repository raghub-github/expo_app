import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  acknowledgeNavigatorPrimaryTab,
  commitPrimaryTab,
  getCustomerPrimaryTabNavState,
  hrefForPrimaryTab,
  isStalePrimaryTabEpoch,
  primaryTabFromPathname,
  primaryTabFromRouteName,
  requestPrimaryTab,
  resetCustomerPrimaryTabNavForTests,
  resolveOptimisticPrimaryTabIndex,
  tryStalePrimaryTabNavigate,
} from "./customerPrimaryTabNav";

function tabIndex(name: string): number {
  const order = ["index", "food", "orders", "profile"];
  const i = order.indexOf(name);
  return i >= 0 ? i : 0;
}

describe("customerPrimaryTabNav — Home↔Food authority", () => {
  beforeEach(() => {
    resetCustomerPrimaryTabNavForTests("index");
  });

  it("(1) cold start → Home", () => {
    const s = getCustomerPrimaryTabNavState();
    assert.equal(s.committedTab, "index");
    assert.equal(s.requestedTab, "index");
    assert.equal(s.epoch, 0);
    assert.equal(hrefForPrimaryTab("index"), "/(tabs)/");
  });

  it("(2) Home → Food once", () => {
    const d = requestPrimaryTab("food", "test.home→food");
    assert.equal(d.action, "commit");
    if (d.action !== "commit") return;
    assert.equal(d.tab, "food");
    assert.equal(d.previousTab, "index");
    acknowledgeNavigatorPrimaryTab("food", "test.ack");
    const s = getCustomerPrimaryTabNavState();
    assert.equal(s.committedTab, "food");
    assert.equal(s.inflightEpoch, null);
  });

  it("(3) Food remains Food after restaurants/categories finish loading (no auto Home)", () => {
    requestPrimaryTab("food", "test");
    acknowledgeNavigatorPrimaryTab("food");
    // Simulated data/API completion — must not invent a tab change.
    const before = getCustomerPrimaryTabNavState().epoch;
    acknowledgeNavigatorPrimaryTab("food", "data-loaded");
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "food");
    assert.equal(getCustomerPrimaryTabNavState().epoch, before);
  });

  it("(4) Food → Home once", () => {
    requestPrimaryTab("food", "a");
    acknowledgeNavigatorPrimaryTab("food");
    const d = requestPrimaryTab("index", "test.food→home");
    assert.equal(d.action, "commit");
    acknowledgeNavigatorPrimaryTab("index");
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "index");
  });

  it("(5) Home → Food → Home rapidly ends on Home", () => {
    requestPrimaryTab("food", "tap1");
    requestPrimaryTab("index", "tap2");
    // Stale navigator flash to food while Home is requested
    acknowledgeNavigatorPrimaryTab("food", "stale-flash");
    assert.equal(getCustomerPrimaryTabNavState().requestedTab, "index");
    assert.notEqual(getCustomerPrimaryTabNavState().inflightEpoch, null);
    acknowledgeNavigatorPrimaryTab("index", "settle");
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "index");
    assert.equal(getCustomerPrimaryTabNavState().inflightEpoch, null);
  });

  it("(6) rapid repeated Food taps do not stack navigations", () => {
    const first = requestPrimaryTab("food", "food-1");
    assert.equal(first.action, "commit");
    const second = requestPrimaryTab("food", "food-2");
    assert.equal(second.action, "ignore");
    if (second.action === "ignore") assert.equal(second.reason, "duplicate_inflight");
    acknowledgeNavigatorPrimaryTab("food");
    const third = requestPrimaryTab("food", "food-3");
    assert.equal(third.action, "ignore");
    if (third.action === "ignore") assert.equal(third.reason, "same_tab");
  });

  it("(7) delayed API response arriving after tab change cannot navigate back", () => {
    const toFood = requestPrimaryTab("food", "user");
    assert.equal(toFood.action, "commit");
    if (toFood.action !== "commit") return;
    const captured = toFood.epoch;
    requestPrimaryTab("index", "user-later");
    const stale = tryStalePrimaryTabNavigate(captured, "food", "api-callback");
    assert.equal(stale.action, "ignore");
    if (stale.action === "ignore") assert.equal(stale.reason, "stale_epoch");
    assert.equal(getCustomerPrimaryTabNavState().requestedTab, "index");
  });

  it("(8) WebSocket-style event during navigation does not invent tab intent", () => {
    requestPrimaryTab("food", "user");
    const epochBefore = getCustomerPrimaryTabNavState().epoch;
    // Background event only acks current route; no requestPrimaryTab.
    acknowledgeNavigatorPrimaryTab("food", "ws-event");
    assert.equal(getCustomerPrimaryTabNavState().epoch, epochBefore);
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "food");
  });

  it("(9) app resume during Food — ack same route, no Home switch", () => {
    requestPrimaryTab("food", "user");
    acknowledgeNavigatorPrimaryTab("food");
    acknowledgeNavigatorPrimaryTab("food", "app-resume");
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "food");
  });

  it("(10) location update during Food — no tab change", () => {
    requestPrimaryTab("food", "user");
    acknowledgeNavigatorPrimaryTab("food");
    const epoch = getCustomerPrimaryTabNavState().epoch;
    // Location refresh is not a tab intent.
    assert.equal(isStalePrimaryTabEpoch(epoch), false);
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "food");
  });

  it("(11) notification while Food open — FOOD_HOME stays Food; HOME is explicit", () => {
    requestPrimaryTab("food", "user");
    acknowledgeNavigatorPrimaryTab("food");
    assert.equal(primaryTabFromPathname("/(tabs)/food"), "food");
    assert.equal(primaryTabFromPathname("/food"), "food");
    // Explicit HOME notification is a new intent (allowed).
    requestPrimaryTab("index", "notification.HOME");
    acknowledgeNavigatorPrimaryTab("index");
    assert.equal(getCustomerPrimaryTabNavState().committedTab, "index");
  });

  it("(12) persisted old tab during startup cannot overwrite newer user tap", () => {
    // Old persisted Food intent captured at epoch 0; user already moved to Home.
    requestPrimaryTab("food", "persisted-hydrate-start");
    const oldEpoch = getCustomerPrimaryTabNavState().epoch;
    requestPrimaryTab("index", "user-cold");
    const staleHydration = tryStalePrimaryTabNavigate(oldEpoch, "food", "persisted-hydrate");
    assert.equal(staleHydration.action, "ignore");
    assert.equal(getCustomerPrimaryTabNavState().requestedTab, "index");
  });

  it("(13) stale async callback after newer selection is ignored", () => {
    const a = requestPrimaryTab("food", "a");
    assert.equal(a.action, "commit");
    if (a.action !== "commit") return;
    requestPrimaryTab("orders", "b");
    assert.equal(isStalePrimaryTabEpoch(a.epoch), true);
    const ignored = tryStalePrimaryTabNavigate(a.epoch, "food", "stale-async");
    assert.equal(ignored.action, "ignore");
    assert.equal(getCustomerPrimaryTabNavState().requestedTab, "orders");
  });

  it("optimistic pill stays on requested tab while navigator flashes wrong index", () => {
    requestPrimaryTab("food", "user");
    assert.equal(resolveOptimisticPrimaryTabIndex("index", tabIndex), 1);
    acknowledgeNavigatorPrimaryTab("food");
    assert.equal(resolveOptimisticPrimaryTabIndex("food", tabIndex), 1);
  });

  it("primaryTabFromRouteName / pathname helpers", () => {
    assert.equal(primaryTabFromRouteName("food"), "food");
    assert.equal(primaryTabFromRouteName("index"), "index");
    assert.equal(primaryTabFromPathname("/(tabs)/"), "index");
    assert.equal(primaryTabFromPathname("/orders"), "orders");
  });

  it("commitPrimaryTab rejects stale epochs for a different tab", () => {
    const d = requestPrimaryTab("food", "x");
    assert.equal(d.action, "commit");
    if (d.action !== "commit") return;
    requestPrimaryTab("index", "y");
    assert.equal(commitPrimaryTab(d.epoch, "food", "stale-commit"), false);
    assert.equal(getCustomerPrimaryTabNavState().requestedTab, "index");
  });
});
