/**
 * verification_* DB write helpers.
 *
 * Everything goes through this file so:
 *   - jsonb columns are always sent as `${JSON.stringify(v)}::jsonb`
 *     (Supabase pooler safe — same lesson we learned in the notifications module),
 *   - the state-machine invariants stay in one place,
 *   - the archival tables (provider_payloads, files) get written consistently.
 */
import { randomUUID } from "node:crypto";
import { getSql } from "../../db/client.js";
import type {
  NormalizedVerification,
  VerificationDocumentKind,
  VerificationProvider,
  VerificationStatus,
  VerificationSubjectKind,
} from "./types.js";

export function newVerificationId(prefix = "verif"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

// ── verification_requests ──────────────────────────────────────────────────

export type CreateRequestArgs = {
  verificationId: string;
  provider: VerificationProvider;
  providerConfigId: number | null;
  documentKind: VerificationDocumentKind;
  subjectType: VerificationSubjectKind;
  subjectId: number;
  riderDocumentId?: number | null;
  merchantDocumentId?: number | null;
  policySnapshotId?: number | null;
  parentRequestId?: number | null;
  attemptNumber?: number;
  createdBy?: number | null;
  providerDedupeBehaviour?: string;
};

export async function createRequest(args: CreateRequestArgs): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO public.verification_requests (
      verification_id, provider, provider_config_id, document_kind,
      subject_type, subject_id, rider_document_id, merchant_document_id,
      policy_snapshot_id, parent_request_id, attempt_number,
      status, provider_dedupe_behaviour, created_by
    ) VALUES (
      ${args.verificationId},
      ${args.provider},
      ${args.providerConfigId ?? null},
      ${args.documentKind},
      ${args.subjectType},
      ${args.subjectId},
      ${args.riderDocumentId ?? null},
      ${args.merchantDocumentId ?? null},
      ${args.policySnapshotId ?? null},
      ${args.parentRequestId ?? null},
      ${args.attemptNumber ?? 1},
      ${"initiated"},
      ${args.providerDedupeBehaviour ?? "enforces_409"},
      ${args.createdBy ?? null}
    )
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return Number(rows[0]!.id);
}

/** Update a request to a terminal / intermediate outcome. */
export async function applyOutcome(requestId: number, outcome: {
  status: VerificationStatus;
  statusReason?: string | null;
  providerReference?: string | null;
  businessIdentifier?: string | null;
  confidence?: number | null;
  httpStatus?: number | null;
  durationMs?: number | null;
}): Promise<void> {
  const sql = getSql();
  // numeric(4,3) — clamp so a bad adapter can never 500 the submit path.
  let confidence: string | null = null;
  if (outcome.confidence != null && Number.isFinite(Number(outcome.confidence))) {
    const c = Math.max(0, Math.min(9.999, Number(outcome.confidence)));
    confidence = c.toFixed(3);
  }
  const statusReason =
    outcome.statusReason == null ? null : String(outcome.statusReason).slice(0, 2000);
  await sql`
    UPDATE public.verification_requests SET
      status              = ${outcome.status},
      status_reason       = ${statusReason},
      provider_reference  = COALESCE(${outcome.providerReference ?? null}, provider_reference),
      business_identifier = COALESCE(${outcome.businessIdentifier ?? null}, business_identifier),
      confidence          = COALESCE(${confidence}, confidence),
      http_status         = COALESCE(${outcome.httpStatus ?? null}, http_status),
      duration_ms         = COALESCE(${outcome.durationMs ?? null}, duration_ms),
      updated_at          = NOW()
    WHERE id = ${requestId}
  `;
}

// ── verification_events (append-only state transitions) ───────────────────

export type AppendEventArgs = {
  requestId: number;
  eventKind:
    | "submit" | "provider_response" | "webhook_apply" | "poll_result"
    | "retry_scheduled" | "retry_started" | "artifact_mirror"
    | "auto_approve" | "manual_review_queued" | "manual_review_resolved"
    | "override" | "fallback_to_manual" | "projection_applied" | "cancelled";
  fromStatus?: VerificationStatus | null;
  toStatus: VerificationStatus;
  actorType: "provider" | "webhook" | "admin" | "system" | "rider" | "merchant";
  actorId?: number | null;
  payloadRef?: number | null;
  webhookRef?: number | null;
  details?: Record<string, unknown>;
};

export async function appendEvent(args: AppendEventArgs): Promise<number> {
  const sql = getSql();
  const details = JSON.stringify(args.details ?? {});
  const rows = (await sql`
    INSERT INTO public.verification_events (
      request_id, event_kind, from_status, to_status, actor_type, actor_id,
      payload_ref, webhook_ref, details
    ) VALUES (
      ${args.requestId}, ${args.eventKind}, ${args.fromStatus ?? null}, ${args.toStatus},
      ${args.actorType}, ${args.actorId ?? null},
      ${args.payloadRef ?? null}, ${args.webhookRef ?? null},
      ${details}::jsonb
    ) RETURNING id
  `) as unknown as Array<{ id: number }>;
  return Number(rows[0]!.id);
}

// ── verification_provider_payloads (raw archive) ──────────────────────────

