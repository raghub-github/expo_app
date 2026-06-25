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
    textFieldLabel: "RC Number",
    textFieldPlaceholder: "Enter registration number",
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

export function resolveVehicleOnboardingDocs(
  vehicleType: OnboardingVehicleType | undefined,
  catalog: OnboardingDocumentTypeDef[]
): VehicleOnboardingDocStep[] {
  const required = vehicleType?.documentRequirements?.required_docs ?? [];
  const optional = vehicleType?.documentRequirements?.optional_docs ?? [];
  const optionalSet = new Set(optional);
  const codes = [...required, ...optional.filter((code) => !required.includes(code))];
  const activeByCode = new Map(
    catalog.filter((d) => d.isActive).map((d) => [d.code, d])
  );
  return codes
    .map((code) => {
      const def = activeByCode.get(code);
      if (!def) return null;
      return { ...def, optional: optionalSet.has(code) };
    })
    .filter((d): d is VehicleOnboardingDocStep => Boolean(d))
    .sort((a, b) => {
      if (a.optional !== b.optional) return a.optional ? 1 : -1;
      return a.sortOrder - b.sortOrder || a.id - b.id;
    });
}

export function isDocSkipped(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  code: string
): boolean {
  return data.skippedOnboardingDocs?.includes(code) ?? false;
}

export function isDocStepSatisfied(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  doc: OnboardingDocumentTypeDef,
  optional: boolean
): boolean {
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

export function isDocStepComplete(
  data: import("@/src/stores/onboardingStore").OnboardingData,
  doc: OnboardingDocumentTypeDef
): boolean {
  const state = getDocUploadState(data, doc.code);
  const textOk =
    !doc.requiresTextField ||
    state.textValue.trim().length >= Math.max(doc.minTextLength, 1);
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
  skipped?: string[]
): string[] | undefined {
  if (!skipped?.length) return undefined;
  const optionalCodes = new Set(docs.filter((doc) => doc.optional).map((doc) => doc.code));
  const filtered = skipped.filter((code) => optionalCodes.has(code));
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
