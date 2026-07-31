import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alreadyChargedOnIstDate,
  isTimeBasedSubscriptionRenewalCycle,
  toIstDateStr,
} from "./rider-subscription-accept-fee.js";

describe("isTimeBasedSubscriptionRenewalCycle", () => {
  it("excludes daily from cron renewals", () => {
    assert.equal(isTimeBasedSubscriptionRenewalCycle("daily"), false);
    assert.equal(isTimeBasedSubscriptionRenewalCycle("Daily"), false);
  });

  it("keeps non-daily cycles on cron", () => {
    assert.equal(isTimeBasedSubscriptionRenewalCycle("monthly"), true);
    assert.equal(isTimeBasedSubscriptionRenewalCycle("semi_yearly"), true);
    assert.equal(isTimeBasedSubscriptionRenewalCycle("yearly"), true);
  });
});

describe("alreadyChargedOnIstDate", () => {
  const today = "2026-07-28";

  it("skips when last_accept_fee_on_date is today", () => {
    assert.equal(
      alreadyChargedOnIstDate({
        todayIst: today,
        lastAcceptFeeOnDate: today,
        lastDeductionAt: null,
        lastFeeLedgerAt: null,
      }),
      true
    );
  });

  it("skips when last_deduction_at is today IST", () => {
    // 2026-07-28 12:00 IST = 2026-07-28 06:30 UTC
    const lastDeductionAt = new Date("2026-07-28T06:30:00.000Z");
    assert.equal(toIstDateStr(lastDeductionAt), today);
    assert.equal(
      alreadyChargedOnIstDate({
        todayIst: today,
        lastAcceptFeeOnDate: null,
        lastDeductionAt,
        lastFeeLedgerAt: null,
      }),
      true
    );
  });

  it("skips when ledger fee is today IST (activation same day)", () => {
    const lastFeeLedgerAt = new Date("2026-07-28T02:00:00.000Z");
    assert.equal(
      alreadyChargedOnIstDate({
        todayIst: today,
        lastAcceptFeeOnDate: null,
        lastDeductionAt: null,
        lastFeeLedgerAt,
      }),
      true
    );
  });

  it("allows charge when last fee was yesterday IST", () => {
    const yesterday = new Date("2026-07-27T06:30:00.000Z");
    assert.equal(
      alreadyChargedOnIstDate({
        todayIst: today,
        lastAcceptFeeOnDate: "2026-07-27",
        lastDeductionAt: yesterday,
        lastFeeLedgerAt: yesterday,
      }),
      false
    );
  });
});
