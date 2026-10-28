import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audienceRoleForSend,
  expandCampaignUserIdCandidates,
  expectedRoleFromTarget,
  templateRoleMatchesTarget,
} from "./campaignTarget.js";

describe("campaignTarget audience isolation", () => {
  it("expands bare digits only for the requested app role", () => {
    assert.deepEqual(expandCampaignUserIdCandidates("386", "customer").sort(), [
      "386",
      "GM386",
    ]);
    assert.deepEqual(expandCampaignUserIdCandidates("386", "merchant").sort(), [
      "386",
      "GMMP386",
    ]);
    assert.deepEqual(expandCampaignUserIdCandidates("12", "rider").sort(), [
      "12",
      "GMR12",
      "usr_12",
    ]);
  });

  it("does not expand a GM id into merchant/rider ids", () => {
    const ids = expandCampaignUserIdCandidates("GM100386", "customer");
    assert.ok(ids.includes("GM100386"));
    assert.ok(!ids.some((id) => /^GMMP/i.test(id)));
    assert.ok(!ids.some((id) => /^GMR/i.test(id)));
  });

  it("maps all_customers / all_riders / all_merchants to a single role", () => {
    assert.equal(expectedRoleFromTarget({ all_customers: true }), "customer");
    assert.equal(expectedRoleFromTarget({ all_riders: true }), "rider");
    assert.equal(expectedRoleFromTarget({ all_merchants: true }), "merchant");
    assert.equal(expectedRoleFromTarget({ role: "customer" }), "customer");
    assert.equal(expectedRoleFromTarget({ topic: "app_customer" }), "customer");
    assert.equal(expectedRoleFromTarget({ topic: "app_rider" }), "rider");
  });

  it("treats city-without-role and custom topics as ambiguous", () => {
    assert.equal(expectedRoleFromTarget({ geo: true, city: "Panipat" }), null);
    assert.equal(expectedRoleFromTarget({ topic: "promo_blast" }), null);
    assert.equal(expectedRoleFromTarget({ all_active: true }), null);
  });

  it("rejects role-specific templates against ambiguous audiences", () => {
    assert.equal(templateRoleMatchesTarget("customer", null), false);
    assert.equal(templateRoleMatchesTarget("merchant", null), false);
    assert.equal(templateRoleMatchesTarget("rider", null), false);
    assert.equal(templateRoleMatchesTarget("customer", "merchant"), false);
    assert.equal(templateRoleMatchesTarget("customer", "customer"), true);
    assert.equal(templateRoleMatchesTarget("all", null), true);
  });

  it("audienceRoleForSend prefers explicit target role then template role", () => {
    assert.equal(
      audienceRoleForSend({ all_customers: true }, "customer"),
      "customer",
    );
    assert.equal(
      audienceRoleForSend({ geo: true, city: "X", role: "rider" }, "rider"),
      "rider",
    );
    // Ambiguous geo + customer template → fall back to template so send still filters tokens.
    assert.equal(audienceRoleForSend({ geo: true, city: "X" }, "customer"), "customer");
  });

  it("bare digit user_ids lists are ambiguous across apps", () => {
    assert.equal(expectedRoleFromTarget({ user_ids: ["386"] }), null);
    assert.equal(expectedRoleFromTarget({ user_ids: ["GM100386"] }), "customer");
    assert.equal(expectedRoleFromTarget({ user_ids: ["GMR12"] }), "rider");
    assert.equal(expectedRoleFromTarget({ user_ids: ["GMMP1"] }), "merchant");
  });
});
