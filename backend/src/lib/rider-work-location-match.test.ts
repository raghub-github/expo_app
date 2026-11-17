import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalPlaceName,
  decideWorkLocationMatch,
  resolveDistrictIdByName,
  type WorkLocationSide,
} from "./rider-work-location-match.js";

const WB = "33ba2266-0680-447d-9135-a24f5287a5b4";
const JK = "65bfef22-01cc-4730-9939-b43adeac435e";
const PASCHIM_MEDINIPUR = "d-pm";
const NORTH_24 = "d-n24";
const SOUTH_24 = "d-s24";
const KOLKATA = "d-kol";

const WB_DISTRICTS = [
  { id: PASCHIM_MEDINIPUR, name: "PASCHIM MEDINIPUR" },
  { id: NORTH_24, name: "NORTH 24 PARGANAS" },
  { id: SOUTH_24, name: "SOUTH 24 PARGANAS" },
  { id: KOLKATA, name: "KOLKATA" },
];

const side = (o: Partial<WorkLocationSide>): WorkLocationSide => ({
  stateId: null,
  state: null,
  districtId: null,
  district: null,
  ...o,
});

describe("canonicalPlaceName", () => {
  it("drops case, punctuation, accents and the district suffix", () => {
    assert.equal(canonicalPlaceName("  Paschim  Medinipur District "), "paschim medinipur");
    assert.equal(canonicalPlaceName("North 24-Parganas (Dist.)"), "north 24 parganas");
    assert.equal(canonicalPlaceName("Jammu & Kashmir"), "jammu and kashmir");
    assert.equal(canonicalPlaceName(null), "");
  });
});

describe("resolveDistrictIdByName", () => {
  it("resolves a real district name exactly (any casing / suffix)", () => {
    assert.equal(resolveDistrictIdByName("Paschim Medinipur district", WB_DISTRICTS), PASCHIM_MEDINIPUR);
    assert.equal(resolveDistrictIdByName("north 24 parganas", WB_DISTRICTS), NORTH_24);
  });
  it("a town / block / alias is UNKNOWN (null), never a fuzzy guess", () => {
    assert.equal(resolveDistrictIdByName("Dantan", WB_DISTRICTS), null);
    assert.equal(resolveDistrictIdByName("West Midnapore", WB_DISTRICTS), null);
    assert.equal(resolveDistrictIdByName("24 Parganas", WB_DISTRICTS), null, "no substring match");
    assert.equal(resolveDistrictIdByName("", WB_DISTRICTS), null);
  });
  it("ambiguous names resolve to null", () => {
    assert.equal(
      resolveDistrictIdByName("Kolkata", [...WB_DISTRICTS, { id: "dup", name: "Kolkata District" }]),
      null
    );
  });
});

describe("decideWorkLocationMatch", () => {
  const detectedKolkata = side({ stateId: WB, state: "WEST BENGAL", districtId: NORTH_24, district: "NORTH 24 PARGANAS" });

  it("GMR1022 case: unknown working district ('Dantan') + same state → allowed (state level)", () => {
    const d = decideWorkLocationMatch(
      side({ stateId: WB, state: "WEST BENGAL", districtId: null, district: "Dantan" }),
      detectedKolkata
    );
    assert.deepEqual(d, { mismatch: false, level: "state" });
  });

  it("GMR1022 in its own town is still allowed (state level)", () => {
    const d = decideWorkLocationMatch(
      side({ stateId: WB, state: "WEST BENGAL", districtId: null, district: "Dantan" }),
      side({ stateId: WB, state: "WEST BENGAL", districtId: PASCHIM_MEDINIPUR, district: "PASCHIM MEDINIPUR" })
    );
    assert.equal(d.mismatch, false);
  });

  it("different state is always a mismatch", () => {
    const d = decideWorkLocationMatch(
      side({ stateId: WB, state: "WEST BENGAL", districtId: PASCHIM_MEDINIPUR }),
      side({ stateId: JK, state: "JAMMU AND KASHMIR", districtId: "d-jammu", district: "JAMMU" })
    );
    assert.deepEqual(d, { mismatch: true, level: "state", reason: "state_mismatch" });
  });

  it("known working district: same id → match, other id → district mismatch", () => {
    const working = side({ stateId: WB, state: "WEST BENGAL", districtId: NORTH_24, district: "North 24 Parganas" });
    assert.deepEqual(decideWorkLocationMatch(working, detectedKolkata), { mismatch: false, level: "district" });
    const d = decideWorkLocationMatch(
      working,
      side({ stateId: WB, state: "WEST BENGAL", districtId: SOUTH_24, district: "SOUTH 24 PARGANAS" })
    );
    assert.deepEqual(d, { mismatch: true, level: "district", reason: "district_mismatch" });
  });

  it("names compare exactly: North 24 Parganas never matches South 24 Parganas", () => {
    const d = decideWorkLocationMatch(
      side({ state: "West Bengal", districtId: NORTH_24, district: "North 24 Parganas" }),
      side({ state: "WEST BENGAL", district: "SOUTH 24 PARGANAS" })
    );
    assert.equal(d.mismatch, true);
  });

  it("state compared by canonical name when an id is missing", () => {
    const d = decideWorkLocationMatch(
      side({ state: "west bengal" }),
      side({ stateId: WB, state: "WEST BENGAL" })
    );
    assert.deepEqual(d, { mismatch: false, level: "state" });
  });

  it("GPS with no district resolved → state level only", () => {
    const d = decideWorkLocationMatch(
      side({ stateId: WB, state: "WEST BENGAL", districtId: NORTH_24 }),
      side({ stateId: WB, state: "WEST BENGAL" })
    );
    assert.deepEqual(d, { mismatch: false, level: "state" });
  });

  it("no saved working location, or GPS outside the hierarchy → nothing to compare", () => {
    assert.deepEqual(decideWorkLocationMatch(side({}), detectedKolkata), { mismatch: false, level: "unknown" });
    assert.deepEqual(decideWorkLocationMatch(side({ stateId: WB }), side({})), { mismatch: false, level: "unknown" });
  });
});
