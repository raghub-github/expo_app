import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTerminalDispatchOfferEvent,
  ORDER_ASSIGNED_TO_OTHER_RIDER,
} from "./rider-dispatch-assignment-audit.ts";

test("terminal offer events include cancelled so assigned orders cannot recover as pending", () => {
  assert.equal(isTerminalDispatchOfferEvent("cancelled"), true);
  assert.equal(isTerminalDispatchOfferEvent("accepted"), true);
  assert.equal(isTerminalDispatchOfferEvent("offer_sent"), false);
  assert.equal(ORDER_ASSIGNED_TO_OTHER_RIDER, "ORDER_ASSIGNED_TO_OTHER_RIDER");
});
