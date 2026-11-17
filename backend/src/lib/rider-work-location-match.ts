/**
 * Pure decision: is the rider's current GPS inside their saved WORKING location?
 *
 * Used by the duty-ON gate (PUT /v1/rider/duty and /duty/precheck). Rules:
 *
 *  1. State must match — by id when both sides have one, else by canonical name.
 *  2. District is compared ONLY when the working district is a KNOWN district
 *     (a districts.id: stored on the rider, or resolved from the saved name).
 *     A free-text district that is not a real district ("Dantan" is a town in
 *     Paschim Medinipur; "West Midnapore" is an old alias) only ever matched
 *     where the geocoder happened to return that same name, so the rider was
 *     locked out of the rest of their state (GMR1022: blocked in Kolkata). An
 *     unknown working district therefore cannot prove a mismatch: the check
 *     falls back to the state.
 *  3. Names are compared EXACTLY after canonicalisation. The old two-way
 *     `includes()` let "24 Parganas" match both North and South 24 Parganas.
 */

/** Lowercase, accent-free, punctuation-free, "district"/"dist" suffix dropped. */
export function canonicalPlaceName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(district|dist|distt)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a ?? "").trim().toLowerCase();
  const y = String(b ?? "").trim().toLowerCase();
  return x !== "" && x === y;
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = canonicalPlaceName(a);
  return x !== "" && x === canonicalPlaceName(b);
}

export type WorkLocationSide = {
  stateId: string | null;
  state: string | null;
  districtId: string | null;
  district: string | null;
};

export type WorkLocationDecision =
  | { mismatch: false; level: "state" | "district" | "unknown" }
  | { mismatch: true; level: "state" | "district"; reason: "state_mismatch" | "district_mismatch" };

/**
 * `working.districtId` must already be the KNOWN district id (stored, or
 * resolved from the saved name) — null means the working district is unknown.
 */
export function decideWorkLocationMatch(
  working: WorkLocationSide,
  detected: WorkLocationSide
): WorkLocationDecision {
  const workingHasState = Boolean(working.stateId || working.state);
  const detectedHasState = Boolean(detected.stateId || detected.state);
  // Nothing to compare against (no saved location, or GPS outside the hierarchy).
  if (!workingHasState || !detectedHasState) return { mismatch: false, level: "unknown" };

  const stateMatches =
    working.stateId && detected.stateId
      ? sameId(working.stateId, detected.stateId)
      : sameName(working.state, detected.state);
  if (!stateMatches) return { mismatch: true, level: "state", reason: "state_mismatch" };

  // Unknown working district cannot prove a mismatch — the state already matched.
  if (!working.districtId) return { mismatch: false, level: "state" };
  // GPS resolved no district — nothing finer to compare.
  if (!detected.districtId && !detected.district) return { mismatch: false, level: "state" };

  const districtMatches = detected.districtId
    ? sameId(working.districtId, detected.districtId)
    : sameName(working.district, detected.district);
  return districtMatches
    ? { mismatch: false, level: "district" }
    : { mismatch: true, level: "district", reason: "district_mismatch" };
}

/**
 * Resolve a saved district NAME to a districts.id among that state's districts.
 * Exact canonical match only; ambiguous (two districts canonicalise the same) or
 * absent → null (unknown).
 */
export function resolveDistrictIdByName(
  name: string | null | undefined,
  stateDistricts: ReadonlyArray<{ id: string; name: string }>
): string | null {
  const key = canonicalPlaceName(name);
  if (!key) return null;
  let found: string | null = null;
  for (const d of stateDistricts) {
    if (canonicalPlaceName(d.name) !== key) continue;
    if (found && found !== d.id) return null; // ambiguous — never guess
    found = d.id;
  }
  return found;
}
