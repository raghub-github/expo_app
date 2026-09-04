import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAnnouncementDeepLink,
  isAllowedGatimitraDeepLink,
} from "../../lib/customer-home-services.js";

describe("announcement target routing", () => {
  it("keeps legacy NONE as inbox", () => {
    const r = buildAnnouncementDeepLink({ targetType: "NONE" });
    assert.equal(r.target_type, "NONE");
    assert.equal(r.deepLink, "/notifications");
  });

  it("maps PRD service aliases onto existing home routes", () => {
    assert.equal(buildAnnouncementDeepLink({ targetType: "HOME" }).deepLink, "/home");
    assert.equal(buildAnnouncementDeepLink({ targetType: "FOOD_HOME" }).deepLink, "/home");
    assert.equal(
      buildAnnouncementDeepLink({ targetType: "GROCERY_HOME" }).deepLink,
      "/home/grocery",
    );
    assert.equal(
      buildAnnouncementDeepLink({ targetType: "RIDES" }).deepLink,
      "/home/service/ride",
    );
    assert.equal(
      buildAnnouncementDeepLink({ targetType: "PARCEL" }).deepLink,
      "/home/service/parcels",
    );
    assert.equal(buildAnnouncementDeepLink({ targetType: "OFFER" }).deepLink, "/offers");
    assert.equal(
      buildAnnouncementDeepLink({ targetType: "GMITRA_PLUS" }).deepLink,
      "/profile/subscription",
    );
  });

  it("rejects disallowed custom deep links", () => {
    assert.equal(isAllowedGatimitraDeepLink("https://evil.example"), false);
    assert.equal(isAllowedGatimitraDeepLink("javascript:alert(1)"), false);
    assert.equal(isAllowedGatimitraDeepLink("/admin"), false);
    assert.equal(isAllowedGatimitraDeepLink("/home/merchant/GMMC1"), true);
    assert.throws(() =>
      buildAnnouncementDeepLink({
        targetType: "CUSTOM_DEEP_LINK",
        customDeepLink: "https://evil.example",
      }),
    );
  });

  it("builds store and category links without exposing extra ids in the path beyond the public target", () => {
    const store = buildAnnouncementDeepLink({
      targetType: "STORE",
      serviceId: "food",
      storeId: "GMMC1025",
    });
    assert.equal(store.deepLink, "/home/merchant/GMMC1025");
    assert.equal(store.target_id, "GMMC1025");
  });
});
