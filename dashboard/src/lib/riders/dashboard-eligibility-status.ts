/**
 * Short agent-facing labels for rider Service Eligibility on the dashboard.
 * Rider-app copy stays long-form; dashboard shows only these concise statuses.
 */

export type EligibilityBlockLike = {
  code?: string | null;
  reason?: string | null;
};

/** Dashboard-only short status for a blocked service. */
export function formatDashboardEligibilityStatus(args: {
  blocking?: EligibilityBlockLike[] | null;
  missingDocuments?: string[] | null;
  reasons?: string[] | null;
}): string {
  const blocks = Array.isArray(args.blocking) ? args.blocking : [];
  const codes = blocks.map((b) => String(b.code || "").toUpperCase()).filter(Boolean);
  const reasonBlob = [
    ...blocks.map((b) => String(b.reason || "")),
    ...(Array.isArray(args.reasons) ? args.reasons : []),
  ]
    .join(" ")
    .toLowerCase();
  const missing = Array.isArray(args.missingDocuments) ? args.missingDocuments : [];

  if (
    codes.some(
      (c) =>
        c === "SERVICE_DISABLED" ||
        c === "NOT_AVAILABLE" ||
        c.includes("AREA") ||
        c.includes("GEO") ||
        c.includes("LOCATION") ||
        c.includes("HIRING"),
    ) ||
    /not available in your area|geo & coverage|turned off for/.test(reasonBlob)
  ) {
    return "Service not enable";
  }

  if (
    codes.some(
      (c) =>
        c === "COMMERCIAL_VEHICLE_REQUIRED" ||
        c === "OWNERSHIP_NOT_ALLOWED" ||
        c.includes("COMMERCIAL"),
    ) ||
    /commercial vehicle|non-commercial/.test(reasonBlob)
  ) {
    return "Non comercial vehicle";
  }

  if (
    codes.some(
      (c) =>
        c.includes("MISMATCH") ||
        c.includes("CROSS_CHECK") ||
        c.includes("_REJECTED") ||
        c === "NAME_MISMATCH",
    ) ||
    /mismatch|does not match|cross.?check/.test(reasonBlob)
  ) {
    return "Docs missmatched";
  }

  if (
    missing.length > 0 ||
    codes.some(
      (c) =>
        c.includes("NOT_VERIFIED") ||
        c.includes("NOT_SUBMITTED") ||
        c.includes("_PENDING") ||
        c.includes("EXPIRED") ||
        c === "NO_VEHICLE" ||
        c.startsWith("DL_") ||
        c.startsWith("RC_") ||
        c.includes("PROOF_"),
    ) ||
    /not verified|required|upload|missing|not provided|no vehicle/.test(reasonBlob)
  ) {
    return "Doc Not provided";
  }

  return "Service not enable";
}
