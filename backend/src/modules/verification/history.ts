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
  await sql`
    UPDATE public.verification_requests SET
      status              = ${outcome.status},
      status_reason       = ${outcome.statusReason ?? null},
      provider_reference  = COALESCE(${outcome.providerReference ?? null}, provider_reference),
      business_identifier = COALESCE(${outcome.businessIdentifier ?? null}, business_identifier),
      confidence          = COALESCE(${outcome.confidence ?? null}, confidence),
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
  const headers = JSON.stringify(args.headers ?? {});
  const body = JSON.stringify(args.body ?? {});
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
    details: { requestPayloadRef: payloadRefReq, verifiedData: outcome.verifiedData },
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
  if (outcome.status === "verified" || outcome.status === "rejected") {
    await emitKycDecisionForRequest(requestId, outcome.status, outcome.documentKind, outcome.statusReason);
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
    if (r.subject_type !== "rider") return; // merchant projection uses a separate table + owner

    // Map verification_document_kind → rider_documents.doc_type. Composite
    // docs (aadhaar_front/back, dl_front/back) match both sides; we UPDATE
    // any row of the matching type for the rider.
    const docKindToDocTypes: Record<string, string[]> = {
      pan: ["pan"],
      aadhaar: ["aadhaar", "aadhaar_front", "aadhaar_back"],
      driving_licence: ["dl", "dl_front", "dl_back"],
      vehicle_rc: ["rc"],
      bank_account: ["bank_proof"],
    };
    const targetTypes = docKindToDocTypes[outcome.documentKind];
    if (!targetTypes) return;

    const verified = outcome.status === "verified";
    const verificationStatus = verified ? "auto_verified" : "rejected";
    const summary: Record<string, unknown> = {
      verifiedData: outcome.verifiedData ?? null,
      provider: outcome.provider,
      confidence: outcome.confidence,
    };

    await sql`
      UPDATE public.rider_documents
         SET verified = ${verified},
             verification_status = ${verificationStatus}::document_verification_status,
             rejected_reason = ${verified ? null : outcome.statusReason},
             verified_at = ${verified ? new Date().toISOString() : null},
             last_verification_id = ${r.verification_id},
             last_provider_reference = ${r.provider_reference},
             extracted_data_summary = ${JSON.stringify(summary)}::jsonb,
             updated_at = NOW()
       WHERE rider_id = ${r.subject_id}
         AND doc_type::text = ANY(${targetTypes})
    `;
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
