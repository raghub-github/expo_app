import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedServiceSlogan } from "./blocked-service-slogan";

describe("blockedServiceSlogan message priority", () => {
  it("prefers document reason over geo when both are present", () => {
    assert.equal(
      blockedServiceSlogan({
        service: "parcel",
        missingDocuments: ["DRIVING_LICENSE"],
        reasons: [
          "Oops! This service isn’t available in your area yet.",
          "Driving Licence verification is required.",
        ],
      }),
      "Driving Licence verification is required.",
    );
  });

  it("shows geo only when documents are not blocking", () => {
    assert.equal(
      blockedServiceSlogan({
        service: "parcel",
        missingDocuments: [],
        reasons: ["Oops! This service isn’t available in your area yet."],
      }),
      "Oops! This service isn’t available in your area yet.",
    );
  });

  it("builds unlock copy from missingDocuments when no doc reason text exists", () => {
    assert.equal(
      blockedServiceSlogan({
        service: "person_ride",
        missingDocuments: ["DRIVING_LICENSE"],
        reasons: ["Oops! This service isn’t available in your area yet."],
      }),
      "Person Ride needs Driving Licence to unlock.",
    );
  });
});
