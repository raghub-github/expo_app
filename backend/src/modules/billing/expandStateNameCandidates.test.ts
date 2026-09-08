import assert from "node:assert/strict";
import test from "node:test";
import { expandStateNameCandidates } from "./geoRefFromPincode.ts";

test("expandStateNameCandidates: RTO code HR → Haryana family", () => {
  const c = expandStateNameCandidates("HR");
  assert.ok(c.includes("Haryana"));
  assert.ok(c.includes("HR"));
});

test("expandStateNameCandidates: full name is preserved with variants", () => {
  const c = expandStateNameCandidates("haryana");
  assert.ok(c.some((x) => x.toLowerCase() === "haryana"));
  assert.ok(c.includes("HR"));
});

test("expandStateNameCandidates: unknown input returns itself", () => {
  assert.deepEqual(expandStateNameCandidates("Narnia"), ["Narnia"]);
});

test("expandStateNameCandidates: blank → empty", () => {
  assert.deepEqual(expandStateNameCandidates(""), []);
  assert.deepEqual(expandStateNameCandidates("—"), []);
});
