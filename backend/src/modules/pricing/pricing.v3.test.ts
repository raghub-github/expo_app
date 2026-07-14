import { describe, expect, it } from "vitest";
import {
  resolveLifecycleOnPublish,
  resolveLifecycleOnDraft,
  lifecycleEligibleForPricing,
} from "./offer-lifecycle.js";
import { estimateMerchantOfferDiscountOnLine } from "./offer-discount-estimator.js";
import type { MerchantOfferRow } from "../billing/types.js";

describe("offer-lifecycle", () => {
  it("draft is not pricing-eligible", () => {
    expect(lifecycleEligibleForPricing("DRAFT")).toBe(false);
    expect(lifecycleEligibleForPricing("ACTIVE")).toBe(true);
  });

  it("publish before start date yields SCHEDULED", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const from = new Date("2026-07-15T00:00:00Z");
    const till = new Date("2026-07-30T00:00:00Z");
    const r = resolveLifecycleOnPublish(from, till, now);
    expect(r.lifecycleStatus).toBe("SCHEDULED");
    expect(r.isActive).toBe(true);
  });

  it("draft sets inactive", () => {
    const r = resolveLifecycleOnDraft();
    expect(r.lifecycleStatus).toBe("DRAFT");
    expect(r.isActive).toBe(false);
  });
});

describe("offer-discount-estimator", () => {
  const baseOffer: MerchantOfferRow = {
    id: 1,
    offerId: "OFF-1",
    title: "10% off",
    offerType: "PERCENTAGE",
    offerSubType: null,
    discountValue: null,
    discountPercentage: 10,
    maxDiscountAmount: null,
    minOrderAmount: null,
    maxOrderAmount: null,
    buyQuantity: null,
    getQuantity: null,
    couponCode: null,
    autoApply: true,
    isStackable: false,
    perOrderLimit: 1,
    firstOrderOnly: false,
    newUserOnly: false,
    maxUsesTotal: null,
    maxUsesPerUser: null,
    currentUses: 0,
    applicableOnDays: null,
    applicableTimeStart: null,
    applicableTimeEnd: null,
    maxDiscountPerOrder: null,
    metadata: {},
    displayPriority: 0,
    priority: 0,
    createdSourcePlatform: "MERCHANT_PORTAL",
    createdByRole: "MERCHANT",
    approvalStatus: "AUTO_APPROVED",
  };

  it("applies percentage on line total", () => {
    const d = estimateMerchantOfferDiscountOnLine(baseOffer, 200, 42);
    expect(d).toBe(20);
  });
});
