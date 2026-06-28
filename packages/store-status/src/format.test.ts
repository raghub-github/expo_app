import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatStoreStatusLabel } from "./format.js";

/**
 * Pin the clock to a Sunday at 14:00 IST so weekday + tomorrow labels
 * are deterministic.
 *   2026-06-28T14:00:00 IST  = 2026-06-28T08:30:00.000Z
 */
const NOW = new Date("2026-06-28T08:30:00.000Z");
const TZ = "Asia/Kolkata";

describe("formatStoreStatusLabel", () => {
  it("phase=null → UNKNOWN, no countdown", () => {
    const out = formatStoreStatusLabel(
      {
        phase: null,
        nextOpenAt: null,
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "UNKNOWN");
    assert.equal(out.primary, "Status not available");
    assert.equal(out.countdown, undefined);
  });

  it("WITHIN_SLOT + isOpenNow + no override → Open · closes at HH:mm", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "WITHIN_SLOT",
        nextOpenAt: null,
        nextCloseAt: "2026-06-28T17:00:00.000Z", // 22:30 IST
        manualOverrideActive: false,
        isOpenNow: true,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "OPEN");
    assert.match(out.primary, /^Open · closes at 22:30$/);
    assert.equal(out.countdown?.verb, "Closes in");
  });

  it("WITHIN_SLOT + manualOverrideActive → Closed by merchant · schedule open until HH:mm", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "WITHIN_SLOT",
        nextOpenAt: "2026-06-29T06:00:00.000Z", // tomorrow 11:30 IST
        nextCloseAt: "2026-06-28T17:00:00.000Z", // today 22:30 IST
        manualOverrideActive: true,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "CLOSED");
    assert.match(out.primary, /^Closed by merchant · schedule open until 22:30$/);
    assert.equal(out.countdown?.verb, "Opens in");
    assert.equal(out.countdown?.targetIso, "2026-06-29T06:00:00.000Z");
  });

  it("BREAK → On break · reopens at HH:mm", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "BREAK",
        nextOpenAt: "2026-06-28T12:30:00.000Z", // 18:00 IST
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "BREAK");
    assert.match(out.primary, /^On break · reopens at 18:00$/);
  });

  it("PRE_BREAK + open → Open · break at HH:mm", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "PRE_BREAK",
        nextOpenAt: "2026-06-28T12:30:00.000Z", // 18:00 IST after break
        nextCloseAt: "2026-06-28T08:55:00.000Z", // 14:25 IST break starts soon
        manualOverrideActive: false,
        isOpenNow: true,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "OPEN");
    assert.match(out.primary, /^Open · break at 14:25$/);
  });

  it("OUTSIDE_HOURS today → Closed · opens at HH:mm (no day word when same day)", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "OUTSIDE_HOURS",
        nextOpenAt: "2026-06-28T12:00:00.000Z", // 17:30 IST today
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "CLOSED");
    assert.match(out.primary, /^Closed · opens at 17:30$/);
  });

  it("OUTSIDE_HOURS tomorrow → Closed · opens tomorrow HH:mm", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "OUTSIDE_HOURS",
        nextOpenAt: "2026-06-29T06:00:00.000Z", // 11:30 IST tomorrow
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "CLOSED");
    assert.match(out.primary, /^Closed · opens tomorrow at 11:30$/);
  });

  it("OFF_DAY tomorrow → Closed today · opens tomorrow HH:mm", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "OFF_DAY",
        nextOpenAt: "2026-06-29T06:00:00.000Z", // 11:30 IST tomorrow
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "CLOSED");
    assert.match(out.primary, /^Closed today · opens tomorrow 11:30$/);
  });

  it("OFF_DAY further away → weekday name in label", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "OFF_DAY",
        nextOpenAt: "2026-07-02T06:00:00.000Z", // Thu 11:30 IST
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "CLOSED");
    assert.match(out.primary, /^Closed today · opens Thu 11:30$/);
  });

  it("NO_HOURS → Hours not set", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "NO_HOURS",
        nextOpenAt: null,
        nextCloseAt: null,
        manualOverrideActive: false,
        isOpenNow: false,
        timezone: TZ,
      },
      NOW,
    );
    assert.equal(out.chip, "UNKNOWN");
    assert.match(out.primary, /^Hours not set$/);
  });

  it("timezone fallback when not provided → Asia/Kolkata", () => {
    const out = formatStoreStatusLabel(
      {
        phase: "WITHIN_SLOT",
        nextOpenAt: null,
        nextCloseAt: "2026-06-28T17:00:00.000Z",
        manualOverrideActive: false,
        isOpenNow: true,
      },
      NOW,
    );
    assert.equal(out.chip, "OPEN");
    assert.match(out.primary, /^Open · closes at 22:30$/);
  });
});
