import type { OnboardingVehicleType } from "@/src/lib/onboarding-vehicle-types";

export type OnboardingCaptureGroup = "dl_rc" | "rental_ev";

export type OnboardingDocumentTypeDef = {
  id: number;
  code: string;
  label: string;
  hint: string | null;
  icon: string | null;
  captureGroup: OnboardingCaptureGroup;
  requiresTextField: boolean;
  textFieldLabel: string | null;
  textFieldPlaceholder: string | null;
  minTextLength: number;
  sortOrder: number;
  isActive: boolean;
  /** When true, riders must upload front + back photos (e.g. driving license). */
  requiresBackPhoto?: boolean;
};

export const FALLBACK_ONBOARDING_DOCUMENT_TYPES: OnboardingDocumentTypeDef[] = [
  {
    id: 1,
    code: "dl",
    label: "Driving License",
    hint: "Enter your DL number and upload clear photos of the front and back",
    icon: "card-outline",
    captureGroup: "dl_rc",
    requiresTextField: true,
    textFieldLabel: "Driving License Number",
    textFieldPlaceholder: "Enter DL number",
    minTextLength: 4,
    sortOrder: 1,
    isActive: true,
    requiresBackPhoto: true,
  },
  {
    id: 2,
    code: "rc",
    label: "Registration Certificate",
    hint: "Enter your RC number and upload the registration certificate",
    icon: "document-text-outline",
    captureGroup: "dl_rc",
    requiresTextField: true,
    textFieldLabel: "Vehicle RC Number",
    textFieldPlaceholder: "Enter RC number",
    minTextLength: 4,
    sortOrder: 2,
    isActive: true,
  },
  {
    id: 3,
    code: "rental_proof",
    label: "Rental agreement",
    hint: "Valid rental contract for your vehicle",
    icon: "document-text-outline",
    captureGroup: "rental_ev",
    requiresTextField: false,
    textFieldLabel: null,
    textFieldPlaceholder: null,
    minTextLength: 0,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 4,
    code: "ev_proof",
    label: "EV proof",
    hint: "EV ownership or lease document",
    icon: "flash-outline",
    captureGroup: "rental_ev",
    requiresTextField: false,
    textFieldLabel: null,
    textFieldPlaceholder: null,
    minTextLength: 0,
    sortOrder: 2,
    isActive: true,
  },
];

export function findDocumentType(
  catalog: OnboardingDocumentTypeDef[],
  code?: string | null
): OnboardingDocumentTypeDef | undefined {
  if (!code) return undefined;
  return catalog.find((d) => d.code === code);
}

export function resolveVehicleRequiredDocs(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[]
): OnboardingDocumentTypeDef[] {
  const required = vehicleType?.documentRequirements?.required_docs ?? [];
  const activeByCode = new Map(
    catalog.filter((d) => d.isActive).map((d) => [d.code, d])
  );
  return required
    .map((code) => activeByCode.get(code))
    .filter((d): d is OnboardingDocumentTypeDef => Boolean(d))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export type VehicleOnboardingDocStep = OnboardingDocumentTypeDef & {
  optional: boolean;
};

const DOC_HINT_SHORT_LABEL: Record<string, string> = {
  dl: "DL",
  rc: "RC",
  rental_proof: "Rental proof",
  ev_proof: "EV proof",
};

function labelForDocCode(
  code: string,
  catalog: OnboardingDocumentTypeDef[]
): string {
  const key = String(code || "").trim().toLowerCase();
  if (!key) return "";
  const short = DOC_HINT_SHORT_LABEL[key];
  if (short) return short;
  const activeByCode = new Map(
    catalog.filter((d) => d.isActive).map((d) => [d.code, d])
  );
  return activeByCode.get(key)?.label ?? key.replace(/_/g, " ");
}

function joinDocLabels(labels: string[]): string {
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0]!;
  return labels.join(" & ");
}

/**
 * Select-vehicle card copy — required + optional docs in one line (optional
 * docs joined with &; never labeled "Optional" on the card).
 */
