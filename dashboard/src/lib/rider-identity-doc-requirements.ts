export const RIDER_IDENTITY_REQUIRED_DOC_TYPES = [
  "aadhaar_front",
  "aadhaar_back",
  "selfie",
] as const;

export const RIDER_IDENTITY_OPTIONAL_DOC_TYPES = ["pan"] as const;

/** PAN is optional: absent = OK; uploaded must be verified before approval. */
export function isPanIdentityRequirementMet(
  docs: Array<{ docType: string; verified?: boolean | null }>
): boolean {
  const panDoc = docs.find((d) => d.docType === "pan");
  if (!panDoc) return true;
  return Boolean(panDoc.verified);
}

export function computeIdentityVerificationProgress(
  docs: Array<{ docType: string; verified?: boolean | null }>,
  isDocVerified: (docType: string) => boolean,
  isDocUploaded: (docType: string) => boolean
): {
  verified: number;
  uploaded: number;
  total: number;
  complete: boolean;
} {
  const requiredVerified = RIDER_IDENTITY_REQUIRED_DOC_TYPES.filter(isDocVerified).length;
  const requiredUploaded = RIDER_IDENTITY_REQUIRED_DOC_TYPES.filter(isDocUploaded).length;
  const panUploaded = isDocUploaded("pan");
  const panVerified = panUploaded && isDocVerified("pan");

  const total = RIDER_IDENTITY_REQUIRED_DOC_TYPES.length + (panUploaded ? 1 : 0);
  const verified = requiredVerified + (panVerified ? 1 : 0);
  const uploaded = requiredUploaded + (panUploaded ? 1 : 0);
  const complete =
    requiredVerified === RIDER_IDENTITY_REQUIRED_DOC_TYPES.length &&
    isPanIdentityRequirementMet(docs);

  return { verified, uploaded, total, complete };
}
