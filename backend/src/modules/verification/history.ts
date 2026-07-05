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
}
