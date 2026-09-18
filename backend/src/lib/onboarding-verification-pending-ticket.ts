/**
 * After onboarding payment, create a single support ticket titled
 * "Onboarding Verification Pending" when the rider is waiting for review
 * (not yet ACTIVE) and/or still has documents that need agent/manual verification.
 */

import { getSql } from "../db/client.js";
import { getDb } from "../db/client.js";
import { desc, eq } from "drizzle-orm";
import { onboardingPayments, riderDocuments, riders } from "../db/schema.js";
import { resolveRcVerificationState } from "./rider-rc-verification-state.js";
import { resolveTicketTitleForUnifiedTicketsInsert } from "../modules/merchant-partner/unified-ticket-title-for-insert.js";

export const ONBOARDING_VERIFICATION_PENDING_SUBJECT = "Onboarding Verification Pending";
export const ONBOARDING_VERIFICATION_PENDING_TITLE_CODE = "ONBOARDING_VERIFICATION_PENDING";
/** Stable ticket_groups.group_code — display name "Rider-Onboarding-Pending". */
export const RIDER_ONBOARDING_PENDING_GROUP_CODE = "RIDER_ONBOARDING_PENDING";

async function resolveRiderOnboardingPendingGroupId(
  sql: ReturnType<typeof getSql>,
): Promise<number | null> {
  try {
    const rows = await sql`
      SELECT id
      FROM ticket_groups
      WHERE group_code = ${RIDER_ONBOARDING_PENDING_GROUP_CODE}
        AND is_active = TRUE
      LIMIT 1
    `;
    const id = (rows as Array<{ id?: number | string | null }>)[0]?.id;
    if (id == null) return null;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const AUTO_VERIFY_METHOD_RE =
  /CASHFREE|DIGILOCKER|ELECTRONIC|AUTO_VERIF|AADHAAR_MASKING|PAN_NUMBER/i;

function isElectronicStubUrl(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return true;
  if (
    value === "pending" ||
    value === "n/a" ||
    value === "na" ||
    value.startsWith("placeholder") ||
    value.includes("cashfree_") ||
    value.includes("electronic_verified") ||
    value.includes("digilocker_verified") ||
    value.includes("aadhaar_masking_verified") ||
    value === "pan_number_submitted"
  ) {
    return true;
  }
  return false;
}

type DocRow = {
  docType: string | null;
  fileUrl: string | null;
  r2Key: string | null;
  verified: boolean | null;
  verificationMethod: string | null;
  verificationStatus: string | null;
  requiresManualReview: boolean | null;
  metadata: unknown;
};

function readDocMeta(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

/** Second-vehicle RC uploads must not block / demote an already-live rider. */
export function isSecondaryVehicleOnboardingDoc(doc: DocRow): boolean {
  const meta = readDocMeta(doc.metadata);
  if (meta.addAnotherVehicle === true) return true;
  if (String(meta.vehicleIntent || "").toLowerCase() === "add") return true;
  return false;
}

function normalizeDocCode(code: string | null | undefined): string {
  const c = String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  if (
    c === "dl" ||
    c === "driving_licence" ||
    c === "driving_license" ||
    c === "dl_front" ||
    c === "dl_back"
  ) {
    return "dl";
  }
  if (c === "rc" || c === "registration_certificate" || c === "vehicle_rc") {
    return "rc";
  }
  return c;
}

function isSkippedOnboardingDoc(doc: DocRow, skippedDocs: string[]): boolean {
  if (!skippedDocs.length) return false;
  const want = normalizeDocCode(doc.docType);
  return skippedDocs.some((s) => normalizeDocCode(s) === want);
}

/** True when this document still needs human review (not Cashfree auto-success). */
export function documentNeedsManualOnboardingReview(
  doc: DocRow,
  opts?: { skippedDocs?: string[] },
): boolean {
  // Intentionally skipped optional docs (e.g. DL for food) never block activation/KYC.
  if (isSkippedOnboardingDoc(doc, opts?.skippedDocs ?? [])) return false;
  // Extra vehicle RC after the rider is already live — vehicle-level review only.
  if (isSecondaryVehicleOnboardingDoc(doc)) return false;

  if (doc.verified === true) return false;
  const status = String(doc.verificationStatus || "").toLowerCase();
  if (status === "approved" || status === "rejected") return false;

  const method = String(doc.verificationMethod || "");
  const isAutoMethod = AUTO_VERIFY_METHOD_RE.test(method);
  // Cashfree/DigiLocker already auto-succeeded → not a ticket trigger.
  // Do NOT skip unverified auto-method docs (still pending provider / agent).
  if (
    isAutoMethod &&
    !doc.requiresManualReview &&
    (status === "auto_verified" || status === "verified" || status === "success")
  ) {
    return false;
  }

  if (String(doc.docType || "").toLowerCase() === "rc") {
    const rcState = resolveRcVerificationState({
      fileUrl: doc.fileUrl,
      r2Key: doc.r2Key,
      verified: doc.verified,
      verificationMethod: doc.verificationMethod,
      verificationStatus: doc.verificationStatus,
      requiresManualReview: doc.requiresManualReview,
      metadata: doc.metadata,
    });
    if (rcState === "MANUAL_REVIEW_PENDING") return true;
    if (rcState === "AUTO_VERIFIED" || rcState === "MANUAL_VERIFIED") return false;
  }

  if (doc.requiresManualReview === true) return true;

  // Manual upload with a real image still pending agent review.
  const hasRealImage =
    (!isElectronicStubUrl(doc.fileUrl) && Boolean(String(doc.fileUrl || "").trim())) ||
    (!isElectronicStubUrl(doc.r2Key) && Boolean(String(doc.r2Key || "").trim()));
  if (
    hasRealImage &&
    (/MANUAL/i.test(method) || !method || method === "MANUAL_UPLOAD") &&
    (status === "pending" || status === "" || status === "pending_manual_review")
  ) {
    return true;
  }

  // Any remaining unverified KYC/vehicle doc (incl. electronic still in-flight)
  // counts as pending verification after payment.
  const code = normalizeDocCode(doc.docType);
  const isKycOrVehicleDoc =
    code === "aadhaar" ||
    code === "pan" ||
    code === "selfie" ||
    code === "dl" ||
    code === "rc" ||
    code === "rental_proof" ||
    code === "ev_proof" ||
    code === "rental" ||
    code === "ev";
  if (
    isKycOrVehicleDoc &&
    (status === "pending" ||
      status === "" ||
      status === "pending_manual_review" ||
      status === "processing" ||
      status === "in_progress")
  ) {
    return true;
  }

  return false;
}

function readSkippedDocsFromRows(docs: DocRow[]): string[] {
  const selection = docs.find((d) => String(d.docType || "").toLowerCase() === "onboarding_vehicle_selection");
  const meta = readDocMeta(selection?.metadata);
  if (!Array.isArray(meta.skippedOnboardingDocs)) return [];
  return meta.skippedOnboardingDocs.map((c) => String(c || "").trim()).filter(Boolean);
}

/** Pure check used by activation + stage heal (ignores skipped + 2nd-vehicle docs). */
export function docsHaveManualOnboardingVerificationPending(
  docs: DocRow[],
  skippedDocs?: string[],
): boolean {
  const skipped = skippedDocs ?? readSkippedDocsFromRows(docs);
  return docs.some((d) => documentNeedsManualOnboardingReview(d, { skippedDocs: skipped }));
}

export async function riderHasManualOnboardingVerificationPending(
  riderId: number,
): Promise<boolean> {
  const db = getDb();
  const docs = await db
    .select({
      docType: riderDocuments.docType,
      fileUrl: riderDocuments.fileUrl,
      r2Key: riderDocuments.r2Key,
      verified: riderDocuments.verified,
      verificationMethod: riderDocuments.verificationMethod,
      verificationStatus: riderDocuments.verificationStatus,
      requiresManualReview: riderDocuments.requiresManualReview,
      metadata: riderDocuments.metadata,
    })
    .from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));

  return docsHaveManualOnboardingVerificationPending(docs);
}

export type EnsureOnboardingVerificationPendingTicketResult = {
  created: boolean;
  skipped: boolean;
  reason:
    | "created"
    | "already_exists"
    | "no_manual_pending"
    | "payment_incomplete"
    | "rider_not_found"
    | "error";
  ticketId?: string | null;
};

/**
 * Idempotent: at most one open "Onboarding Verification Pending" ticket per rider.
 * Call immediately after payment completes (and as a backfill) whenever the rider
 * still has pending verification / is not yet ACTIVE.
 * Hidden from the rider app; visible to agents on the rider dashboard.
 *
 * ticket_title + subject both use the human-readable title agents search for.
 */
export async function ensureOnboardingVerificationPendingTicket(
  riderId: number,
): Promise<EnsureOnboardingVerificationPendingTicketResult> {
  try {
    const db = getDb();
    const [rider] = await db
      .select({
        id: riders.id,
        name: riders.name,
        mobile: riders.mobile,
        status: riders.status,
        onboardingStage: riders.onboardingStage,
      })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (!rider) {
      return { created: false, skipped: true, reason: "rider_not_found" };
    }

    const needsManual = await riderHasManualOnboardingVerificationPending(riderId);
    const accountStatus = String(rider.status || "").toUpperCase();
    // Paid + not yet ACTIVE → always create (waiting for review), even when Cashfree
    // auto-verify made `needsManual` false. ACTIVE + manual docs still creates.
    if (!needsManual && accountStatus === "ACTIVE") {
      return { created: false, skipped: true, reason: "no_manual_pending" };
    }

    const [payment] = await db
      .select({ status: onboardingPayments.status })
      .from(onboardingPayments)
      .where(eq(onboardingPayments.riderId, riderId))
      .orderBy(desc(onboardingPayments.createdAt))
      .limit(1);
    if (String(payment?.status || "").toLowerCase() !== "completed") {
      return { created: false, skipped: true, reason: "payment_incomplete" };
    }

    // Still create when ACTIVE: eligibility can activate before RC manual review
    // finishes, and agents need the pending-verification ticket either way.

    const sql = getSql();
    const existing = await sql`
      SELECT id, ticket_id, status, group_id
      FROM unified_tickets
      WHERE rider_id = ${riderId}
        AND (
          subject = ${ONBOARDING_VERIFICATION_PENDING_SUBJECT}
          OR COALESCE(metadata->>'onboarding_verification_pending', '') = 'true'
          OR COALESCE(metadata->'rider_help'->>'title_code', '') = ${ONBOARDING_VERIFICATION_PENDING_TITLE_CODE}
        )
        AND status NOT IN (
          'RESOLVED'::unified_ticket_status,
          'CLOSED'::unified_ticket_status
        )
      ORDER BY id DESC
      LIMIT 1
    `;

    const existingRow = (existing as Array<Record<string, unknown>>)[0];
    const groupId = await resolveRiderOnboardingPendingGroupId(sql);

    if (existingRow) {
      // Heal tickets created before the Rider-Onboarding-Pending group existed.
      if (groupId != null && existingRow.group_id == null && existingRow.id != null) {
        try {
          await sql`
            UPDATE unified_tickets
            SET group_id = ${groupId}, updated_at = NOW()
            WHERE id = ${Number(existingRow.id)}
              AND group_id IS NULL
          `;
        } catch (healErr) {
          console.warn("[onboarding-verification-pending-ticket] group heal failed:", healErr);
        }
      }
      return {
        created: false,
        skipped: true,
        reason: "already_exists",
        ticketId: existingRow.ticket_id != null ? String(existingRow.ticket_id) : null,
      };
    }

    const description = needsManual
      ? "One or more onboarding documents are pending manual verification. " +
        "The rider has completed all onboarding steps and payment, and is waiting for review. " +
        "Please verify the pending documents and approve the rider account."
      : "The rider has completed onboarding payment and is waiting for approval. " +
        "Please review their application and activate the rider account.";

    const metadataJson = JSON.stringify({
      onboarding_verification_pending: true,
      /** Internal agent queue only — never list/chat in the rider app. */
      hidden_from_rider: true,
      needs_manual_docs: needsManual,
      waiting_for_approval: accountStatus !== "ACTIVE",
      rider_help: {
        title_code: ONBOARDING_VERIFICATION_PENDING_TITLE_CODE,
        group_code: RIDER_ONBOARDING_PENDING_GROUP_CODE,
        source_platform: "SYSTEM",
        auto_after_payment: true,
        visible_to_rider: false,
      },
    });

    // ticket_source + raised_by_type = RIDER so agent Recent Tickets (dashboard) includes it.
    // Rider app list/chat still filters these out via hidden_from_rider metadata/tags.
    // ticket_title may still be the legacy enum — never bind the human subject there.
    const ticketTitleForInsert = await resolveTicketTitleForUnifiedTicketsInsert(
      sql,
      ONBOARDING_VERIFICATION_PENDING_TITLE_CODE
    );
    const insertRows = await sql`
      INSERT INTO unified_tickets (
        ticket_type, ticket_source, service_type, ticket_title, ticket_category,
        order_id, customer_id, rider_id, merchant_store_id, merchant_parent_id,
        raised_by_type, raised_by_id, raised_by_name, raised_by_mobile, raised_by_email,
        subject, description, priority, status, auto_generated,
        group_id, tags, metadata
      ) VALUES (
        'NON_ORDER_RELATED'::unified_ticket_type,
        'RIDER'::unified_ticket_source,
        'GENERAL'::unified_ticket_service_type,
        ${ticketTitleForInsert},
        'VERIFICATION'::unified_ticket_category,
        NULL,
        NULL,
        ${riderId},
        NULL,
        NULL,
        'RIDER'::unified_ticket_source,
        ${riderId},
        ${rider.name ?? "Rider"},
        ${rider.mobile ?? null},
        NULL,
        ${ONBOARDING_VERIFICATION_PENDING_SUBJECT},
        ${description},
        'MEDIUM'::unified_ticket_priority,
        'OPEN'::unified_ticket_status,
        TRUE,
        ${groupId},
        ARRAY['onboarding_verification_pending','hidden_from_rider']::text[],
        ${metadataJson}::text::jsonb
      )
      RETURNING id, ticket_id
    `;

    const row = (insertRows as Array<Record<string, unknown>>)[0];
    if (!row) {
      return { created: false, skipped: true, reason: "error" };
    }

    return {
      created: true,
      skipped: false,
      reason: "created",
      ticketId: row.ticket_id != null ? String(row.ticket_id) : null,
    };
  } catch (err) {
    console.error("[onboarding-verification-pending-ticket]", err);
    return { created: false, skipped: true, reason: "error" };
  }
}
