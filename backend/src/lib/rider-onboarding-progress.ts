import { getDb } from "../db/client.js";
import {
  riderDocuments,
  riderDocumentFiles,
  riders,
  riderOnboardingVehicleTypes,
  onboardingPayments,
} from "../db/schema.js";
import { desc, eq, inArray } from "drizzle-orm";
import {
  computeOnboardingProgressPct,
  resolveLastAndNextProgressSteps,
  resolveMacroStepIndexFromProgress,
  resolveRiderOnboardingStageTransition,
  type OnboardingProgressMap,
  type OnboardingStepStatus,
} from "./rider-onboarding-stage-machine.js";
import { normalizeDlNumber } from "./rider-dl-registration-check.js";
import { normalizeRcNumber } from "./rider-rc-registration-check.js";

export type RiderOnboardingStepKey =
  | "method_selection"
  | "aadhaar_name"
  | "pan_selfie"
  | "dl_rc"
  | "rental_ev"
  | "payment";

const STEP_ORDER: RiderOnboardingStepKey[] = [
  "method_selection",
  "aadhaar_name",
  "pan_selfie",
  "dl_rc",
  "rental_ev",
];

function stepIndex(step: RiderOnboardingStepKey): number {
  return STEP_ORDER.indexOf(step);
}

function hasDocType(docs: { docType: string }[], type: string): boolean {
  return docs.some((d) => d.docType === type);
}

function aadhaarComplete(
  docs: {
    id: number;
    docType: string;
    fileUrl?: string | null;
    verified?: boolean | null;
    verificationMethod?: string | null;
    metadata?: unknown;
  }[],
  filesByDocId: Map<number, { side: string | null }[]>
): boolean {
  const row = docs.find((d) => d.docType === "aadhaar");
  if (!row) return hasDocType(docs, "aadhaar_front") && hasDocType(docs, "aadhaar_back");

  // DigiLocker / electronic verify: no photo sides required.
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const method = String(row.verificationMethod || meta.verificationMethod || "").toUpperCase();
  const fileUrl = String(row.fileUrl || "");
  const electronicOk =
    row.verified === true ||
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK" ||
    meta.digilockerVerified === true ||
    meta.aadhaarMaskingVerified === true ||
    method.includes("DIGILOCKER") ||
    method.includes("AADHAAR_MASKING") ||
    fileUrl.includes("digilocker_verified") ||
    fileUrl.includes("aadhaar_masking_verified") ||
    fileUrl.includes("electronic_verified");
  if (electronicOk) return true;

  const files = filesByDocId.get(row.id) ?? [];
  const hasFront = files.some((f) => f.side === "front");
  const hasBack = files.some((f) => f.side === "back");
  return hasFront && hasBack;
}

function dlRcComplete(docs: { docType: string }[]): boolean {
  return hasDocType(docs, "dl") && hasDocType(docs, "rc");
}

