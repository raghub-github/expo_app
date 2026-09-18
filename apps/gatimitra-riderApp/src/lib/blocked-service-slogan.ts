/** Shared copy helpers for onboarding service eligibility cards. */

const SERVICE_LABEL: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

const DOC_LABEL: Record<string, string> = {
  DRIVING_LICENSE: "Driving Licence",
  REGISTRATION_CERTIFICATE: "Registration Certificate",
};

const human = (s: string) =>
  DOC_LABEL[s] ?? s.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Geo / area coverage copy — only show when docs are already OK for this service. */
export function isGeoAreaReasonText(text: string): boolean {
  return /not available in your area|isn[’']t available in your area|in your area yet|in your area right now/i.test(
    text,
  );
}

export function isDocReasonText(text: string): boolean {
  return /driving\s*licen[cs]e|\bDL\b|registration certificate|\bRC\b|document|verif|upload|pending review|rejected/i.test(
    text,
  );
}

/**
 * Per-service lock message priority:
 * 1) Document / verification gaps (missingDocuments or doc-like reasons)
 * 2) Other non-geo reasons (vehicle/commercial/etc.)
 * 3) Geo / area message — only when docs are not blocking
 */
export function blockedServiceSlogan(b: {
  service: string;
  missingDocuments: string[];
  reasons: string[];
}): string {
  const label = SERVICE_LABEL[b.service] ?? b.service;
  const reasons = (b.reasons ?? []).map((r) => String(r || "").trim()).filter(Boolean);

  if (b.missingDocuments.length > 0) {
    const docFromReasons = reasons.find((r) => isDocReasonText(r) && !isGeoAreaReasonText(r));
    if (docFromReasons) return docFromReasons;
    return `${label} needs ${b.missingDocuments.map(human).join(" + ")} to unlock.`;
  }

  const docReason = reasons.find((r) => isDocReasonText(r) && !isGeoAreaReasonText(r));
  if (docReason) return docReason;

  const nonGeo = reasons.find((r) => !isGeoAreaReasonText(r));
  if (nonGeo) return nonGeo;

  if (reasons[0]) return reasons[0];
  return `${label} is unavailable until documents are verified.`;
}
