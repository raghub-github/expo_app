import { getDb } from "../db/client.js";
import { riderDocuments, riderDocumentFiles, riders, riderOnboardingVehicleTypes } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";

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
  docs: { id: number; docType: string }[],
  filesByDocId: Map<number, { side: string | null }[]>
): boolean {
  const row = docs.find((d) => d.docType === "aadhaar");
  if (!row) return hasDocType(docs, "aadhaar_front") && hasDocType(docs, "aadhaar_back");

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

function readRcNumber(docs: { docType: string; metadata: unknown }[]): string | null {
  const row = docs.find((d) => d.docType === "rc");
  if (!row?.metadata || typeof row.metadata !== "object") return null;
  const rcNumber = (row.metadata as { rcNumber?: string }).rcNumber;
  return typeof rcNumber === "string" && rcNumber.trim() ? rcNumber.trim() : null;
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

/** Riders past document collection (or KYC already approved) must not be routed back to doc upload. */
function resolveNextStepForEstablishedRider(
  rider: { onboardingStage: string; kycStatus: string },
  _completed: RiderOnboardingStepKey[]
): RiderOnboardingStepKey | null {
  if (rider.kycStatus === "APPROVED" || rider.kycStatus === "REVIEW") {
    return "payment";
  }
  const stage = rider.onboardingStage;
  // KYC stage = still uploading Aadhaar / PAN / vehicle docs — do not skip to payment.
  if (stage === "PAYMENT" || stage === "APPROVAL" || stage === "ACTIVE") {
    return "payment";
  }
  return null;
}

export async function getRiderOnboardingProgress(riderId: number): Promise<{
  nextStep: RiderOnboardingStepKey;
  completedSteps: RiderOnboardingStepKey[];
}> {
  const db = getDb();

  const riderRows = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (riderRows.length === 0) {
    return { nextStep: "method_selection", completedSteps: [] };
  }

  const docs = await db
    .select({
      id: riderDocuments.id,
      docType: riderDocuments.docType,
      metadata: riderDocuments.metadata,
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
          })
          .from(riderDocumentFiles)
          .where(inArray(riderDocumentFiles.documentId, docIds))
      : [];

  const filesByDocId = new Map<number, { side: string | null }[]>();
  for (const f of fileRows) {
    const list = filesByDocId.get(f.documentId) ?? [];
    list.push({ side: f.side });
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
  const establishedNext = resolveNextStepForEstablishedRider(rider, completed);
  if (establishedNext) {
    return { nextStep: establishedNext, completedSteps: completed };
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
    // Rider explicitly submitted the current vehicle flow on the final Continue tap.
    nextStep = "payment";
  }

  return { nextStep, completedSteps: completed };
}

/** True when KYC + vehicle steps are saved and the rider may pay the onboarding fee. */
export async function isOnboardingDocumentsCompleteForPayment(riderId: number): Promise<boolean> {
  const db = getDb();
  const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return false;

  if (rider.onboardingStage !== "MOBILE_VERIFIED") return true;
  if (rider.kycStatus === "APPROVED" || rider.kycStatus === "REVIEW") return true;

  const progress = await getRiderOnboardingProgress(riderId);
  if (progress.nextStep !== "payment") return false;
  return (
    progress.completedSteps.includes("aadhaar_name") && progress.completedSteps.includes("pan_selfie")
  );
}

export async function ensureRiderOnboardingStageForPayment(
  riderId: number,
): Promise<{ ready: boolean; message?: string }> {
  const db = getDb();
  const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
  if (!rider) return { ready: false, message: "Rider not found" };

  if (rider.onboardingStage !== "MOBILE_VERIFIED") {
    return { ready: true };
  }

  const docsReady = await isOnboardingDocumentsCompleteForPayment(riderId);
  if (!docsReady) {
    return {
      ready: false,
      message: "Please complete document submission first",
    };
  }

  await db
    .update(riders)
    .set({ onboardingStage: "KYC", updatedAt: new Date() })
    .where(eq(riders.id, riderId));

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
