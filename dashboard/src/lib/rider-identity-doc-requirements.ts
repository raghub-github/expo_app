export const RIDER_IDENTITY_REQUIRED_DOC_TYPES = [
  "aadhaar_front",
  "aadhaar_back",
  "pan",
  "selfie",
] as const;

export const RIDER_IDENTITY_OPTIONAL_DOC_TYPES = [] as const;

/**
 * PAN is mandatory unless this rider has an admin pan_skip_override.
 * Uploaded PAN must be verified; absent PAN fails unless skip is enabled.
 */
export function isPanIdentityRequirementMet(
  docs: Array<{ docType: string; verified?: boolean | null }>,
  opts?: { panSkipOverride?: boolean | null },
): boolean {
  if (opts?.panSkipOverride === true) return true;
  const panDoc = docs.find((d) => d.docType === "pan");
  if (!panDoc) return false;
  return Boolean(panDoc.verified);
}

export function computeIdentityVerificationProgress(
  docs: Array<{ docType: string; verified?: boolean | null }>,
  isDocVerified: (docType: string) => boolean,
  isDocUploaded: (docType: string) => boolean,
  opts?: { panSkipOverride?: boolean | null },
): {
  verified: number;
  uploaded: number;
  total: number;
  complete: boolean;
} {
  const required = RIDER_IDENTITY_REQUIRED_DOC_TYPES.filter((docType) => {
    if (docType === "pan" && opts?.panSkipOverride) return false;
    return true;
  });
  const requiredVerified = required.filter(isDocVerified).length;
  const requiredUploaded = required.filter(isDocUploaded).length;
  const total = required.length;
  const verified = requiredVerified;
  const uploaded = requiredUploaded;
  const complete =
    requiredVerified === total && isPanIdentityRequirementMet(docs, opts);

  return { verified, uploaded, total, complete };
}
