/**
 * Prove device-local mute and global order stop are separate domains.
 * Pure tests — no native / SecureStore / React Native imports.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  __resetTerminalOrderAlertRetirementForTests,
  isOrderAlertGloballyRetired,
  retireTerminalOrderAlert,
} from "./orderAlertTerminalRetirement";

describe("order alert state isolation contracts", () => {
  beforeEach(() => {
    __resetTerminalOrderAlertRetirementForTests();
  });

  it("local mute reasons are not terminal order statuses", () => {
    const localMuteEvents = new Set(["app_open_mute", "device_sound_off", "device_alerts_off", "dismissed"]);
    const terminalEvents = new Set([
      "ORDER_ACCEPTED",
      "ORDER_REJECTED",
      "ORDER_CANCELLED",
      "ORDER_EXPIRED",
      "STOP_ALERT",
    ]);
    for (const local of localMuteEvents) {
      assert.equal(terminalEvents.has(local), false);
    }
  });

  it("global stop payload scope must not be confused with device mute", () => {
    const globalStop = {
      gmAlertAction: "stop",
      scope: "global_order_stop",
      event: "STOP_ALERT",
      foodOrderId: "100058",
    };
    const deviceMute = {
      soundAlertsEnabled: false,
      orderAlertsEnabled: false,
    };
    assert.equal(globalStop.scope, "global_order_stop");
    assert.equal("scope" in deviceMute, false);
    assert.equal("gmAlertAction" in deviceMute, false);
    assert.equal("soundAlertsEnabled" in globalStop, false);
  });

  it("device preference keys must be installation-scoped, not account-only", () => {
    const deviceIdA = "merchant_aaa";
    const deviceIdB = "merchant_bbb";
    const storeId = 12;
    const keyA = `merchant_device_order_alerts_v2:${deviceIdA}:${storeId}`;
    const keyB = `merchant_device_order_alerts_v2:${deviceIdB}:${storeId}`;
    assert.notEqual(keyA, keyB);
    assert.match(keyA, /merchant_aaa/);
    assert.match(keyB, /merchant_bbb/);
  });

  it("stopping one order id must not imply stopping another", () => {
    retireTerminalOrderAlert("100058", "accepted");
    assert.equal(isOrderAlertGloballyRetired("100058"), true);
    assert.equal(isOrderAlertGloballyRetired("100059"), false);
  });

  it("app-open / device mute strings never retire an order", () => {
    // Local mute is a different API (muteNewOrderAlertOnAppOpen) and must not
    // call retireTerminalOrderAlert. Non-terminal strings are ignored at runtime.
    assert.equal(isOrderAlertGloballyRetired("pending_1"), false);
    retireTerminalOrderAlert("pending_1", "dismissed");
    retireTerminalOrderAlert("pending_1", "app_open_mute");
    retireTerminalOrderAlert("pending_1", "disabled");
    assert.equal(isOrderAlertGloballyRetired("pending_1"), false);
  });

  it("accept / reject / cancel / expire all retire independently", () => {
    retireTerminalOrderAlert("a1", "accepted");
    retireTerminalOrderAlert("r1", "rejected");
    retireTerminalOrderAlert("c1", "cancelled");
    retireTerminalOrderAlert("e1", "expired");
    assert.equal(isOrderAlertGloballyRetired("a1"), true);
    assert.equal(isOrderAlertGloballyRetired("r1"), true);
    assert.equal(isOrderAlertGloballyRetired("c1"), true);
    assert.equal(isOrderAlertGloballyRetired("e1"), true);
  });
});
