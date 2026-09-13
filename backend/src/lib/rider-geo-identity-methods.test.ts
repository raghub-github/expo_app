import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  intersectIdentityMethods,
  methodsFromGlobalMode,
  pickIdentityGeoAnchor,
} from "./rider-geo-identity-methods.js";

describe("rider geo identity methods", () => {
  it("maps global modes to method availability", () => {
    assert.deepEqual(methodsFromGlobalMode("auto"), {
      digilocker: true,
      aadhaarMasking: true,
      manualUpload: false,
      mode: "auto",
    });
    assert.deepEqual(methodsFromGlobalMode("hybrid"), {
      digilocker: true,
      aadhaarMasking: true,
      manualUpload: true,
      mode: "hybrid",
    });
    assert.deepEqual(methodsFromGlobalMode("manual"), {
      digilocker: false,
      aadhaarMasking: false,
      manualUpload: true,
      mode: "manual",
    });
  });

  it("intersects geo flags with global methods", () => {
    const global = methodsFromGlobalMode("hybrid");
    const geo = { digilocker: true, aadhaarMasking: false, manualUpload: false };
    assert.deepEqual(intersectIdentityMethods(global, geo), {
      digilocker: true,
      aadhaarMasking: false,
      manualUpload: false,
    });
  });

  it("picks most specific geo anchor", () => {
    assert.deepEqual(
      pickIdentityGeoAnchor({
        stateId: "s1",
        regionId: "r1",
        districtId: "d1",
      }),
      { level: "district", refId: "d1" },
    );
    assert.deepEqual(
      pickIdentityGeoAnchor({ stateId: "s1", regionId: "r1" }),
      { level: "region", refId: "r1" },
    );
    assert.equal(pickIdentityGeoAnchor({}), null);
  });
});