function panSelfieComplete(docs: { docType: string }[]): boolean {
  // PAN is optional during onboarding — selfie alone completes this step.
  return hasDocType(docs, "selfie");
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function normalizePanValue(raw: unknown): string | null {
  const value = String(raw ?? "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  return PAN_RE.test(value) ? value : null;
}

/** PAN already on riders / pan doc (dashboard electronic approve or app verify). */
function readPanNumber(
  docs: { docType: string; docNumber?: string | null; metadata: unknown }[],
  riderPan: string | null | undefined
): string | null {
  const fromRider = normalizePanValue(riderPan);
  if (fromRider) return fromRider;
  const pan = docs.find((d) => d.docType === "pan");
  if (!pan) return null;
  const fromDoc = normalizePanValue(pan.docNumber);
  if (fromDoc) return fromDoc;
  const meta =
    pan.metadata && typeof pan.metadata === "object"
      ? (pan.metadata as Record<string, unknown>)
      : {};
  return normalizePanValue(meta.panNumber ?? meta.pan);
}

function readDocMetaString(metadata: unknown, keys: string[]): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  for (const key of keys) {
    const raw = meta[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function readDlNumber(
  docs: { docType: string; docNumber?: string | null; metadata: unknown }[],
): string | null {
  const dl = docs.find((d) => d.docType === "dl");
  if (!dl) return null;
  return (
    normalizeDlNumber(dl.docNumber) ??
    normalizeDlNumber(readDocMetaString(dl.metadata, ["dlNumber", "dl_number", "license_number"]))
  );
}

function readRcNumber(
  docs: { docType: string; docNumber?: string | null; metadata: unknown }[],
): string | null {
  const rc = docs.find((d) => d.docType === "rc");
  if (!rc) return null;
  return (
    normalizeRcNumber(rc.docNumber) ??
    normalizeRcNumber(readDocMetaString(rc.metadata, ["rcNumber", "rc_number", "vehicle_number"]))
  );
}

function isDocElectronicallyVerified(doc: {
  verified?: boolean | null;
  verificationMethod?: string | null;
  verificationStatus?: string | null;
} | undefined): boolean {
  if (!doc) return false;
  if (doc.verified === true) return true;
  const method = String(doc.verificationMethod || "").toUpperCase();
  if (
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK"
  ) {
    return true;
  }
  return String(doc.verificationStatus || "").toLowerCase() === "auto_verified";
}

function readDocSideUrls(
  docs: { id: number; docType: string; fileUrl?: string | null }[],
  filesByDocId: Map<number, { side: string | null; fileUrl: string | null }[]>,
  docType: string,
): { frontUrl: string | null; backUrl: string | null } {
  const doc = docs.find((d) => d.docType === docType);
  if (!doc) return { frontUrl: null, backUrl: null };
  const files = filesByDocId.get(doc.id) ?? [];
  const front =
    files.find((f) => f.side === "front")?.fileUrl ||
    files.find((f) => f.side === "single")?.fileUrl ||
    doc.fileUrl ||
    null;
  const back = files.find((f) => f.side === "back")?.fileUrl || null;
  return {
    frontUrl: front && String(front).trim() ? String(front).trim() : null,
    backUrl: back && String(back).trim() ? String(back).trim() : null,
  };
}

function readCashfreeVerifiedData(
  docs: {
    docType: string;
    metadata: unknown;
    extractedDataSummary?: unknown;
  }[],
  docType: string,
): Record<string, unknown> | null {
  const doc = docs.find((d) => d.docType === docType);
  if (!doc) return null;
  if (doc.metadata && typeof doc.metadata === "object") {
    const meta = doc.metadata as Record<string, unknown>;
    const raw = meta.cashfreeVerifiedData ?? meta.verifiedData ?? meta.verified_data;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  }
  // Fallback after older save-step wipes that cleared metadata.cashfreeVerifiedData.
  const summary = doc.extractedDataSummary;
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const raw = (summary as Record<string, unknown>).verifiedData;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeRiderDob(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function panDocVerified(doc: {
  verified?: boolean | null;
  verificationMethod?: string | null;
  verificationStatus?: string | null;
} | undefined): boolean {
  if (!doc) return false;
  if (doc.verified === true) return true;
  const status = String(doc.verificationStatus || "").toLowerCase();
  if (status === "verified" || status === "auto_verified") return true;
  const method = String(doc.verificationMethod || "").toUpperCase();
  return (
    method === "APP_VERIFIED" ||
    method.startsWith("CASHFREE_") ||
    method === "RAZORPAY_BANK"
  );
}

function rentalEvComplete(docs: { docType: string }[]): boolean {
  return hasDocType(docs, "rental_proof") || hasDocType(docs, "ev_proof");
}

function readOnboardingVehicleFlow(
  docs: { docType: string; metadata: unknown }[]
): "dl_rc" | "rental_ev" | "payment" | null {
  const row = docs.find((d) => d.docType === "onboarding_vehicle_selection");
  if (!row?.metadata || typeof row.metadata !== "object") return null;
  const flow = (row.metadata as { onboardingFlow?: string }).onboardingFlow;
  if (flow === "dl_rc" || flow === "rental_ev" || flow === "payment") return flow;
  return null;
}

function readOnboardingVehicleSelectionMetadata(
  docs: { docType: string; metadata: unknown }[]
): Record<string, unknown> | null {
  const row = docs.find((d) => d.docType === "onboarding_vehicle_selection");
  if (!row?.metadata || typeof row.metadata !== "object") return null;
  return row.metadata as Record<string, unknown>;
}

function readVehicleChoice(docs: { docType: string; metadata: unknown }[]): string | null {
  const meta = readOnboardingVehicleSelectionMetadata(docs);
  const choice = meta?.vehicleChoice;
  return typeof choice === "string" && choice.trim() ? choice.trim() : null;
}

function readVehicleCategoryCode(docs: { docType: string; metadata: unknown }[]): string | null {
  const meta = readOnboardingVehicleSelectionMetadata(docs);
  const code = meta?.vehicleCategoryCode;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

function readRcDocumentUrl(docs: { docType: string; fileUrl: string | null }[]): string | null {
  const row = docs.find((d) => d.docType === "rc");
  const url = row?.fileUrl?.trim();
  if (!url || url === "pending") return null;
  return url;
}

export async function readRiderOnboardingVehicleSelection(riderId: number): Promise<{
  vehicleChoice: string | null;
  vehicleCategoryCode: string | null;
  registrationNumber: string | null;
  rcDocumentUrl: string | null;
}> {
  const db = getDb();
  const docs = await db
    .select({
      docType: riderDocuments.docType,
      metadata: riderDocuments.metadata,
      fileUrl: riderDocuments.fileUrl,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));
  return {
    vehicleChoice: readVehicleChoice(docs),
    vehicleCategoryCode: readVehicleCategoryCode(docs),
    registrationNumber: readRcNumber(docs),
    rcDocumentUrl: readRcDocumentUrl(docs),
  };
}

function readVehicleDocsSubmittedFor(docs: { docType: string; metadata: unknown }[]): string | null {
  const row = docs.find((d) => d.docType === "onboarding_vehicle_selection");
  if (!row?.metadata || typeof row.metadata !== "object") return null;
  const meta = row.metadata as {
    vehicleDocsSubmittedFor?: string;
    vehicleDocsSubmittedAt?: string;
  };
  const submittedFor =
    typeof meta.vehicleDocsSubmittedFor === "string" ? meta.vehicleDocsSubmittedFor.trim() : "";
  const submittedAt =
    typeof meta.vehicleDocsSubmittedAt === "string" ? meta.vehicleDocsSubmittedAt.trim() : "";
  if (!submittedFor || !submittedAt) return null;
  return submittedFor;
}

async function readRequiredDocsForVehicleChoice(
  vehicleChoice: string | null
): Promise<string[] | null> {
  if (!vehicleChoice) return null;
  const db = getDb();
  const [row] = await db
    .select({ documentRequirements: riderOnboardingVehicleTypes.documentRequirements })
    .from(riderOnboardingVehicleTypes)
    .where(eq(riderOnboardingVehicleTypes.code, vehicleChoice))
    .limit(1);
  if (!row?.documentRequirements || typeof row.documentRequirements !== "object") return null;
  const required = (row.documentRequirements as { required_docs?: string[] }).required_docs;
  if (!Array.isArray(required) || required.length === 0) return null;
  return required.filter((code): code is string => typeof code === "string" && code.length > 0);
}

function vehicleStepCompleteByRequired(
  docs: { docType: string }[],
  requiredDocs: string[]
): boolean {
  return requiredDocs.every((code) => hasDocType(docs, code));
}

function vehicleStepComplete(
  docs: { docType: string; metadata: unknown }[],
  flow: "dl_rc" | "rental_ev" | "payment" | null
): boolean {
  if (flow === "payment") return hasDocType(docs, "onboarding_vehicle_selection");
  if (flow === "rental_ev") return rentalEvComplete(docs);
  if (flow === "dl_rc") return dlRcComplete(docs);
  return dlRcComplete(docs) || rentalEvComplete(docs);
}

/** Riders past document collection must not be routed back to doc upload. */
function resolveNextStepForEstablishedRider(
  rider: { onboardingStage: string; kycStatus: string },
  _completed: RiderOnboardingStepKey[]
): RiderOnboardingStepKey | null {
  const stage = rider.onboardingStage;
  // Paid / fee-stage riders resume at payment (or stay until activation).
  // Do not use kycStatus alone — identity can be approved mid-KYC.
  if (stage === "PAYMENT" || stage === "APPROVAL" || stage === "ACTIVE") {
    return "payment";
  }
  return null;
}

export async function getRiderOnboardingProgress(riderId: number): Promise<{
  nextStep: RiderOnboardingStepKey;
  completedSteps: RiderOnboardingStepKey[];
  /** Normalized PAN from riders.pan_number or pan document (if present). */
  panNumber: string | null;
  /** True when PAN row is electronically / manually verified in rider_documents. */
  panVerified: boolean;
  /** Aadhaar / rider DOB as YYYY-MM-DD — used to prefill DL verify DOB. */
  dob: string | null;
  /** DL number + photo URLs after Cashfree fallback manual upload (or EV). */
  dlNumber: string | null;
  dlFrontUrl: string | null;
  dlBackUrl: string | null;
  dlVerified: boolean;
  dlVerifiedData: Record<string, unknown> | null;
  /** RC number + photo URL after manual / EV upload. */
  rcNumber: string | null;
  rcFrontUrl: string | null;
  rcVerified: boolean;
  rcVerifiedData: Record<string, unknown> | null;
  onboardingProgress: OnboardingProgressMap;
  lastCompletedStep: string | null;
  nextRequiredStep: string | null;
  onboardingProgressPct: number;
  macroStepIndex: number;
  paymentCompleted: boolean;
}> {
  const emptyProgress: OnboardingProgressMap = {
    aadhaar: "not_started",
    face: "not_started",
    pan: "skipped",
    vehicle: "not_started",
    payment: "not_started",
    approval: "not_started",
  };
  const emptyDocDraft = {
    dob: null as string | null,
    dlNumber: null as string | null,
    dlFrontUrl: null as string | null,
    dlBackUrl: null as string | null,
    dlVerified: false,
    dlVerifiedData: null as Record<string, unknown> | null,
    rcNumber: null as string | null,
    rcFrontUrl: null as string | null,
    rcVerified: false,
    rcVerifiedData: null as Record<string, unknown> | null,
  };
  const db = getDb();

  const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (riderRows.length === 0) {
    return {
      nextStep: "method_selection",
      completedSteps: [],
      panNumber: null,
      panVerified: false,
      ...emptyDocDraft,
      onboardingProgress: emptyProgress,
      lastCompletedStep: null,
      nextRequiredStep: "aadhaar",
      onboardingProgressPct: 0,
      macroStepIndex: 0,
      paymentCompleted: false,
    };
  }

  const docs = await db
    .select({
      id: riderDocuments.id,
      docType: riderDocuments.docType,
      metadata: riderDocuments.metadata,
      fileUrl: riderDocuments.fileUrl,
      verified: riderDocuments.verified,
      verificationMethod: riderDocuments.verificationMethod,
      verificationStatus: riderDocuments.verificationStatus,
      docNumber: riderDocuments.docNumber,
      extractedDataSummary: riderDocuments.extractedDataSummary,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  const docIds = docs.map((d) => d.id);
  const fileRows =
    docIds.length > 0
      ? await db
          .select({
            documentId: riderDocumentFiles.documentId,
            side: riderDocumentFiles.side,
            fileUrl: riderDocumentFiles.fileUrl,
          })
          .from(riderDocumentFiles)
          .where(inArray(riderDocumentFiles.documentId, docIds))
      : [];

  const filesByDocId = new Map<number, { side: string | null; fileUrl: string | null }[]>();
  for (const f of fileRows) {
    const list = filesByDocId.get(f.documentId) ?? [];
    list.push({ side: f.side, fileUrl: f.fileUrl });
    filesByDocId.set(f.documentId, list);
  }

  const completed: RiderOnboardingStepKey[] = [];

  if (aadhaarComplete(docs, filesByDocId)) {
    completed.push("aadhaar_name");
  }

  if (panSelfieComplete(docs)) {
    completed.push("pan_selfie");
  }

  const vehicleFlow = readOnboardingVehicleFlow(docs);
  const vehicleChoice = readVehicleChoice(docs);
  const vehicleDocsSubmittedFor = readVehicleDocsSubmittedFor(docs);
  const configuredRequiredDocs = await readRequiredDocsForVehicleChoice(vehicleChoice);
  const vehicleDocsSatisfied = configuredRequiredDocs?.length
    ? vehicleStepCompleteByRequired(docs, configuredRequiredDocs)
    : vehicleStepComplete(docs, vehicleFlow);
  const vehicleReadyForPayment =
    vehicleDocsSatisfied &&
    Boolean(vehicleChoice) &&
    vehicleDocsSubmittedFor === vehicleChoice;

  if (configuredRequiredDocs?.length) {
    if (vehicleDocsSatisfied) {
      const dlRcRequired = configuredRequiredDocs.filter((code) => code === "dl" || code === "rc");
      if (dlRcRequired.length > 0) completed.push("dl_rc");
      const rentalRequired = configuredRequiredDocs.filter(
        (code) => code === "rental_proof" || code === "ev_proof"
      );
      if (rentalRequired.length > 0) completed.push("rental_ev");
    } else {
      const dlRcRequired = configuredRequiredDocs.filter((code) => code === "dl" || code === "rc");
      if (dlRcRequired.length > 0 && dlRcRequired.every((code) => hasDocType(docs, code))) {
        completed.push("dl_rc");
      }
      const rentalRequired = configuredRequiredDocs.filter(
        (code) => code === "rental_proof" || code === "ev_proof"
      );
      if (rentalRequired.length > 0 && rentalRequired.every((code) => hasDocType(docs, code))) {
        completed.push("rental_ev");
      }
    }
  } else {
    if (dlRcComplete(docs)) {
      completed.push("dl_rc");
    }
    if (rentalEvComplete(docs)) {
      completed.push("rental_ev");
    }
    if (vehicleFlow === "payment" && hasDocType(docs, "onboarding_vehicle_selection")) {
      completed.push("dl_rc");
      completed.push("rental_ev");
    }
  }

  const rider = riderRows[0]!;
  const panDoc = docs.find((d) => d.docType === "pan");
  const panNumber = readPanNumber(docs, rider.panNumber);
  const panVerified = panDocVerified(panDoc);
  const dob = normalizeRiderDob(rider.dob);
  const dlNumber = readDlNumber(docs);
  const dlDoc = docs.find((d) => d.docType === "dl");
  const dlUrls = readDocSideUrls(docs, filesByDocId, "dl");
  const dlVerified = isDocElectronicallyVerified(dlDoc);
  const dlVerifiedData = readCashfreeVerifiedData(docs, "dl");
  const rcNumber = readRcNumber(docs);
  const rcDoc = docs.find((d) => d.docType === "rc");
  const rcUrls = readDocSideUrls(docs, filesByDocId, "rc");
  const rcVerified = isDocElectronicallyVerified(rcDoc);
  const rcVerifiedData = readCashfreeVerifiedData(docs, "rc");
  const docDraftFields = {
    dob,
    dlNumber,
    dlFrontUrl: dlUrls.frontUrl,
    dlBackUrl: dlUrls.backUrl,
    dlVerified,
    dlVerifiedData,
    rcNumber,
    rcFrontUrl: rcUrls.frontUrl,
    rcVerified,
    rcVerifiedData,
  };

  const [payment] = await db
    .select({ status: onboardingPayments.status })
    .from(onboardingPayments)
    .where(eq(onboardingPayments.riderId, riderId))
    .orderBy(desc(onboardingPayments.createdAt))
    .limit(1);
  const paymentCompleted = payment?.status === "completed";

  const onboardingProgress = buildOnboardingProgressMap({
    docs,
    filesByDocId,
    aadhaarDone: aadhaarComplete(docs, filesByDocId),
    faceDone: panSelfieComplete(docs),
    panVerified,
    hasPanDoc: Boolean(panDoc),
    vehicleReady: vehicleReadyForPayment,
    vehicleSatisfied: vehicleDocsSatisfied,
    paymentCompleted,
    onboardingStage: rider.onboardingStage,
  });

  const { lastCompletedStep, nextRequiredStep } =
    resolveLastAndNextProgressSteps(onboardingProgress);
  const onboardingProgressPct = computeOnboardingProgressPct(onboardingProgress);
  const macroStepIndex = resolveMacroStepIndexFromProgress(onboardingProgress);

  // Persist progress columns when present (migration 0457).
  await persistRiderOnboardingProgress(riderId, {
    onboardingProgress,
    lastCompletedStep,
    nextRequiredStep,
    onboardingProgressPct,
  }).catch(() => undefined);

  // Heal illegal APPROVAL-without-payment on every progress read.
  await healRiderOnboardingStageIfNeeded(riderId, {
    identitySubmitted: aadhaarComplete(docs, filesByDocId) && panSelfieComplete(docs),
    identityVerified: aadhaarComplete(docs, filesByDocId) && panSelfieComplete(docs) && (!panDoc || panVerified),
    vehicleReady: vehicleReadyForPayment,
    vehicleVerified: vehicleDocsSatisfied && vehicleReadyForPayment,
    paymentCompleted,
  }).catch(() => undefined);

  // Re-read stage after heal so established routing matches DB.
  const [riderAfterHeal] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  const stageRider = riderAfterHeal ?? rider;

  const establishedNext = resolveNextStepForEstablishedRider(stageRider, completed);
  if (establishedNext) {
    return {
      nextStep: establishedNext,
      completedSteps: completed,
      panNumber,
      panVerified,
      ...docDraftFields,
      onboardingProgress,
      lastCompletedStep,
      nextRequiredStep,
      onboardingProgressPct,
      macroStepIndex,
      paymentCompleted,
    };
  }

  let nextStep: RiderOnboardingStepKey = "method_selection";

  if (!aadhaarComplete(docs, filesByDocId)) {
    nextStep = "aadhaar_name";
  } else if (!panSelfieComplete(docs)) {
    nextStep = "pan_selfie";
  } else if (!vehicleReadyForPayment) {
    if (vehicleFlow === "rental_ev") {
      nextStep = "rental_ev";
    } else {
      nextStep = "dl_rc";
    }
  } else {
    nextStep = "payment";
  }

  return {
    nextStep,
    completedSteps: completed,
    panNumber,
    panVerified,
    ...docDraftFields,
    onboardingProgress,
    lastCompletedStep,
    nextRequiredStep,
    onboardingProgressPct,
    macroStepIndex,
    paymentCompleted,
  };
}

function docStepStatus(opts: {
  present: boolean;
  verified: boolean;
  rejected?: boolean;
}): OnboardingStepStatus {
  if (opts.rejected) return "failed";
  if (opts.verified) return "completed";
  if (opts.present) return "pending_manual_review";
  return "not_started";
}

function buildOnboardingProgressMap(input: {
  docs: { docType: string; verified?: boolean | null; fileUrl?: string | null; rejectedReason?: string | null }[];
  filesByDocId: Map<number, { side: string | null }[]>;
  aadhaarDone: boolean;
  faceDone: boolean;
  panVerified: boolean;
  hasPanDoc: boolean;
  vehicleReady: boolean;
  vehicleSatisfied: boolean;
  paymentCompleted: boolean;
  onboardingStage: string;
}): OnboardingProgressMap {
  const aadhaarDoc = input.docs.find((d) => d.docType === "aadhaar" || d.docType === "aadhaar_front");
  const selfieDoc = input.docs.find((d) => d.docType === "selfie");
  const panDoc = input.docs.find((d) => d.docType === "pan");

  const aadhaar = input.aadhaarDone
    ? aadhaarDoc?.verified
      ? "completed"
      : "pending_manual_review"
    : aadhaarDoc
      ? "in_progress"
      : "not_started";

  const face = input.faceDone
    ? selfieDoc?.verified
      ? "completed"
      : "pending_manual_review"
    : selfieDoc
      ? "in_progress"
      : "not_started";

  let pan: OnboardingStepStatus = "skipped";
  if (input.hasPanDoc || panDoc) {
    pan = docStepStatus({
      present: Boolean(panDoc),
      verified: input.panVerified,
      rejected: Boolean(panDoc?.rejectedReason),
    });
  }

  const vehicle = input.vehicleReady
    ? input.vehicleSatisfied
      ? "completed"
      : "pending_manual_review"
    : input.docs.some((d) =>
          ["dl", "dl_front", "rc", "rental_proof", "ev_proof", "onboarding_vehicle_selection"].includes(
            d.docType,
          ),
        )
      ? "in_progress"
      : "not_started";

  const payment: OnboardingStepStatus = input.paymentCompleted
    ? "completed"
    : input.onboardingStage === "PAYMENT" || input.vehicleReady
      ? "in_progress"
      : "not_started";

  const approval: OnboardingStepStatus =
    input.onboardingStage === "ACTIVE"
      ? "completed"
      : input.paymentCompleted &&
          (input.onboardingStage === "APPROVAL" || input.onboardingStage === "PAYMENT")
        ? "pending_manual_review"
        : "not_started";

  return { aadhaar, face, pan, vehicle, payment, approval };
}

async function persistRiderOnboardingProgress(
  riderId: number,
  payload: {
    onboardingProgress: OnboardingProgressMap;
    lastCompletedStep: string | null;
    nextRequiredStep: string | null;
    onboardingProgressPct: number;
  },
): Promise<void> {
  const db = getDb();
  try {
    await (db as any)
      .update(riders)
      .set({
        onboardingProgress: payload.onboardingProgress,
        lastCompletedStep: payload.lastCompletedStep,
        nextRequiredStep: payload.nextRequiredStep,
        onboardingProgressPct: payload.onboardingProgressPct,
        updatedAt: new Date(),
      })
      .where(eq(riders.id, riderId));
  } catch {
    // Columns missing until migration 0457 is applied.
  }
}

async function healRiderOnboardingStageIfNeeded(
  riderId: number,
  flags: {
    identitySubmitted: boolean;
    identityVerified: boolean;
    vehicleReady: boolean;
    vehicleVerified: boolean;
    paymentCompleted: boolean;
  },
): Promise<void> {
  const db = getDb();
  const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return;

  const next = resolveRiderOnboardingStageTransition({
    currentStage: rider.onboardingStage,
    currentKyc: rider.kycStatus,
    currentStatus: rider.status,
    ...flags,
  });
  if (!next.changed) return;

  await db
    .update(riders)
    .set({
      onboardingStage: next.onboardingStage,
      kycStatus: next.kycStatus,
      status: next.status as typeof rider.status,
      updatedAt: new Date(),
    })
    .where(eq(riders.id, riderId));
}

/** True when KYC + vehicle steps are saved and the rider may pay the onboarding fee. */
export async function isOnboardingDocumentsCompleteForPayment(riderId: number): Promise<boolean> {
  const progress = await getRiderOnboardingProgress(riderId);
  if (progress.nextStep !== "payment") return false;
  return (
    progress.completedSteps.includes("aadhaar_name") &&
    progress.completedSteps.includes("pan_selfie")
  );
}

export async function ensureRiderOnboardingStageForPayment(
  riderId: number,
): Promise<{ ready: boolean; message?: string }> {
  const db = getDb();
  const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return { ready: false, message: "Rider not found" };

  const docsReady = await isOnboardingDocumentsCompleteForPayment(riderId);
  if (!docsReady) {
    return {
      ready: false,
      message: "Please complete document submission first",
    };
  }

  if (rider.onboardingStage === "MOBILE_VERIFIED" || rider.onboardingStage === "KYC") {
    await db
      .update(riders)
      .set({ onboardingStage: "PAYMENT", updatedAt: new Date() })
      .where(eq(riders.id, riderId));
  }

  return { ready: true };
}

export function pickResumeOnboardingStep(
  localStep?: string | null,
  serverStep?: RiderOnboardingStepKey | null
): RiderOnboardingStepKey {
  if (!serverStep) {
    return (localStep as RiderOnboardingStepKey) || "method_selection";
  }
  if (!localStep) return serverStep;

  const localIdx = stepIndex(localStep as RiderOnboardingStepKey);
  const serverIdx = stepIndex(serverStep);
  if (localIdx < 0) return serverStep;
  if (serverIdx < 0) return localStep as RiderOnboardingStepKey;
  return serverIdx > localIdx ? serverStep : (localStep as RiderOnboardingStepKey);
}
