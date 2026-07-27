/**
 * Cross-document match against verified Aadhaar identity (primary source).
 * Used after Cashfree auto-verify of identity docs (PAN / DL) and bank holder name.
 *
 * Vehicle RC is NOT identity — owner may differ from the rider (family / fleet /
 * rental). Do not compare RC owner name/DOB to Aadhaar.
 */

const NAME_MATCH_THRESHOLD = 0.55;

export type AadhaarIdentityRef = {
  name: string;
  dob: string | null; // YYYY-MM-DD when available
  aadhaarMasked?: string | null;
};

export type CrossMatchReasonCode =
  | "name_mismatch"
  | "dob_mismatch"
  | "aadhaar_identity_missing";

export type CrossMatchResult = {
  ok: boolean;
  reasons: CrossMatchReasonCode[];
  messages: string[];
  aadhaar: AadhaarIdentityRef;
  extracted: {
    name?: string | null;
    dob?: string | null;
  };
};

export function normalizePersonName(name: string | null | undefined): string {
  if (name == null || typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function tokenize(name: string): string[] {
  return normalizePersonName(name)
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Jaccard word overlap in [0, 1]. */
export function nameOverlapScore(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokenize(String(a || ""));
  const tb = tokenize(String(b || ""));
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const intersection = ta.filter((t) => setB.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? intersection / union : 0;
}

export function namesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold = NAME_MATCH_THRESHOLD,
): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return nameOverlapScore(na, nb) >= threshold;
}

/** Normalize many DOB shapes to YYYY-MM-DD or null. */
export function normalizeDobIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function dobsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = normalizeDobIso(a);
  const db = normalizeDobIso(b);
  if (!da || !db) return false;
  return da === db;
}

export function reasonMessage(code: CrossMatchReasonCode): string {
  switch (code) {
    case "name_mismatch":
      return "Name does not match Aadhaar";
    case "dob_mismatch":
      return "Date of Birth does not match Aadhaar";
    case "aadhaar_identity_missing":
      return "Complete Aadhaar verification first — it is required for cross-checks";
    default:
      return "Auto verification failed – data mismatch";
  }
}

function pickName(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  return String(
    data.registered_name ??
      data.name ??
      data.holder_name ??
      data.owner_name ??
      data.owner ??
      data.full_name ??
      data.beneficiary_name ??
      "",
  ).trim();
}

function pickDob(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  return String(data.dob ?? data.date_of_birth ?? data.dateOfBirth ?? "").trim();
}

/**
 * Compare provider-extracted fields for a doc kind against Aadhaar identity.
 * - PAN / DL: name + DOB (identity documents)
 * - bank: account holder name only
 * - RC: skipped — vehicle ownership, not rider identity
 */
export function crossCheckAgainstAadhaar(args: {
  docKind: "pan" | "driving_licence" | "vehicle_rc" | "bank";
  aadhaar: AadhaarIdentityRef;
  verifiedData?: Record<string, unknown> | null;
  /** Explicit extracted overrides (e.g. bank holder from form). */
  extractedName?: string | null;
  extractedDob?: string | null;
}): CrossMatchResult {
  const aadhaarName = String(args.aadhaar.name || "").trim();
  const aadhaarDob = normalizeDobIso(args.aadhaar.dob);
  const extractedName = String(args.extractedName ?? pickName(args.verifiedData) ?? "").trim();
  const extractedDob = normalizeDobIso(args.extractedDob ?? pickDob(args.verifiedData));

  // Permanent policy: RC verifies the vehicle, not the rider's identity.
  // Still return extracted owner fields for storage / future NOC / fleet flows.
  if (args.docKind === "vehicle_rc") {
    return {
      ok: true,
      reasons: [],
      messages: [],
      aadhaar: {
        name: aadhaarName,
        dob: aadhaarDob,
        aadhaarMasked: args.aadhaar.aadhaarMasked ?? null,
      },
      extracted: { name: extractedName || null, dob: extractedDob },
    };
  }

  const reasons: CrossMatchReasonCode[] = [];

  if (aadhaarName.length < 2) {
    reasons.push("aadhaar_identity_missing");
    return {
      ok: false,
      reasons,
      messages: reasons.map(reasonMessage),
      aadhaar: args.aadhaar,
      extracted: { name: extractedName || null, dob: extractedDob },
    };
  }

  const needName =
    args.docKind === "pan" ||
    args.docKind === "driving_licence" ||
    args.docKind === "bank";
  const needDob = args.docKind === "pan" || args.docKind === "driving_licence";

  if (needName) {
    if (!extractedName || !namesMatch(aadhaarName, extractedName)) {
      reasons.push("name_mismatch");
    }
  }
  if (needDob) {
    // If provider omitted DOB, only fail when Aadhaar DOB exists and we expected a compare.
    if (aadhaarDob && extractedDob && !dobsMatch(aadhaarDob, extractedDob)) {
      reasons.push("dob_mismatch");
    } else if (aadhaarDob && !extractedDob && args.docKind === "pan") {
      // Cashfree PAN often has no DOB — don't fail solely on missing DOB for PAN.
    } else if (aadhaarDob && !extractedDob && args.docKind === "driving_licence") {
      // DL adapter usually returns dob; missing → soft fail to manual.
      reasons.push("dob_mismatch");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    messages: reasons.map(reasonMessage),
    aadhaar: {
      name: aadhaarName,
      dob: aadhaarDob,
      aadhaarMasked: args.aadhaar.aadhaarMasked ?? null,
    },
    extracted: { name: extractedName || null, dob: extractedDob },
  };
}
