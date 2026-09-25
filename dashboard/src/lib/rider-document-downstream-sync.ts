/**
 * Downstream projections after a rider_documents verify/reject.
 * Keeps secondary tables (vehicles, payment methods) aligned with the
 * canonical document row so pending aggregates stay consistent for EVERY doc type.
 */

import { getDb } from "@/lib/db/client";
import { riderDocuments, riderPaymentMethods, riderVehicles } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  isCanonicallyVerified,
  logDocVerify,
  normalizeDocType,
  type DocVerificationAction,
} from "@/lib/rider-document-verification-pipeline";

function normalizePlate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return v.length >= 4 ? v : null;
}

async function syncVehicleFromRcDocument(params: {
  riderId: number;
  doc: {
    id: number;
    docNumber?: string | null;
    vehicleId?: number | null;
    verified?: boolean | null;
    verificationStatus?: string | null;
  };
  agentId: number;
  action: DocVerificationAction;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const plate = normalizePlate(params.doc.docNumber);
  const markVerified = params.action === "approve" && isCanonicallyVerified(params.doc);

  const vehicles = await db
    .select()
    .from(riderVehicles)
    .where(eq(riderVehicles.riderId, params.riderId))
    .orderBy(desc(riderVehicles.isActive), desc(riderVehicles.updatedAt));

  // Prefer explicit vehicleId, then plate match, then active vehicle.
  const target =
    (params.doc.vehicleId
      ? vehicles.find((v) => v.id === params.doc.vehicleId)
      : undefined) ??
    (plate
      ? vehicles.find((v) => normalizePlate(v.registrationNumber) === plate)
      : undefined) ??
    vehicles.find((v) => v.isActive) ??
    vehicles[0];

  if (!target) {
    logDocVerify({
      event: "downstream_vehicle_skip",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: "rc",
      reason: "no_vehicle_row",
      action: params.action,
    });
    return;
  }

  const retired = ["retired", "replaced", "deleted"].includes(
    String(target.vehicleActiveStatus || "").toLowerCase(),
  );
  if (retired) {
    logDocVerify({
      event: "downstream_vehicle_skip",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: "rc",
      vehicleId: target.id,
      reason: "vehicle_retired",
      action: params.action,
    });
    return;
  }

  if (markVerified) {
    if (target.verified === true) {
      if (!params.doc.vehicleId) {
        await db
          .update(riderDocuments)
          .set({ vehicleId: target.id, updatedAt: now })
          .where(eq(riderDocuments.id, params.doc.id));
      }
      return;
    }
    await db
      .update(riderVehicles)
      .set({
        verified: true,
        verifiedAt: now,
        verifiedBy: params.agentId > 0 ? params.agentId : target.verifiedBy,
        ...(plate && !normalizePlate(target.registrationNumber)
          ? { registrationNumber: plate }
          : {}),
        updatedAt: now,
      })
      .where(eq(riderVehicles.id, target.id));

    if (!params.doc.vehicleId) {
      await db
        .update(riderDocuments)
        .set({ vehicleId: target.id, updatedAt: now })
        .where(eq(riderDocuments.id, params.doc.id));
    }

    logDocVerify({
      event: "downstream_vehicle_verified",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: "rc",
      vehicleId: target.id,
      verificationMethod: "MANUAL",
      verifiedBy: params.agentId,
    });
    return;
  }

  if (target.verified === true) {
    await db
      .update(riderVehicles)
      .set({
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
        updatedAt: now,
      })
      .where(eq(riderVehicles.id, target.id));

    logDocVerify({
      event: "downstream_vehicle_unverified",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: "rc",
      vehicleId: target.id,
      action: params.action,
      verifiedBy: params.agentId,
    });
  }
}

async function syncBankPaymentMethodFromProof(params: {
  riderId: number;
  doc: { id: number };
  agentId: number;
  action: DocVerificationAction;
  rejectionReason?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();

  const [linked] = await db
    .select()
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, params.riderId),
        eq(riderPaymentMethods.methodType, "bank"),
        eq(riderPaymentMethods.proofDocumentId, params.doc.id),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .orderBy(desc(riderPaymentMethods.updatedAt))
    .limit(1);

  let target = linked;
  if (!target) {
    const [latest] = await db
      .select()
      .from(riderPaymentMethods)
      .where(
        and(
          eq(riderPaymentMethods.riderId, params.riderId),
          eq(riderPaymentMethods.methodType, "bank"),
          isNull(riderPaymentMethods.deletedAt),
        ),
      )
      .orderBy(desc(riderPaymentMethods.updatedAt))
      .limit(1);
    target = latest;
  }

  if (!target) {
    logDocVerify({
      event: "downstream_bank_skip",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: "bank_proof",
      reason: "no_payment_method",
      action: params.action,
    });
    return;
  }

  if (params.action === "approve") {
    await db
      .update(riderPaymentMethods)
      .set({
        verificationStatus: "verified",
        verifiedAt: now,
        verifiedBy: params.agentId,
        proofDocumentId: params.doc.id,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(riderPaymentMethods.id, target.id));

    logDocVerify({
      event: "downstream_bank_verified",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: "bank_proof",
      paymentMethodId: target.id,
      verificationMethod: "MANUAL",
      verifiedBy: params.agentId,
    });
    return;
  }

  await db
    .update(riderPaymentMethods)
    .set({
      verificationStatus: "rejected",
      verifiedAt: null,
      verifiedBy: params.agentId,
      rejectionReason: params.rejectionReason ?? "Document rejected",
      proofDocumentId: params.doc.id,
      updatedAt: now,
    })
    .where(eq(riderPaymentMethods.id, target.id));

  logDocVerify({
    event: "downstream_bank_rejected",
    riderId: params.riderId,
    documentId: params.doc.id,
    documentType: "bank_proof",
    paymentMethodId: target.id,
    action: params.action,
    verifiedBy: params.agentId,
  });
}

/**
 * Run after rider_documents row is updated for ANY supported document type.
 * No-ops for types without a secondary table; always safe to call.
 */
export async function syncDownstreamAfterDocumentChange(params: {
  riderId: number;
  doc: {
    id: number;
    docType: string;
    docNumber?: string | null;
    vehicleId?: number | null;
    verified?: boolean | null;
    verificationStatus?: string | null;
  };
  agentId: number;
  action: DocVerificationAction;
  rejectionReason?: string | null;
}): Promise<void> {
  const type = normalizeDocType(params.doc.docType);

  try {
    if (type === "rc") {
      await syncVehicleFromRcDocument({
        riderId: params.riderId,
        doc: params.doc,
        agentId: params.agentId,
        action: params.action,
      });
      return;
    }

    if (type === "bank_proof") {
      await syncBankPaymentMethodFromProof({
        riderId: params.riderId,
        doc: params.doc,
        agentId: params.agentId,
        action: params.action,
        rejectionReason: params.rejectionReason,
      });
      return;
    }

    logDocVerify({
      event: "downstream_noop",
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: type,
      action: params.action,
    });
  } catch (err) {
    console.warn("[DOC_VERIFY] downstream sync failed", {
      riderId: params.riderId,
      documentId: params.doc.id,
      documentType: type,
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Self-heal: verified RC docs should mark matching vehicles verified. */
export async function healVehicleVerifiedFromRcDocuments(
  riderId: number,
): Promise<void> {
  const db = getDb();
  const rcDocs = await db
    .select({
      id: riderDocuments.id,
      docNumber: riderDocuments.docNumber,
      vehicleId: riderDocuments.vehicleId,
      verified: riderDocuments.verified,
      verificationStatus: riderDocuments.verificationStatus,
    })
    .from(riderDocuments)
    .where(
      and(eq(riderDocuments.riderId, riderId), eq(riderDocuments.docType, "rc")),
    );

  for (const doc of rcDocs) {
    if (!isCanonicallyVerified(doc)) continue;
    await syncVehicleFromRcDocument({
      riderId,
      doc,
      agentId: 0,
      action: "approve",
    });
  }
}
