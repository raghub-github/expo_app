import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FALLBACK_ONBOARDING_DOCUMENT_TYPES,
  formatVehicleDocsInfoMessage,
  formatVehicleRequiredDocsHint,
  filterSkippedDocsForVehicle,
  isDocSkipped,
  isDocStepSatisfied,
  resolveVehicleOnboardingDocs,
  vehicleOnboardingWizardStepNumber,
  vehicleOnboardingWizardStepTotal,
} from "./onboarding-document-types";
import type { OnboardingVehicleType } from "./onboarding-vehicle-types";
import type { OnboardingData } from "../stores/onboardingStore";

function vehicle(
  partial: Partial<OnboardingVehicleType> & Pick<OnboardingVehicleType, "code" | "onboardingFlow">
): OnboardingVehicleType {
  return {
    id: 1,
    categoryCode: "2_wheeler",
    label: partial.label ?? partial.code,
    hint: partial.hint ?? null,
    icon: null,
    sortOrder: 1,
    isActive: true,
    documentRequirements: partial.documentRequirements ?? {},
    infoMessage: null,
    mapsToVehicleType: partial.code,
    ...partial,
  };
}

describe("formatVehicleRequiredDocsHint", () => {
  it("lists required DL & RC", () => {
    const hint = formatVehicleRequiredDocsHint(
      vehicle({
        code: "bike",
        onboardingFlow: "dl_rc",
        documentRequirements: { required_docs: ["dl", "rc"] },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES
    );
    assert.equal(hint, "Required: DL & RC");
  });

  it("joins optional docs with & on the card (no Optional label)", () => {
    const hint = formatVehicleRequiredDocsHint(
      vehicle({
        code: "ev_bike",
        onboardingFlow: "rental_ev",
        hint: "stale DL hint should be ignored",
        documentRequirements: {
          required_docs: ["rental_proof", "ev_proof"],
          optional_docs: ["rc"],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES
    );
    assert.equal(hint, "Required: Rental proof & EV proof & RC");
  });
});

describe("formatVehicleDocsInfoMessage", () => {
  it("lists all docs without skip/optional wording", () => {
    const msg = formatVehicleDocsInfoMessage(
      vehicle({
        code: "ev_bike",
        onboardingFlow: "rental_ev",
        documentRequirements: {
          required_docs: ["rental_proof", "ev_proof"],
          optional_docs: ["rc"],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES
    );
    assert.equal(
      msg,
      "Upload Rental proof & EV proof & RC (photo or PDF, max 5 MB)."
    );
    assert.doesNotMatch(String(msg), /optional/i);
    assert.doesNotMatch(String(msg), /skip/i);
  });
});

describe("filterSkippedDocsForVehicle", () => {
  it("drops previously skipped docs that are mandatory on the new vehicle", () => {
    const evCarDocs = resolveVehicleOnboardingDocs(
      vehicle({
        code: "ev_car",
        onboardingFlow: "rental_ev",
        documentRequirements: {
          required_docs: ["rc", "rental_proof", "ev_proof", "dl"],
          optional_docs: [],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES
    );
    const filtered = filterSkippedDocsForVehicle(evCarDocs, ["rc", "dl"]);
    assert.equal(filtered, undefined);
  });

  it("keeps geo/soft-allowlisted skips even when catalog marks them required", () => {
    const docs = resolveVehicleOnboardingDocs(
      vehicle({
        code: "bike",
        onboardingFlow: "dl_rc",
        documentRequirements: {
          required_docs: ["dl", "rc"],
          optional_docs: [],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES,
      { captureGroup: "dl_rc" },
    );
    const filtered = filterSkippedDocsForVehicle(docs, ["dl"], {
      alsoKeep: ["dl"],
    });
    assert.deepEqual(filtered, ["dl"]);
  });

  it("keeps only optional skips for the current vehicle catalog", () => {
    const evBikeDocs = resolveVehicleOnboardingDocs(
      vehicle({
        code: "ev_bike",
        onboardingFlow: "rental_ev",
        documentRequirements: {
          required_docs: ["rental_proof", "ev_proof"],
          optional_docs: ["rc"],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES,
      { captureGroup: "dl_rc" },
    );
    const filtered = filterSkippedDocsForVehicle(evBikeDocs, ["rc", "dl"]);
    assert.deepEqual(filtered, ["rc"]);
  });
});

describe("resolveVehicleOnboardingDocs", () => {
  it("returns required docs plus optional docs (marked optional)", () => {
    const docs = resolveVehicleOnboardingDocs(
      vehicle({
        code: "ev_bike",
        onboardingFlow: "rental_ev",
        documentRequirements: {
          required_docs: ["rental_proof", "ev_proof"],
          optional_docs: ["dl", "rc"],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES
    );
    assert.deepEqual(
      docs.map((d) => d.code),
      ["rental_proof", "ev_proof", "dl", "rc"]
    );
    assert.equal(docs.find((d) => d.code === "rc")?.optional, true);
    assert.equal(docs.find((d) => d.code === "rental_proof")?.optional, false);
  });

  it("filters by captureGroup so dl-rc screen never asks rental docs", () => {
    const docs = resolveVehicleOnboardingDocs(
      vehicle({
        code: "ev_bike",
        onboardingFlow: "rental_ev",
        documentRequirements: {
          required_docs: ["rental_proof", "ev_proof"],
          optional_docs: ["rc"],
        },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES,
      { captureGroup: "dl_rc" }
    );
    assert.deepEqual(docs.map((d) => d.code), ["rc"]);
    assert.equal(docs[0]?.optional, true);
  });

  it("returns only dl_rc group docs for petrol bike", () => {
    const docs = resolveVehicleOnboardingDocs(
      vehicle({
        code: "bike",
        onboardingFlow: "dl_rc",
        documentRequirements: { required_docs: ["dl", "rc"] },
      }),
      FALLBACK_ONBOARDING_DOCUMENT_TYPES,
      { captureGroup: "dl_rc" }
    );
    assert.deepEqual(
      docs.map((d) => d.code),
      ["dl", "rc"]
    );
  });
});

describe("vehicle onboarding wizard step numbers", () => {
  it("counts category, vehicle, and every configured doc", () => {
    const v = vehicle({
      code: "ev_bike",
      onboardingFlow: "rental_ev",
      documentRequirements: {
        required_docs: ["rental_proof", "ev_proof"],
        optional_docs: ["rc"],
      },
    });
    assert.equal(
      vehicleOnboardingWizardStepTotal(v, FALLBACK_ONBOARDING_DOCUMENT_TYPES),
      5,
    );
    assert.deepEqual(
      vehicleOnboardingWizardStepNumber(
        "doc",
        "rc",
        v,
        FALLBACK_ONBOARDING_DOCUMENT_TYPES,
      ),
      { current: 3, total: 5 },
    );
    assert.deepEqual(
      vehicleOnboardingWizardStepNumber(
        "doc",
        "rental_proof",
        v,
        FALLBACK_ONBOARDING_DOCUMENT_TYPES,
      ),
      { current: 4, total: 5 },
    );
  });
});

describe("isDocStepSatisfied", () => {
  const dlDoc = FALLBACK_ONBOARDING_DOCUMENT_TYPES.find((d) => d.code === "dl")!;

  it("honors skip only when the doc is optional for the current vehicle", () => {
    const data = { skippedOnboardingDocs: ["dl"] } as OnboardingData;
    assert.equal(isDocStepSatisfied(data, dlDoc, true), true);
    assert.equal(isDocStepSatisfied(data, dlDoc, false), false);
  });

  it("matches skipped codes across naming variants", () => {
    const data = {
      skippedOnboardingDocs: ["DRIVING_LICENSE"],
    } as OnboardingData;
    assert.equal(isDocSkipped(data, "dl"), true);
    assert.equal(isDocSkipped(data, "rc"), false);
    assert.equal(
      isDocSkipped({ skippedOnboardingDocs: ["dl"] } as OnboardingData, "dl", [
        "bank_account",
      ]),
      true,
    );
  });
});