export function formatVehicleRequiredDocsHint(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[] = FALLBACK_ONBOARDING_DOCUMENT_TYPES
): string {
  const required = (vehicleType?.documentRequirements?.required_docs ?? [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const optional = (vehicleType?.documentRequirements?.optional_docs ?? [])
    .map((c) => String(c || "").trim())
    .filter(Boolean)
    .filter((c) => !required.includes(c));

  const allCodes = [...required, ...optional];
  if (!allCodes.length) {
    return vehicleType?.hint?.trim() || "No documents required";
  }

  const labels = allCodes.map((c) => labelForDocCode(c, catalog)).filter(Boolean);
  return `Required: ${joinDocLabels(labels)}`;
}

/**
 * Yellow info banner under the selected vehicle — same doc list as the card;
 * no "optional" / skip copy (skip is only on doc steps in the wizard).
 */
export function formatVehicleDocsInfoMessage(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[] = FALLBACK_ONBOARDING_DOCUMENT_TYPES
): string | null {
  const required = (vehicleType?.documentRequirements?.required_docs ?? [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const optional = (vehicleType?.documentRequirements?.optional_docs ?? [])
    .map((c) => String(c || "").trim())
    .filter(Boolean)
    .filter((c) => !required.includes(c));

  const allCodes = [...required, ...optional];
  if (!allCodes.length) return null;

  const labels = allCodes.map((c) => labelForDocCode(c, catalog)).filter(Boolean);
  if (!labels.length) return null;

  return `Upload ${joinDocLabels(labels)} (photo or PDF, max 5 MB).`;
}

/**
 * Docs the rider must upload for this vehicle.
 * Includes `required_docs` (required) and `optional_docs` (skippable).
 * Pass `captureGroup` to scope steps to the dl-rc or rental-ev screen.
 */
export function resolveVehicleOnboardingDocs(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[],
  opts?: { captureGroup?: OnboardingCaptureGroup }
): VehicleOnboardingDocStep[] {
  const required = vehicleType?.documentRequirements?.required_docs ?? [];
  const optional = vehicleType?.documentRequirements?.optional_docs ?? [];
  const activeByCode = new Map(
    catalog.filter((d) => d.isActive).map((d) => [d.code, d])
  );
  const seen = new Set<string>();
  const out: VehicleOnboardingDocStep[] = [];

  const push = (code: string, isOptional: boolean) => {
    const key = String(code || "").trim();
    if (!key || seen.has(key)) return;
    const def = activeByCode.get(key);
    if (!def) return;
    if (opts?.captureGroup && def.captureGroup !== opts.captureGroup) return;
    seen.add(key);
    out.push({ ...def, optional: isOptional });
  };

  for (const code of required) push(code, false);
  for (const code of optional) push(code, true);

  // Keep vehicle-type config order (required first, then optional).
  return out;
}

/** All configured doc steps for a vehicle (dl_rc + rental_ev groups, de-duplicated). */
/** Step 3 sub-steps: category (1) + vehicle (2) + each configured document. */
export function vehicleOnboardingWizardStepTotal(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[]
): number {
  return 2 + mergeVehicleOnboardingDocSteps(vehicleType, catalog).length;
}

export function vehicleOnboardingWizardStepNumber(
  phase: "category" | "vehicle" | "doc",
  docCode: string | null | undefined,
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[]
): { current: number; total: number } {
  const total = vehicleOnboardingWizardStepTotal(vehicleType, catalog);
  if (phase === "category") return { current: 1, total };
  if (phase === "vehicle") return { current: 2, total };
  const docs = mergeVehicleOnboardingDocSteps(vehicleType, catalog);
  const idx = docs.findIndex((d) => d.code === docCode);
  if (idx < 0) return { current: 2, total };
  return { current: 2 + idx + 1, total };
}

export function firstRentalEvDocCode(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[]
): string {
  return (
    resolveVehicleOnboardingDocs(vehicleType, catalog, { captureGroup: "rental_ev" })[0]
      ?.code ?? "rental_proof"
  );
}

export function mergeVehicleOnboardingDocSteps(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[]
): VehicleOnboardingDocStep[] {
  const seen = new Set<string>();
  const out: VehicleOnboardingDocStep[] = [];
  for (const captureGroup of ["dl_rc", "rental_ev"] as const) {
    for (const doc of resolveVehicleOnboardingDocs(vehicleType, catalog, {
      captureGroup,
    })) {
      if (seen.has(doc.code)) continue;
      seen.add(doc.code);
      out.push(doc);
    }
  }
  return out;
}

/** Both rental agreement and EV proof must be uploaded (DL/RC-style two steps). */
export function isRentalEvDocsSatisfied(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  docs: Array<OnboardingDocumentTypeDef & { optional?: boolean }>
): boolean {
  const rentalEvDocs = docs.filter(
    (d) => d.code === "rental_proof" || d.code === "ev_proof" || d.captureGroup === "rental_ev"
  );
  const steps = rentalEvDocs.length ? rentalEvDocs : docs;
  if (!steps.length) return false;
  return steps.every((d) => isDocStepComplete(data, d) || isDocSkipped(data, d.code));
}

/** @deprecated Use isRentalEvDocsSatisfied — both docs are required now. */
export function isRentalEvEitherOrSatisfied(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  docs: Array<OnboardingDocumentTypeDef & { optional?: boolean }>
): boolean {
  return isRentalEvDocsSatisfied(data, docs);
}

/** Normalize wizard / catalog / geo codes so "dl" matches "driving_license" etc. */
export function normalizeOnboardingDocCode(code: string): string {
  const c = String(code || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (
    c === "dl" ||
    c === "driving_licence" ||
    c === "driving_license" ||
    c === "drivinglicence" ||
    c === "drivinglicense"
  ) {
    return "dl";
  }
  if (
    c === "rc" ||
    c === "registration_certificate" ||
    c === "vehicle_rc" ||
    c === "registrationcertificate"
  ) {
    return "rc";
  }
  if (c === "bank" || c === "bank_account" || c === "bank_proof") {
    return "bank_account";
  }
  return c;
}

export function isDocSkipped(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  code: string,
  extraSkipped?: string[] | null,
): boolean {
  const want = normalizeOnboardingDocCode(code);
  const list = [
    ...(data.skippedOnboardingDocs ?? []),
    ...(extraSkipped ?? []),
  ];
  return list.some((s) => normalizeOnboardingDocCode(s) === want);
}

export function isDocStepSatisfied(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  doc: OnboardingDocumentTypeDef,
  optional: boolean
): boolean {
  // Skips only satisfy optional docs for the *current* vehicle. A prior skip
  // must never override a newly mandatory requirement after vehicle change.
  if (optional && isDocSkipped(data, doc.code)) return true;
  return isDocStepComplete(data, doc);
}

export function resolveDocIcon(icon?: string | null): string {
  return icon?.trim() || "document-outline";
}

export function docRequiresBackPhoto(doc: OnboardingDocumentTypeDef): boolean {
  if (doc.requiresBackPhoto === true) return true;
  if (doc.requiresBackPhoto === false) return false;
  return doc.code === "dl";
}

/** Cashfree / DigiLocker stub file URLs — count as complete without photo sides. */
export function isElectronicVerifiedDocUrl(url?: string | null): boolean {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return false;
  return (
    u.includes("cashfree_dl_verified") ||
    u.includes("cashfree_rc_verified") ||
    u.includes("cashfree_pan_verified") ||
    u.includes("digilocker_verified") ||
    u.includes("aadhaar_masking_verified") ||
    u.includes("electronic_verified")
  );
}

export function isDocStepComplete(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  doc: OnboardingDocumentTypeDef,
  opts?: { electronicallyVerified?: boolean }
): boolean {
  const state = getDocUploadState(data, doc.code);
  const textOk =
    !doc.requiresTextField ||
    state.textValue.trim().length >= Math.max(doc.minTextLength, 1);
  // Cashfree / DigiLocker electronic verify: number alone is enough — photos are not required.
  if (opts?.electronicallyVerified) {
    return textOk;
  }
  // Persisted electronic stub (or absolutized stub path) — do not require DL back photo.
  if (
    isElectronicVerifiedDocUrl(state.signedUrl) ||
    isElectronicVerifiedDocUrl(state.localUri)
  ) {
    return textOk;
  }
  const frontOk = Boolean(state.signedUrl || state.localUri);
  const backOk = !docRequiresBackPhoto(doc) || Boolean(state.backSignedUrl || state.backLocalUri);
  return textOk && frontOk && backOk;
}

export type DocUploadState = {
  localUri: string | null;
  signedUrl: string | null;
  backLocalUri?: string | null;
  backSignedUrl?: string | null;
  textValue: string;
};

type LegacyDocFieldMap = {
  uri?: keyof import("@/src/stores/onboardingStore").OnboardingData;
  signed?: keyof import("@/src/stores/onboardingStore").OnboardingData;
  backUri?: keyof import("@/src/stores/onboardingStore").OnboardingData;
  backSigned?: keyof import("@/src/stores/onboardingStore").OnboardingData;
  text?: keyof import("@/src/stores/onboardingStore").OnboardingData;
};

const LEGACY_DOC_FIELDS: Record<string, LegacyDocFieldMap> = {
  dl: {
    uri: "dlPhotoUri",
    signed: "dlPhotoSignedUrl",
    backUri: "dlBackPhotoUri",
    backSigned: "dlBackPhotoSignedUrl",
    text: "dlNumber",
  },
  rc: { uri: "rcPhotoUri", signed: "rcPhotoSignedUrl", text: "rcNumber" },
  rental_proof: { uri: "rentalProofUri", signed: "rentalProofSignedUrl" },
  ev_proof: { uri: "evProofUri", signed: "evProofSignedUrl" },
};

export function getDocUploadState(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  code: string
): DocUploadState {
  const legacy = LEGACY_DOC_FIELDS[code];
  if (legacy) {
    return {
      localUri: (legacy.uri ? (data[legacy.uri] as string | undefined) : undefined) ?? null,
      signedUrl: (legacy.signed ? (data[legacy.signed] as string | undefined) : undefined) ?? null,
      backLocalUri:
        (legacy.backUri ? (data[legacy.backUri] as string | undefined) : undefined) ?? null,
      backSignedUrl:
        (legacy.backSigned ? (data[legacy.backSigned] as string | undefined) : undefined) ?? null,
      textValue: (legacy.text ? (data[legacy.text] as string | undefined) : undefined) ?? "",
    };
  }
  const dynamic = data.documentUploads?.[code];
  return {
    localUri: dynamic?.localUri ?? null,
    signedUrl: dynamic?.signedUrl ?? null,
    backLocalUri: dynamic?.backLocalUri ?? null,
    backSignedUrl: dynamic?.backSignedUrl ?? null,
    textValue: dynamic?.textValue ?? "",
  };
}

export function docUploadToStorePatch(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  code: string,
  patch: Partial<DocUploadState>
): Partial<import("@/src/stores/onboardingStore").OnboardingData> {
  const legacy = LEGACY_DOC_FIELDS[code];
  const out: Partial<import("@/src/stores/onboardingStore").OnboardingData> = {};

  if (legacy) {
    if (patch.localUri !== undefined && legacy.uri) {
      (out as Record<string, unknown>)[legacy.uri] = patch.localUri;
    }
    if (patch.signedUrl !== undefined && legacy.signed) {
      (out as Record<string, unknown>)[legacy.signed] = patch.signedUrl;
    }
    if (patch.backLocalUri !== undefined && legacy.backUri) {
      (out as Record<string, unknown>)[legacy.backUri] = patch.backLocalUri;
    }
    if (patch.backSignedUrl !== undefined && legacy.backSigned) {
      (out as Record<string, unknown>)[legacy.backSigned] = patch.backSignedUrl;
    }
    if (patch.textValue !== undefined && legacy.text) {
      (out as Record<string, unknown>)[legacy.text] = patch.textValue;
    }
    return out;
  }

  const prev = data.documentUploads ?? {};
  out.documentUploads = {
    ...prev,
    [code]: {
      ...(prev[code] ?? {}),
      ...(patch.localUri !== undefined ? { localUri: patch.localUri ?? undefined } : {}),
      ...(patch.signedUrl !== undefined ? { signedUrl: patch.signedUrl ?? undefined } : {}),
      ...(patch.backLocalUri !== undefined ? { backLocalUri: patch.backLocalUri ?? undefined } : {}),
      ...(patch.backSignedUrl !== undefined ? { backSignedUrl: patch.backSignedUrl ?? undefined } : {}),
      ...(patch.textValue !== undefined ? { textValue: patch.textValue } : {}),
    },
  };
  return out;
}

export function findFirstIncompleteDocStep(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  docs: Array<OnboardingDocumentTypeDef & { optional?: boolean }>
): string | null {
  for (const doc of docs) {
    if (!isDocStepSatisfied(data, doc, Boolean(doc.optional))) return doc.code;
  }
  return null;
}

/** Resume doc wizard: first incomplete step, or the last step when all docs are already satisfied. */
export function resolveVehicleWizardDocStep(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  docs: Array<OnboardingDocumentTypeDef & { optional?: boolean }>
): string | null {
  if (!docs.length) return null;
  const incomplete = findFirstIncompleteDocStep(data, docs);
  if (incomplete) return incomplete;
  return docs[docs.length - 1]!.code;
}

export function filterSkippedDocsForVehicle(
  docs: Array<OnboardingDocumentTypeDef & { optional?: boolean }>,
  skipped?: string[],
  opts?: { alsoKeep?: string[] },
): string[] | undefined {
  if (!skipped?.length) return undefined;
  // Only optional docs for the current vehicle may remain skipped — unless
  // explicitly allow-listed (e.g. geo canSkipDuringOnboarding).
  const optionalCodes = new Set(
    docs.filter((doc) => doc.optional).map((doc) => doc.code),
  );
  const alsoKeep = new Set(
    (opts?.alsoKeep ?? []).map((c) => String(c || "").trim()).filter(Boolean),
  );
  const filtered = skipped.filter(
    (code) =>
      optionalCodes.has(code) ||
      alsoKeep.has(code) ||
      /^(bank_account|bank_proof)$/i.test(code),
  );
  return filtered.length ? filtered : undefined;
}

export function areAllVehicleDocStepsSatisfied(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  docs: Array<OnboardingDocumentTypeDef & { optional?: boolean }>
): boolean {
  return docs.every((doc) => isDocStepSatisfied(data, doc, Boolean(doc.optional)));
}

export function metadataKeyForDocText(code: string): string {
  if (code === "dl") return "dlNumber";
  if (code === "rc") return "rcNumber";
  return `${code}Number`;
}
