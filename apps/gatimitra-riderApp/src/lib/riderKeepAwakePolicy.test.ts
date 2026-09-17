import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRiderKeepScreenAwake } from "./riderKeepAwakePolicy.ts";

describe("shouldRiderKeepScreenAwake", () => {
  const base = {
    hasSession: true,
    isForeground: true,
    isOnDuty: false,
    hasActiveOrder: false,
    hasIncomingOffer: false,
  };

  it("foreground + ON-DUTY → awake", () => {
    assert.equal(shouldRiderKeepScreenAwake({ ...base, isOnDuty: true }), true);
  });

  it("foreground + active order (even OFF-DUTY) → awake", () => {
    assert.equal(shouldRiderKeepScreenAwake({ ...base, hasActiveOrder: true }), true);
  });

  it("foreground + incoming offer → awake", () => {
    assert.equal(shouldRiderKeepScreenAwake({ ...base, hasIncomingOffer: true }), true);
  });

  it("OFF-DUTY idle foreground → not awake", () => {
    assert.equal(shouldRiderKeepScreenAwake(base), false);
  });

  it("background releases even when ON-DUTY", () => {
    assert.equal(
      shouldRiderKeepScreenAwake({ ...base, isOnDuty: true, isForeground: false }),
      false,
    );
  });

  it("logout / no session releases", () => {
    assert.equal(
      shouldRiderKeepScreenAwake({ ...base, hasSession: false, isOnDuty: true }),
      false,
    );
  });

  it("navigate between screens still awake while ON-DUTY (policy unchanged)", () => {
    assert.equal(shouldRiderKeepScreenAwake({ ...base, isOnDuty: true }), true);
  });
});
