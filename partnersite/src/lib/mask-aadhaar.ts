/**
 * Aadhaar masking helpers — store/display only last 4 digits.
 * Canonical form: XXXX-XXXX-1234
 */

export function digitsOnlyAadhaar(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function isMaskedAadhaar(value: string | null | undefined): boolean {
  const s = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return false;
  if (/^XXXX-XXXX-\d{4}$/.test(s)) return true;
  if (/^X{8}\d{4}$/.test(s.replace(/-/g, ""))) return true;
  return /X{4,}/.test(s) && /\d{4}$/.test(s.replace(/-/g, ""));
}

/** Mask full 12-digit Aadhaar (or already-partial) as XXXX-XXXX-1234. */
export function maskAadhaarNumber(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isMaskedAadhaar(raw)) {
    const last4 = digitsOnlyAadhaar(raw).slice(-4);
    return last4.length === 4 ? `XXXX-XXXX-${last4}` : raw.toUpperCase();
  }
  const digits = digitsOnlyAadhaar(raw);
  if (digits.length >= 4) {
    return `XXXX-XXXX-${digits.slice(-4)}`;
  }
  return raw;
}

function unwrapAadhaarDetails(
  details?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!details || typeof details !== "object") return {};
  const nestedCandidates = [
    details.aadhaar,
    details.document,
    details.data,
    details.verified_data,
    (details.document as Record<string, unknown> | undefined)?.aadhaar,
  ];
  for (const c of nestedCandidates) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      return { ...details, ...(c as Record<string, unknown>) };
    }
  }
  return details;
}

/** Format DigiLocker verified payload into display rows + masked Aadhaar. */
export function normalizeAadhaarVerifiedDetails(
  details?: Record<string, unknown> | null,
): {
  rows: Array<[string, string]>;
  maskedAadhaar: string;
  name: string;
} {
  const d = unwrapAadhaarDetails(details);
  if (!Object.keys(d).length) {
    return { rows: [], maskedAadhaar: "", name: "" };
  }
  const name = String(
    d.name ||
      d.full_name ||
      d.aadhaar_name ||
      d.holder_name ||
      d.registered_name ||
      "",
  ).trim();
  const dob = String(d.dob || d.date_of_birth || "").trim();
  const gender = String(d.gender || "").trim();
  const careOf = String(d.care_of || d.careof || d.co || "").trim();
  const yob = d.year_of_birth != null ? String(d.year_of_birth).trim() : "";

  let address = "";
  const addrRaw = d.address ?? d.split_address;
  if (typeof addrRaw === "string") {
    address = addrRaw.trim();
  } else if (addrRaw && typeof addrRaw === "object" && !Array.isArray(addrRaw)) {
    const a = addrRaw as Record<string, unknown>;
    address = [
      a.house,
      a.street,
      a.landmark,
      a.locality,
      a.vtc ?? a.city ?? a.village_or_city,
      a.subdist,
      a.dist ?? a.district,
      a.state,
      a.country,
      a.pincode ?? a.pin ?? a.po,
      a.post_office,
    ]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  const uid = String(
    d.aadhaar_number || d.masked_aadhaar || d.uid || d.aadhaar || "",
  ).trim();
  const maskedAadhaar = maskAadhaarNumber(uid);

  const rows: Array<[string, string]> = [];
  if (name) rows.push(["Name", name]);
  if (dob) rows.push(["Date of birth", dob]);
  else if (yob) rows.push(["Year of birth", yob]);
  if (gender) {
    const g = gender.toUpperCase();
    rows.push([
      "Gender",
      g === "M" ? "Male" : g === "F" ? "Female" : g === "T" ? "Transgender" : gender,
    ]);
  }
  if (careOf) rows.push(["Care of", careOf]);
  if (maskedAadhaar) rows.push(["Aadhaar", maskedAadhaar]);
  if (address) rows.push(["Address", address]);
  return { rows, maskedAadhaar, name };
}
