import { getDb } from "../db/client.js";
import { riderDocuments, riderDocumentFiles, riders } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";

export type RiderOnboardingStepKey =
  | "method_selection"
  | "aadhaar_name"
  | "pan_selfie"
  | "dl_rc"
  | "rental_ev";

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

function vehicleStepComplete(
  docs: { docType: string; metadata: unknown }[],
  flow: "dl_rc" | "rental_ev" | "payment" | null
): boolean {
  if (flow === "payment") return hasDocType(docs, "onboarding_vehicle_selection");
  if (flow === "rental_ev") return rentalEvComplete(docs);
  if (flow === "dl_rc") return dlRcComplete(docs);
  return dlRcComplete(docs) || rentalEvComplete(docs);
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

  if (hasDocType(docs, "pan") && hasDocType(docs, "selfie")) {
    completed.push("pan_selfie");
  }

  const vehicleFlow = readOnboardingVehicleFlow(docs);
  const vehicleDone = vehicleStepComplete(docs, vehicleFlow);

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

  let nextStep: RiderOnboardingStepKey = "method_selection";

  if (!aadhaarComplete(docs, filesByDocId)) {
    nextStep = "aadhaar_name";
  } else if (!hasDocType(docs, "pan") || !hasDocType(docs, "selfie")) {
    nextStep = "pan_selfie";
  } else if (!vehicleDone) {
    if (vehicleFlow === "rental_ev") {
      nextStep = "rental_ev";
    } else {
      nextStep = "dl_rc";
    }
  } else {
    // Vehicle onboarding finished — client routes to payment (no further doc steps).
    nextStep = "rental_ev";
  }

  return { nextStep, completedSteps: completed };
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
