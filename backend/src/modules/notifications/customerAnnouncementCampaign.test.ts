import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  announcementPresentationMode,
  campaignValidity,
  formatRemainingHms,
  normalizeCtaLabel,
  parseCustomerAnnouncementFields,
  remainingMsUntil,
  sanitizePlainText,
} from "./customerAnnouncementCampaign.js";

describe("customer announcement campaign helpers", () => {
  it("treats blank or whitespace CTA as absent", () => {
    assert.equal(normalizeCtaLabel(""), null);
    assert.equal(normalizeCtaLabel("   "), null);
    assert.equal(normalizeCtaLabel(null), null);
    assert.equal(normalizeCtaLabel("Order Now"), "Order Now");
    assert.equal(normalizeCtaLabel("  Shop Now  "), "Shop Now");
  });

  it("never invents a hardcoded CTA", () => {
    assert.equal(normalizeCtaLabel(undefined), null);
    assert.notEqual(normalizeCtaLabel("Book Ride"), "Order Now");
    assert.notEqual(normalizeCtaLabel("Book Ride"), "View Offers");
  });

  it("caps title and body to platform-safe lengths", () => {
    const long = "x".repeat(400);
    assert.equal(sanitizePlainText(long, 80).length, 80);
    assert.equal(sanitizePlainText(long, 240).length, 240);
  });

  it("formats remaining time as HH:MM:SS and never negative", () => {
    assert.equal(formatRemainingHms(0), "00:00:00");
    assert.equal(formatRemainingHms(-5000), "00:00:00");
    assert.equal(formatRemainingHms((2 * 3600 + 28 * 60) * 1000), "02:28:00");
    assert.equal(formatRemainingHms((1 * 86400 + 2 * 3600) * 1000), "01:02:00:00");
  });

  it("picks presentation mode from configured fields", () => {
    assert.equal(
      announcementPresentationMode({ ctaLabel: null, imageUrl: null, countdownEnabled: false }),
      "plain",
    );
    assert.equal(
      announcementPresentationMode({ ctaLabel: "Order Now", imageUrl: null, countdownEnabled: false }),
      "cta",
    );
    assert.equal(
      announcementPresentationMode({
        ctaLabel: "Order Now",
        imageUrl: "https://cdn.example/a.jpg",
        countdownEnabled: true,
      }),
      "full",
    );
  });

  it("rejects countdown when end is not after start", () => {
    const parsed = parseCustomerAnnouncementFields({
      title: "Weekend cravings?",
      body: "Get ₹150 OFF on orders above ₹499.",
      countdown_enabled: true,
      starts_at: "2026-09-04T07:30:00.000Z",
      ends_at: "2026-09-04T07:30:00.000Z",
    });
    assert.equal(parsed.ok, false);
  });

  it("rejects CTA without a tap destination", () => {
    const parsed = parseCustomerAnnouncementFields({
      title: "Weekend cravings?",
      body: "Get ₹150 OFF.",
      cta_label: "Order Now",
      target_type: "NONE",
    });
    assert.equal(parsed.ok, false);
  });

  it("accepts a valid CTA + countdown campaign", () => {
    const parsed = parseCustomerAnnouncementFields({
      title: "Janmashtami deserves a feast!",
      body: "Celebrate with your favourites and get ₹150 OFF on orders above ₹499.",
      cta_label: "Order Now",
      target_type: "STORE",
      countdown_enabled: true,
      starts_at: "2026-09-04T07:30:00.000Z",
      ends_at: "2026-09-04T12:30:00.000Z",
      image_url: "https://cdn.example/campaign.jpg",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.fields.ctaLabel, "Order Now");
      assert.equal(parsed.fields.countdownEnabled, true);
    }
  });

  it("uses server now for remaining time, not a later device clock", () => {
    const ends = new Date("2026-09-04T12:30:00.000Z");
    const serverNow = new Date("2026-09-04T10:01:02.000Z");
    const remaining = remainingMsUntil(ends, serverNow);
    assert.equal(formatRemainingHms(remaining), "02:28:58");
    const spoofedDevice = new Date("2026-09-04T08:00:00.000Z");
    assert.ok(remainingMsUntil(ends, spoofedDevice) > remaining);
  });

  it("marks countdown campaigns expired at ends_at", () => {
    const starts = new Date("2026-09-04T07:30:00.000Z");
    const ends = new Date("2026-09-04T12:30:00.000Z");
    assert.equal(
      campaignValidity({
        countdownEnabled: true,
        startsAt: starts,
        endsAt: ends,
        now: new Date("2026-09-04T12:30:00.000Z"),
      }),
      "expired",
    );
    assert.equal(
      campaignValidity({
        countdownEnabled: false,
        startsAt: starts,
        endsAt: ends,
        now: new Date("2026-09-04T13:00:00.000Z"),
      }),
      "open",
    );
  });
});
