/**
 * Client-side working-location vs GPS compare (mirrors backend compareDutyWorkLocation).
 * Used for Duty ON precheck so the mismatch sheet opens before PUT /duty.
 */

export type DutyWorkLocationPlace = {
  state?: string | null;
  district?: string | null;
  region?: string | null;
  stateId?: string | null;
  regionId?: string | null;
  districtId?: string | null;
  lat?: number | null;
  lon?: number | null;
};

function norm(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  return Boolean(x && y && x === y);
}

function namesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function compareWorkingLocationToDetected(args: {
  working: DutyWorkLocationPlace | null | undefined;
  detected: DutyWorkLocationPlace;
}): { mismatch: boolean; working: DutyWorkLocationPlace; detected: DutyWorkLocationPlace } {
  const working: DutyWorkLocationPlace = {
    state: String(args.working?.state || "").trim() || null,
    district: String(args.working?.district || "").trim() || null,
    region: String(args.working?.region || "").trim() || null,
    stateId: args.working?.stateId ?? null,
    regionId: args.working?.regionId ?? null,
    districtId: args.working?.districtId ?? null,
  };
  const detected = args.detected;

  if (!working.state && !working.stateId) {
    return { mismatch: false, working, detected };
  }
  if (!detected.stateId && !detected.state) {
    return { mismatch: false, working, detected };
  }

  const stateMatches =
    idsEqual(working.stateId, detected.stateId) || namesEqual(working.state, detected.state);
  if (!stateMatches) {
    return { mismatch: true, working, detected };
  }

  const bothHaveDistrict =
    Boolean(working.districtId || working.district) &&
    Boolean(detected.districtId || detected.district);
  if (bothHaveDistrict) {
    const districtMatches =
      idsEqual(working.districtId, detected.districtId) ||
      namesEqual(working.district, detected.district);
    if (!districtMatches) {
      return { mismatch: true, working, detected };
    }
  }

  return { mismatch: false, working, detected };
}

export function formatWorkLocationLine(p: DutyWorkLocationPlace | null | undefined): string {
  if (!p) return "—";
  const parts = [p.district, p.state].map((x) => String(x || "").trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}
