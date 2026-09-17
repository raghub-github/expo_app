import assert from "node:assert/strict";
import { formatDashboardEligibilityStatus } from "./dashboard-eligibility-status";

assert.equal(
  formatDashboardEligibilityStatus({
    blocking: [{ code: "SERVICE_DISABLED", reason: "Oops! This service isn't available in your area yet." }],
  }),
  "Service not enable",
);

assert.equal(
  formatDashboardEligibilityStatus({
    blocking: [{ code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "Person Ride isn't available — commercial vehicles are required." }],
  }),
  "Non comercial vehicle",
);

assert.equal(
  formatDashboardEligibilityStatus({
    blocking: [{ code: "DL_REQUIRED_NOT_VERIFIED", reason: "Driving License is required and not verified." }],
    missingDocuments: ["DRIVING_LICENSE"],
  }),
  "Doc Not provided",
);

assert.equal(
  formatDashboardEligibilityStatus({
    blocking: [{ code: "NAME_MISMATCH", reason: "Name on DL does not match rider profile." }],
  }),
  "Docs missmatched",
);

assert.equal(
  formatDashboardEligibilityStatus({
    blocking: [
      { code: "RC_REQUIRED_NOT_VERIFIED", reason: "RC required" },
      { code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "Need commercial" },
    ],
  }),
  "Non comercial vehicle",
);

console.log("dashboard-eligibility-status: ok");