export async function storePayload(args: {
  requestId: number;
  direction: "request" | "response" | "webhook";
  httpStatus?: number | null;
  headers?: unknown;
  body: unknown;
  bodySha256?: string | null;
}): Promise<number> {
  const sql = getSql();
  // Strip NULs — Postgres jsonb rejects \u0000 inside strings.
  const headers = JSON.stringify(args.headers ?? {}).replace(/\u0000/g, "");
  const body = JSON.stringify(args.body ?? {}).replace(/\u0000/g, "");
  const rows = (await sql`
    INSERT INTO public.verification_provider_payloads (
      request_id, direction, http_status, headers, body, body_sha256
    ) VALUES (
      ${args.requestId}, ${args.direction}, ${args.httpStatus ?? null},
      ${headers}::jsonb, ${body}::jsonb, ${args.bodySha256 ?? null}
    ) RETURNING id
  `) as unknown as Array<{ id: number }>;
  return Number(rows[0]!.id);
}

// ── verification_files (artifact tracking) ────────────────────────────────

export async function trackArtifact(args: {
  requestId: number;
  kind: "photo" | "signature" | "xml" | "pdf" | "qr";
  source: "provider_response" | "webhook" | "digilocker_fetch";
  providerUrl: string | null;
  providerUrlExpiresAt: string | null;
  contentType?: string | null;
}): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO public.verification_files (
      request_id, kind, source, provider_url, provider_url_expires_at, content_type
    ) VALUES (
      ${args.requestId}, ${args.kind}, ${args.source},
      ${args.providerUrl}, ${args.providerUrlExpiresAt}, ${args.contentType ?? null}
    ) RETURNING id
  `) as unknown as Array<{ id: number }>;
  return Number(rows[0]!.id);
}

// ── verification_webhooks (with idempotency) ──────────────────────────────

export async function tryStoreWebhook(args: {
  provider: VerificationProvider;
  providerEventId: string | null;
  eventType: string;
  verificationId: string;
  signatureScheme: "header" | "body_embedded";
  signatureValid: boolean;
  eventTime: Date | null;
  payloadRef: number | null;
}): Promise<{ id: number; inserted: boolean }> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO public.verification_webhooks (
      provider, provider_event_id, event_type, verification_id,
      signature_scheme, signature_valid, event_time, payload_ref
    ) VALUES (
      ${args.provider}, ${args.providerEventId}, ${args.eventType}, ${args.verificationId},
      ${args.signatureScheme}, ${args.signatureValid}, ${args.eventTime ?? null},
      ${args.payloadRef ?? null}
    )
    ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  if (rows.length === 0) {
    // Duplicate — fetch the pre-existing row.
    const existing = (await sql`
      SELECT id FROM public.verification_webhooks
       WHERE provider = ${args.provider} AND provider_event_id = ${args.providerEventId}
       LIMIT 1
    `) as unknown as Array<{ id: number }>;
    return { id: Number(existing[0]!.id), inserted: false };
  }
  return { id: Number(rows[0]!.id), inserted: true };
}

/** Persist the normalized outcome + all archival rows in one transaction-ish sequence. */
export async function persistOutcome(
  requestId: number,
  outcome: NormalizedVerification,
  opts?: { deferProjection?: boolean },
): Promise<void> {
  const payloadRefReq = await storePayload({
    requestId,
    direction: "request",
    body: outcome.rawRequest ?? {},
  });
  const payloadRefRes = await storePayload({
    requestId,
    direction: "response",
    httpStatus: outcome.httpStatus,
    headers: outcome.responseHeaders,
    body: outcome.rawResponse ?? {},
  });

  await applyOutcome(requestId, {
    status: outcome.status,
    statusReason: outcome.statusReason,
    providerReference: outcome.providerReference,
    businessIdentifier: outcome.businessIdentifier,
    confidence: outcome.confidence,
    httpStatus: outcome.httpStatus,
    durationMs: outcome.durationMs,
  });

  await appendEvent({
    requestId,
    eventKind: "provider_response",
    fromStatus: "initiated",
    toStatus: outcome.status,
    actorType: "provider",
    payloadRef: payloadRefRes,
    details: {
      requestPayloadRef: payloadRefReq,
      verifiedData: outcome.verifiedData,
      deferProjection: !!opts?.deferProjection,
    },
  });

  // Track any provider-issued artifacts so the R2 mirror worker can pick them up.
  for (const art of outcome.providerArtifacts) {
    await trackArtifact({
      requestId,
      kind: art.kind,
      source: "provider_response",
      providerUrl: art.url,
      providerUrlExpiresAt: art.expiresAt,
      contentType: art.contentType ?? null,
    });
  }

  // Emit kyc.decision on terminal outcomes so the notification bus can push
  // the correct template to the user. Reject / verify only — non-terminal
  // statuses (initiated, pending_provider, awaiting_consent, …) don't ring.
  // Agent "deferProjection" keeps rider/merchant docs untouched until Approve.
  if (outcome.status === "verified" || outcome.status === "rejected") {
    if (opts?.deferProjection) {
      await appendEvent({
        requestId,
        eventKind: "manual_review_queued",
        fromStatus: outcome.status,
        toStatus: "manual_review",
        actorType: "admin",
        details: { reason: "agent_defer_projection" },
      });
      return;
    }
    await emitKycDecisionForRequest(requestId, outcome.status, outcome.documentKind, outcome.statusReason);
    await projectOutcomeToDocuments(requestId, outcome);
  }
}

/**
 * Apply a DigiLocker (or other async) poll/webhook terminal result without
 * re-running the original provider create call.
 */
export async function applyAsyncTerminalOutcome(
  requestId: number,
  fromStatus: VerificationStatus,
  outcome: NormalizedVerification,
): Promise<void> {
  const payloadRef = await storePayload({
    requestId,
    direction: "response",
    httpStatus: outcome.httpStatus,
    headers: outcome.responseHeaders,
    body: outcome.rawResponse ?? {},
  });

  await applyOutcome(requestId, {
    status: outcome.status,
    statusReason: outcome.statusReason,
    providerReference: outcome.providerReference,
    businessIdentifier: outcome.businessIdentifier,
    confidence: outcome.confidence,
    httpStatus: outcome.httpStatus,
    durationMs: outcome.durationMs,
  });

  await appendEvent({
    requestId,
    eventKind: "poll_result",
    fromStatus,
    toStatus: outcome.status,
    actorType: "system",
    payloadRef,
    details: { verifiedData: outcome.verifiedData },
  });

  if (
    outcome.status === "verified" ||
    outcome.status === "rejected" ||
    outcome.status === "expired" ||
    outcome.status === "consent_denied" ||
    outcome.status === "failed"
  ) {
    if (outcome.status === "verified" || outcome.status === "rejected") {
      await emitKycDecisionForRequest(
        requestId,
        outcome.status === "verified" ? "verified" : "rejected",
        outcome.documentKind,
        outcome.statusReason,
      );
    }
    await projectOutcomeToDocuments(requestId, outcome);
  }
}

/**
 * Mirror the terminal auto-verify result onto the pre-existing document
 * projection tables so the rider app's KYC status pill (and the merchant
 * onboarding UI) reflect the Cashfree decision without a separate query.
 *
 * The projection columns rider_documents.verified / verification_status are
 * what the /v1/rider/me/documents endpoint returns, so writing here is what
 * makes the pill flip from "Under review" → "Verified".
 */
async function projectOutcomeToDocuments(
  requestId: number,
  outcome: NormalizedVerification,
): Promise<void> {
  const sql = getSql();
  try {
    const row = (await sql`
      SELECT subject_type::text AS subject_type, subject_id, provider_reference, verification_id
        FROM public.verification_requests WHERE id = ${requestId}
    `) as unknown as Array<{
      subject_type: string; subject_id: number;
      provider_reference: string | null; verification_id: string;
    }>;
    if (row.length === 0) return;
    const r = row[0]!;
    const verified = outcome.status === "verified";
    const summary: Record<string, unknown> = {
      verifiedData: outcome.verifiedData ?? null,
      provider: outcome.provider,
      confidence: outcome.confidence,
    };

    if (r.subject_type === "rider") {
      // rider_documents: one row per doc_type. Composite docs (aadhaar_front/back,
      // dl_front/back) match both sides; we UPDATE any row of the matching type.
      const docKindToDocTypes: Record<string, string[]> = {
        pan: ["pan"],
        aadhaar: ["aadhaar", "aadhaar_front", "aadhaar_back"],
        aadhaar_digilocker: ["aadhaar", "aadhaar_front", "aadhaar_back"],
        driving_licence: ["dl", "dl_front", "dl_back"],
        vehicle_rc: ["rc"],
        bank_account: ["bank_proof"],
      };
      const targetTypes = docKindToDocTypes[outcome.documentKind];
      if (!targetTypes) return;
      const verificationStatus = verified ? "auto_verified" : "rejected";
      const verificationMethod = verified ? "APP_VERIFIED" : "MANUAL_UPLOAD";
      const verifiedData =
        outcome.verifiedData && typeof outcome.verifiedData === "object"
          ? (outcome.verifiedData as Record<string, unknown>)
          : {};
      const isVehicleRc = outcome.documentKind === "vehicle_rc";
      const isBankAccount = outcome.documentKind === "bank_account";
      // Identity docs: person name. RC: registered vehicle owner. Bank: name_at_bank.
      const holderName = isVehicleRc
        ? String(
            verifiedData.owner ||
              verifiedData.owner_name ||
              verifiedData.name ||
              verifiedData.holder_name ||
              "",
          ).trim()
        : isBankAccount
          ? String(
              verifiedData.name_at_bank ||
                verifiedData.name ||
                verifiedData.holder_name ||
                verifiedData.registered_name ||
                "",
            ).trim()
          : String(
              verifiedData.name ||
                verifiedData.holder_name ||
                verifiedData.registered_name ||
                verifiedData.full_name ||
                "",
            ).trim();
      let dobIso: string | null = null;
      // RC/bank have no reliable rider DOB — never project onto identity.
      if (!isVehicleRc && !isBankAccount) {
        const dobRaw = String(verifiedData.dob || verifiedData.date_of_birth || "").trim();
        const ymd = dobRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (ymd) dobIso = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
        else {
          const dmy = dobRaw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (dmy) {
            dobIso = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
          }
        }
      }

      // Keep rider_documents.doc_number + riders.* in sync with provider payload
      // (same fields the rider-app onboarding save-step writes).
      const businessId = String(outcome.businessIdentifier ?? "").trim();
      let projectedDocNumber: string | null = null;
      let projectedPan: string | null = null;
      let projectedAadhaar: string | null = null;
      let bankIfsc: string | null = null;
      if (outcome.documentKind === "pan") {
        const pan = String(verifiedData.pan || businessId || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
          projectedDocNumber = pan;
          projectedPan = pan;
        }
      } else if (
        outcome.documentKind === "aadhaar" ||
        outcome.documentKind === "aadhaar_digilocker"
      ) {
        const aadhaar = String(
          verifiedData.masked_aadhaar ||
            verifiedData.aadhaar_number ||
            verifiedData.uid ||
            businessId ||
            "",
        ).replace(/\D/g, "");
        if (aadhaar.length >= 4) {
          projectedDocNumber = aadhaar;
          if (/^\d{12}$/.test(aadhaar)) projectedAadhaar = aadhaar;
        }
      } else if (outcome.documentKind === "driving_licence") {
        const dl = String(verifiedData.dl_number || businessId || "")
          .trim()
          .toUpperCase();
        if (dl.length >= 6) projectedDocNumber = dl;
      } else if (outcome.documentKind === "vehicle_rc") {
        const rc = String(verifiedData.reg_no || businessId || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        if (rc.length >= 4) projectedDocNumber = rc;
      } else if (outcome.documentKind === "bank_account") {
        const rawReq =
          outcome.rawRequest && typeof outcome.rawRequest === "object" && !Array.isArray(outcome.rawRequest)
            ? (outcome.rawRequest as Record<string, unknown>)
            : {};
        const acct = String(
          rawReq.bank_account ||
            rawReq.bankAccount ||
            verifiedData.bank_account ||
            verifiedData.account_number ||
            "",
        ).replace(/\D/g, "");
        bankIfsc = String(rawReq.ifsc || verifiedData.ifsc || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "") || null;
        if (acct.length >= 4) {
          projectedDocNumber = `•••• ${acct.slice(-4)}`;
          verifiedData.account_number_masked = projectedDocNumber;
        }
        if (bankIfsc) verifiedData.ifsc = bankIfsc;
      }

      const sideVerification =
        verified &&
        (outcome.documentKind === "aadhaar" || outcome.documentKind === "aadhaar_digilocker")
          ? {
              front: {
                verified: true,
                verificationStatus: "approved",
                verifiedAt: new Date().toISOString(),
              },
              back: {
                verified: true,
                verificationStatus: "approved",
                verifiedAt: new Date().toISOString(),
              },
            }
          : null;

      // Detect RC plate change so we can clear stale photo + force-replace fields.
      let rcPlateChanged = false;
      let existingRcDocId: number | null = null;
      if (isVehicleRc && projectedDocNumber) {
        const existingRc = (await sql`
          SELECT id, doc_number, file_url
          FROM public.rider_documents
          WHERE rider_id = ${r.subject_id}
            AND doc_type = 'rc'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        `) as unknown as Array<{
          id: number;
          doc_number: string | null;
          file_url: string | null;
        }>;
        if (existingRc.length > 0) {
          existingRcDocId = Number(existingRc[0]!.id);
          const prev = String(existingRc[0]!.doc_number || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
          rcPlateChanged = Boolean(prev) && prev !== projectedDocNumber;
        }
      }

      const updated = await sql`
        UPDATE public.rider_documents
           SET verified = ${verified},
               verification_status = ${verificationStatus}::document_verification_status,
               verification_method = ${verificationMethod}::verification_method,
               rejected_reason = ${verified ? null : outcome.statusReason},
               verified_at = ${verified ? new Date().toISOString() : null},
               requires_manual_review = ${verified ? false : true},
               last_verification_id = ${r.verification_id},
               last_provider_reference = ${r.provider_reference},
               extracted_data_summary = ${JSON.stringify(summary)}::jsonb,
               extracted_name = CASE
                 WHEN ${isVehicleRc || isBankAccount}::boolean
                   THEN ${holderName || null}
                 ELSE COALESCE(${holderName || null}, extracted_name)
               END,
               extracted_dob = COALESCE(${dobIso}::date, extracted_dob),
               doc_number = CASE
                 WHEN ${(isVehicleRc || isBankAccount) && Boolean(projectedDocNumber)}::boolean
                   THEN ${projectedDocNumber}
                 ELSE COALESCE(
                   NULLIF(${projectedDocNumber}, ''),
                   doc_number
                 )
               END,
               metadata = CASE
                 WHEN ${sideVerification != null}::boolean
                   THEN COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
                     digilockerVerified: verified,
                     sideVerification,
                     ...(projectedPan ? { panNumber: projectedPan } : {}),
                     ...(projectedAadhaar ? { aadhaarNumber: projectedAadhaar } : {}),
                     ...(projectedDocNumber && outcome.documentKind === "driving_licence"
                       ? {
                           dlNumber: projectedDocNumber,
                           cashfreeVerifiedData: verifiedData,
                           cashfreeProvider: "cashfree",
                           identityDocument: true,
                         }
                       : {}),
                     ...(projectedDocNumber && outcome.documentKind === "vehicle_rc"
                       ? {
                           rcNumber: projectedDocNumber,
                           ...(holderName ? { rcOwnerName: holderName } : {}),
                           cashfreeVerifiedData: verifiedData,
                           cashfreeProvider: "cashfree",
                           vehicleVerificationOnly: true,
                         }
                       : {}),
                     ...(outcome.documentKind === "bank_account"
                       ? {
                           ...(projectedDocNumber
                             ? { bankAccountMasked: projectedDocNumber }
                             : {}),
                           ...(bankIfsc ? { ifsc: bankIfsc } : {}),
                           ...(holderName ? { bankHolderName: holderName } : {}),
                           cashfreeVerifiedData: verifiedData,
                           cashfreeProvider: "cashfree",
                           bankVerificationOnly: true,
                         }
                       : {}),
                   })}::jsonb
                 ELSE COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
                   digilockerVerified: verified,
                   ...(projectedPan ? { panNumber: projectedPan } : {}),
                   ...(projectedAadhaar ? { aadhaarNumber: projectedAadhaar } : {}),
                   ...(projectedDocNumber && outcome.documentKind === "driving_licence"
                     ? {
                         dlNumber: projectedDocNumber,
                         cashfreeVerifiedData: verifiedData,
                         cashfreeProvider: "cashfree",
                         identityDocument: true,
                       }
                     : {}),
                   ...(projectedDocNumber && outcome.documentKind === "vehicle_rc"
                     ? {
                         rcNumber: projectedDocNumber,
                         ...(holderName ? { rcOwnerName: holderName } : {}),
                         cashfreeVerifiedData: verifiedData,
                         cashfreeProvider: "cashfree",
                         vehicleVerificationOnly: true,
                       }
                     : {}),
                   ...(outcome.documentKind === "bank_account"
                     ? {
                         ...(projectedDocNumber
                           ? { bankAccountMasked: projectedDocNumber }
                           : {}),
                         ...(bankIfsc ? { ifsc: bankIfsc } : {}),
                         ...(holderName ? { bankHolderName: holderName } : {}),
                         cashfreeVerifiedData: verifiedData,
                         cashfreeProvider: "cashfree",
                         bankVerificationOnly: true,
                       }
                     : {}),
                 })}::jsonb
               END,
               file_url = CASE
                 WHEN ${rcPlateChanged && verified}::boolean
                   THEN 'electronic_verified'
                 WHEN ${isBankAccount && verified}::boolean
                   AND (
                     file_url IS NULL
                     OR btrim(file_url) = ''
                     OR lower(file_url) IN ('pending', 'n/a', 'electronic_verified')
                   )
                   THEN 'electronic_verified'
                 ELSE file_url
               END,
               updated_at = NOW()
         WHERE rider_id = ${r.subject_id}
           AND doc_type::text = ANY(${targetTypes})
         RETURNING id
      `;

      // Stale RC photo sides must not stick after plate correction — DB + R2 bucket.
      if (rcPlateChanged && verified && existingRcDocId != null) {
        try {
          const { purgeRiderRcDocumentMedia } = await import(
            "../../lib/clear-rider-rc-media-on-plate-replace.js"
          );
          await purgeRiderRcDocumentMedia(existingRcDocId);
        } catch (fileErr) {
          console.warn(
            "[verification.projectOutcomeToDocuments] clear RC media (R2) failed:",
            (fileErr as Error).message,
          );
          try {
            await sql`
              DELETE FROM public.rider_document_files
              WHERE document_id = ${existingRcDocId}
            `;
          } catch {
            /* ignore */
          }
        }
      }

      // DigiLocker / electronic verify often completes before Continue creates the row — upsert then.
      if ((!updated || (updated as unknown[]).length === 0) && verified) {
        if (
          outcome.documentKind === "aadhaar" ||
          outcome.documentKind === "aadhaar_digilocker"
        ) {
          await sql`
            INSERT INTO public.rider_documents (
              rider_id, doc_type, file_url, doc_number, verified, verification_status, verification_method,
              verified_at, requires_manual_review, last_verification_id, last_provider_reference,
              extracted_data_summary, extracted_name, extracted_dob, metadata
            ) VALUES (
              ${r.subject_id},
              'aadhaar',
              'digilocker_verified',
              ${projectedDocNumber},
              TRUE,
              'auto_verified'::document_verification_status,
              'APP_VERIFIED'::verification_method,
              ${new Date().toISOString()},
              FALSE,
              ${r.verification_id},
              ${r.provider_reference},
              ${JSON.stringify(summary)}::jsonb,
              ${holderName || null},
              ${dobIso}::date,
              ${JSON.stringify({
                digilockerVerified: true,
                sideVerification,
                ...(projectedAadhaar ? { aadhaarNumber: projectedAadhaar } : {}),
              })}::jsonb
            )
          `;
        } else if (outcome.documentKind === "pan" && projectedPan) {
          await sql`
            INSERT INTO public.rider_documents (
              rider_id, doc_type, file_url, doc_number, verified, verification_status, verification_method,
              verified_at, requires_manual_review, last_verification_id, last_provider_reference,
              extracted_data_summary, extracted_name, extracted_dob, metadata
            ) VALUES (
              ${r.subject_id},
              'pan',
              'electronic_verified',
              ${projectedPan},
              TRUE,
              'auto_verified'::document_verification_status,
              'APP_VERIFIED'::verification_method,
              ${new Date().toISOString()},
              FALSE,
              ${r.verification_id},
              ${r.provider_reference},
              ${JSON.stringify(summary)}::jsonb,
              ${holderName || null},
              ${dobIso}::date,
              ${JSON.stringify({ panNumber: projectedPan, digilockerVerified: false })}::jsonb
            )
          `;
        } else if (outcome.documentKind === "driving_licence" && projectedDocNumber) {
          await sql`
            INSERT INTO public.rider_documents (
              rider_id, doc_type, file_url, doc_number, verified, verification_status, verification_method,
              verified_at, requires_manual_review, last_verification_id, last_provider_reference,
              extracted_data_summary, extracted_name, extracted_dob, metadata
            ) VALUES (
              ${r.subject_id},
              'dl',
              'electronic_verified',
              ${projectedDocNumber},
              TRUE,
              'auto_verified'::document_verification_status,
              'APP_VERIFIED'::verification_method,
              ${new Date().toISOString()},
              FALSE,
              ${r.verification_id},
              ${r.provider_reference},
              ${JSON.stringify(summary)}::jsonb,
              ${holderName || null},
              ${dobIso}::date,
              ${JSON.stringify({
                dlNumber: projectedDocNumber,
                cashfreeVerifiedData: verifiedData,
                cashfreeProvider: "cashfree",
                identityDocument: true,
              })}::jsonb
            )
          `;
        } else if (outcome.documentKind === "vehicle_rc" && projectedDocNumber) {
          await sql`
            INSERT INTO public.rider_documents (
              rider_id, doc_type, file_url, doc_number, verified, verification_status, verification_method,
              verified_at, requires_manual_review, last_verification_id, last_provider_reference,
              extracted_data_summary, extracted_name, extracted_dob, metadata
            ) VALUES (
              ${r.subject_id},
              'rc',
              'electronic_verified',
              ${projectedDocNumber},
              TRUE,
              'auto_verified'::document_verification_status,
              'APP_VERIFIED'::verification_method,
              ${new Date().toISOString()},
              FALSE,
              ${r.verification_id},
              ${r.provider_reference},
              ${JSON.stringify(summary)}::jsonb,
              ${holderName || null},
              ${dobIso}::date,
              ${JSON.stringify({
                rcNumber: projectedDocNumber,
                ...(holderName ? { rcOwnerName: holderName } : {}),
                cashfreeVerifiedData: verifiedData,
                cashfreeProvider: "cashfree",
                vehicleVerificationOnly: true,
              })}::jsonb
            )
          `;
        } else if (outcome.documentKind === "bank_account" && verified) {
          await sql`
            INSERT INTO public.rider_documents (
              rider_id, doc_type, file_url, doc_number, verified, verification_status, verification_method,
              verified_at, requires_manual_review, last_verification_id, last_provider_reference,
              extracted_data_summary, extracted_name, extracted_dob, metadata
            ) VALUES (
              ${r.subject_id},
              'bank_proof',
              'electronic_verified',
              ${projectedDocNumber},
              TRUE,
              'auto_verified'::document_verification_status,
              'APP_VERIFIED'::verification_method,
              ${new Date().toISOString()},
              FALSE,
              ${r.verification_id},
              ${r.provider_reference},
              ${JSON.stringify(summary)}::jsonb,
              ${holderName || null},
              NULL,
              ${JSON.stringify({
                ...(projectedDocNumber
                  ? { bankAccountMasked: projectedDocNumber }
                  : {}),
                ...(bankIfsc ? { ifsc: bankIfsc } : {}),
                ...(holderName ? { bankHolderName: holderName } : {}),
                cashfreeVerifiedData: verifiedData,
                cashfreeProvider: "cashfree",
                bankVerificationOnly: true,
              })}::jsonb
            )
          `;
        }
      }

      // Rider profile identity (name + DOB) is Aadhaar-only.
      // PAN/DL may verify and store on documents, but must never overwrite riders.name/dob.
      // RC never touches riders identity (vehicle ownership).
      const isAadhaarIdentity =
        outcome.documentKind === "aadhaar" ||
        outcome.documentKind === "aadhaar_digilocker";
      const projectName = isAadhaarIdentity ? holderName || null : null;
      const projectDob = isAadhaarIdentity ? dobIso : null;

      if (
        verified &&
        !isVehicleRc &&
        (projectName || projectDob || projectedPan || projectedAadhaar)
      ) {
        await sql`
          UPDATE public.riders
             SET name = COALESCE(${projectName}, name),
                 dob = COALESCE(${projectDob}::date, dob),
                 pan_number = COALESCE(${projectedPan}, pan_number),
                 aadhaar_number = COALESCE(${projectedAadhaar}, aadhaar_number),
                 updated_at = NOW()
           WHERE id = ${r.subject_id}
             AND deleted_at IS NULL
        `;
      }

      // Vehicle verification → rider_vehicles profile (make/model/fuel/reg/…).
      if (verified && isVehicleRc) {
        try {
          const { upsertRiderVehicleFromRcVerifiedData } = await import(
            "../../lib/rider-vehicle-from-rc.js"
          );
          // On plate correction, never reuse the previous RC photo URL.
          let urlCandidate: string | null = null;
          if (!rcPlateChanged) {
            const rcDocRows = await sql`
              SELECT file_url
              FROM public.rider_documents
              WHERE rider_id = ${r.subject_id}
                AND doc_type = 'rc'
              ORDER BY updated_at DESC NULLS LAST
              LIMIT 1
            `;
            const rawUrl = String(rcDocRows[0]?.file_url ?? "").trim();
            urlCandidate =
              rawUrl &&
              rawUrl !== "electronic_verified" &&
              rawUrl !== "n/a" &&
              rawUrl !== "pending"
                ? rawUrl
                : null;
          }
          await upsertRiderVehicleFromRcVerifiedData({
            riderId: r.subject_id,
            verifiedData,
            rcDocumentUrl: urlCandidate,
          });
        } catch (vehicleErr) {
          console.warn(
            "[verification.projectOutcomeToDocuments] rider_vehicles RC project failed:",
            (vehicleErr as Error).message,
          );
        }
      }

      // Aadhaar/PAN electronic → auto-verify selfie when already uploaded.
      if (verified) {
        try {
          const { maybeAutoVerifyRiderSelfie } = await import(
            "../../lib/rider-selfie-auto-verify.js"
          );
          await maybeAutoVerifyRiderSelfie(r.subject_id);
        } catch (selfieErr) {
          console.warn(
            "[verification.projectOutcomeToDocuments] selfie auto-verify failed:",
            (selfieErr as Error).message,
          );
        }
      }
      return;
    }

    if (r.subject_type === "merchant_store") {
      // merchant_store_documents is WIDE — one row per store with per-doc columns
      // (pan_is_verified, gst_is_verified, etc.). Map verification_document_kind
      // → column prefix, then flip that prefix's is_verified + verified_at.
      const docKindToMerchantPrefix: Record<string, string> = {
        pan: "pan",
        gstin: "gst",
        aadhaar: "aadhaar",
        aadhaar_digilocker: "aadhaar",
      };
      const prefix = docKindToMerchantPrefix[outcome.documentKind];
      if (!prefix) return;
      const method =
        outcome.provider === "cashfree" ? "CASHFREE_AUTO" : "MANUAL_UPLOAD";
      const summaryEntry = {
        verifiedData: outcome.verifiedData ?? null,
        provider: outcome.provider,
        confidence: outcome.confidence,
        method,
        status: outcome.status,
      };
      // Dynamic column names are pool-safe with sql.unsafe for identifiers; but
      // to stay on the ORM-tagged path we write three explicit branches. Adding
      // a new prefix means one more branch here — intentional friction so the
      // wide-column projection stays visible.
      if (prefix === "pan") {
        const existingSummary = (await sql`
          SELECT extracted_data_summary, pan_document_metadata
            FROM public.merchant_store_documents WHERE store_id = ${r.subject_id}
        `) as unknown as Array<{ extracted_data_summary: unknown; pan_document_metadata: unknown }>;
        const prev = existingSummary[0]?.extracted_data_summary;
        const prevMeta = existingSummary[0]?.pan_document_metadata;
        const nextSummary = {
          ...(prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {}),
          pan: { ...summaryEntry, updated_at: new Date().toISOString() },
        };
        const nextMeta = {
          ...(prevMeta && typeof prevMeta === "object" && !Array.isArray(prevMeta) ? (prevMeta as Record<string, unknown>) : {}),
          auto_verification: {
            method,
            status: outcome.status,
            verified_at: new Date().toISOString(),
            verified_data: outcome.verifiedData ?? {},
            document_number: outcome.businessIdentifier,
            verification_id: r.verification_id,
            provider_reference: r.provider_reference,
          },
        };
        const registered =
          outcome.verifiedData && typeof (outcome.verifiedData as { registered_name?: unknown }).registered_name === "string"
            ? String((outcome.verifiedData as { registered_name: string }).registered_name)
            : null;
        await sql`
          UPDATE public.merchant_store_documents
             SET pan_is_verified = ${verified},
                 pan_verified_at = ${verified ? new Date().toISOString() : null},
                 pan_rejection_reason = ${verified ? null : outcome.statusReason},
                 pan_verification_method = ${verified ? method : null},
                 pan_holder_name = COALESCE(${registered}, pan_holder_name),
                 pan_document_metadata = ${JSON.stringify(nextMeta)}::jsonb,
                 last_verification_id = ${r.verification_id},
                 last_provider_reference = ${r.provider_reference},
                 extracted_data_summary = ${JSON.stringify(nextSummary)}::jsonb,
                 updated_at = NOW()
           WHERE store_id = ${r.subject_id}
        `;
      } else if (prefix === "gst") {
        const existingSummary = (await sql`
          SELECT extracted_data_summary, gst_document_metadata
            FROM public.merchant_store_documents WHERE store_id = ${r.subject_id}
        `) as unknown as Array<{ extracted_data_summary: unknown; gst_document_metadata: unknown }>;
        const prev = existingSummary[0]?.extracted_data_summary;
        const prevMeta = existingSummary[0]?.gst_document_metadata;
        const nextSummary = {
          ...(prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {}),
          gstin: { ...summaryEntry, updated_at: new Date().toISOString() },
        };
        const nextMeta = {
          ...(prevMeta && typeof prevMeta === "object" && !Array.isArray(prevMeta) ? (prevMeta as Record<string, unknown>) : {}),
          auto_verification: {
            method,
            status: outcome.status,
            verified_at: new Date().toISOString(),
            verified_data: outcome.verifiedData ?? {},
            document_number: outcome.businessIdentifier,
            verification_id: r.verification_id,
            provider_reference: r.provider_reference,
          },
        };
        await sql`
          UPDATE public.merchant_store_documents
             SET gst_is_verified = ${verified},
                 gst_verified_at = ${verified ? new Date().toISOString() : null},
                 gst_rejection_reason = ${verified ? null : outcome.statusReason},
                 gst_verification_method = ${verified ? method : null},
                 gst_document_metadata = ${JSON.stringify(nextMeta)}::jsonb,
                 last_verification_id = ${r.verification_id},
                 last_provider_reference = ${r.provider_reference},
                 extracted_data_summary = ${JSON.stringify(nextSummary)}::jsonb,
                 updated_at = NOW()
           WHERE store_id = ${r.subject_id}
        `;
      } else if (prefix === "aadhaar") {
        const existingSummary = (await sql`
          SELECT extracted_data_summary, aadhaar_document_metadata, aadhaar_document_number
            FROM public.merchant_store_documents WHERE store_id = ${r.subject_id}
        `) as unknown as Array<{
          extracted_data_summary: unknown;
          aadhaar_document_metadata: unknown;
          aadhaar_document_number: string | null;
        }>;
        const prev = existingSummary[0]?.extracted_data_summary;
        const prevMeta = existingSummary[0]?.aadhaar_document_metadata;
        const { maskAadhaarNumber, normalizeAadhaarVerifiedDetails } = await import("../../lib/mask-aadhaar.js");
        const normalized = normalizeAadhaarVerifiedDetails(
          (outcome.verifiedData as Record<string, unknown>) || null,
        );
        const existingNum = existingSummary[0]?.aadhaar_document_number || "";
        const maskedNumber =
          normalized.maskedAadhaar ||
          maskAadhaarNumber(String(outcome.businessIdentifier || existingNum || ""));
        const nextSummary = {
          ...(prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {}),
          aadhaar: { ...summaryEntry, updated_at: new Date().toISOString() },
        };
        const nextMeta = {
          ...(prevMeta && typeof prevMeta === "object" && !Array.isArray(prevMeta) ? (prevMeta as Record<string, unknown>) : {}),
          auto_verification: {
            method,
            status: outcome.status,
            verified_at: new Date().toISOString(),
            verified_data: outcome.verifiedData ?? {},
            verification_id: r.verification_id,
            provider_reference: r.provider_reference,
          },
        };
        await sql`
          UPDATE public.merchant_store_documents
             SET aadhaar_is_verified = ${verified},
                 aadhaar_verified_at = ${verified ? new Date().toISOString() : null},
                 aadhaar_verification_method = ${verified ? method : null},
                 aadhaar_document_metadata = ${JSON.stringify(nextMeta)}::jsonb,
                 aadhaar_document_number = CASE
                   WHEN ${maskedNumber || null}::text IS NOT NULL AND ${maskedNumber || null}::text <> ''
                     THEN ${maskedNumber || null}
                   ELSE aadhaar_document_number
                 END,
                 aadhaar_holder_name = CASE
                   WHEN ${normalized.name || null}::text IS NOT NULL AND ${normalized.name || null}::text <> ''
                     THEN ${normalized.name || null}
                   ELSE aadhaar_holder_name
                 END,
                 last_verification_id = ${r.verification_id},
                 last_provider_reference = ${r.provider_reference},
                 extracted_data_summary = ${JSON.stringify(nextSummary)}::jsonb,
                 updated_at = NOW()
           WHERE store_id = ${r.subject_id}
        `;
      }
    }
  } catch (e) {
    console.warn("[verification.projectOutcomeToDocuments] failed:", (e as Error).message);
  }
}

/**
 * Resolve subject_type + subject_id → user_id (firebase uid) and fire
 * `kyc.decision` on the notification bus. Safe swallow — a lookup miss
 * shouldn't nuke the verification write.
 */
async function emitKycDecisionForRequest(
  requestId: number,
  status: "verified" | "rejected",
  documentKind: string,
  reason: string | null,
): Promise<void> {
  const sql = getSql();
  try {
    const row = (await sql`
      SELECT r.subject_type::text AS subject_type, r.subject_id
        FROM public.verification_requests r WHERE r.id = ${requestId}
    `) as unknown as Array<{ subject_type: string; subject_id: number }>;
    if (row.length === 0) return;
    const s = row[0]!;

    let userId: string | null = null;
    let role: "rider" | "merchant" | null = null;
    if (s.subject_type === "rider") {
      // Riders don't have a user_id column — the notification system keys off
      // the mobile that the rider app registered its expo push token against.
      const u = (await sql`SELECT mobile FROM public.riders WHERE id = ${s.subject_id}`) as unknown as Array<{ mobile: string | null }>;
      userId = u[0]?.mobile ?? null;
      role = "rider";
    } else if (s.subject_type === "merchant_store") {
      // Same pattern as targetResolver.userIdsForStore — go through merchant_parents.
      const u = (await sql`
        SELECT p.supabase_user_id AS user_id
          FROM public.merchant_stores s
          INNER JOIN public.merchant_parents p ON p.id = s.parent_id
         WHERE s.id = ${s.subject_id} AND p.supabase_user_id IS NOT NULL
      `) as unknown as Array<{ user_id: string | null }>;
      userId = u[0]?.user_id ?? null;
      role = "merchant";
    }
    if (!userId || !role) return;

    // Lazy import — the notifications module isn't a dependency of the
    // verification module and we don't want a circular import at boot.
    const { emitEvent } = await import("../notifications/eventBus.js");
    emitEvent("kyc.decision", {
      userId,
      role,
      docType: documentKind,
      decision: status === "verified" ? "APPROVED" : "REJECTED",
      reason: reason ?? undefined,
    });
  } catch (e) {
    console.warn("[verification.emitKycDecision] failed:", (e as Error).message);
  }
}
