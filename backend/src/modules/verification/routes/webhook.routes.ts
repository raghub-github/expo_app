/**
 * Cashfree webhook receivers — TWO paths for TWO signature schemes.
 *
 * Path 1 · POST /api/webhooks/cashfree/header-signed
 *   For DigiLocker, KYC Links, E-Sign, Video KYC. HMAC-SHA256 over
 *   (`x-webhook-timestamp` + raw body), delivered in `x-webhook-signature`.
 *
 * Path 2 · POST /api/webhooks/cashfree/body-signed
 *   For BAV async and Reverse Penny Drop. HMAC-SHA256 over the sorted
 *   `data` object values concatenated, delivered inside the JSON body as
 *   `envelope.signature`.
 *
 * Both handlers:
 *   1. Look up the active Cashfree config to get the client_secret (HMAC key).
 *   2. Verify the signature.
 *   3. Insert into verification_webhooks with ON CONFLICT DO NOTHING —
 *      that partial-unique index is our idempotency guarantee.
 *   4. Return 200 immediately. Subject-specific application (updating
 *      verification_requests, marking projections) happens in a follow-up
 *      that we've factored out — that job runs in the same request for now
 *      since we're not at scale yet.
 *
 * A signature failure returns 401 and STILL stores the row (with
 * signature_valid=false) so security ops can review.
 */
import type { FastifyPluginAsync } from "fastify";
import { loadCashfreeConfig } from "../cashfree/config.js";
import { verifyHeaderSigned, verifyBodyEmbedded } from "../cashfree/signatures.js";
import { storePayload, tryStoreWebhook, appendEvent, applyOutcome } from "../history.js";
import { getSql } from "../../../db/client.js";
import type { VerificationStatus } from "../types.js";

/** Map Cashfree webhook event_type → our normalized status. */
function statusForEventType(evt: string): VerificationStatus {
  const e = (evt ?? "").toUpperCase();
  if (e.endsWith("_SUCCESS") || e.endsWith("_COMPLETED") || e.endsWith("_VERIFIED")) return "verified";
  if (e.endsWith("_FAILED") || e.endsWith("_FAILURE")) return "failed";
  if (e.endsWith("_REJECTED")) return "rejected";
  if (e.endsWith("_LINK_EXPIRED") || e.endsWith("_EXPIRED")) return "expired";
  if (e.endsWith("_CONSENT_DENIED")) return "consent_denied";
  return "webhook_received";
}

async function findRequestByVerificationId(verificationId: string): Promise<{ id: number; currentStatus: VerificationStatus } | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, status FROM public.verification_requests
     WHERE verification_id = ${verificationId} LIMIT 1
  `) as unknown as Array<{ id: number; status: VerificationStatus }>;
  if (rows.length === 0) return null;
  return { id: Number(rows[0]!.id), currentStatus: rows[0]!.status };
}

export const cashfreeHeaderWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/webhooks/cashfree/header-signed",
    { config: { rawBody: true } },
    async (req, reply) => {
      const raw = (req as { rawBody?: string }).rawBody ?? "";

      let cfg;
      try { cfg = await loadCashfreeConfig(); }
      catch (e) {
        req.log.warn({ err: (e as Error).message }, "cashfree_webhook_no_config");
        return reply.code(503).send({ error: "cashfree_not_configured" });
      }

      const verified = verifyHeaderSigned(raw, {
        signature: req.headers["x-webhook-signature"] as string | string[] | undefined,
        timestamp: req.headers["x-webhook-timestamp"] as string | string[] | undefined,
      }, cfg.clientSecret);

      let envelope: Record<string, unknown>;
      try { envelope = JSON.parse(raw) as Record<string, unknown>; }
      catch { return reply.code(400).send({ error: "invalid_json" }); }

      const verificationId = (envelope.verification_id ?? (envelope.data ? (envelope.data as Record<string, unknown>).verification_id : undefined)) as string | undefined;
      const providerEventId = (envelope.event_id ?? envelope.type ?? null) as string | null;
      const eventType = String(envelope.type ?? envelope.event_type ?? "unknown");
      const eventTime = envelope.event_time ? new Date(String(envelope.event_time)) : null;

      const payloadRef = verificationId
        ? await maybeStoreOrphanPayload(envelope, req)
        : null;
      const webhookRow = await tryStoreWebhook({
        provider: "cashfree",
        providerEventId: providerEventId ?? null,
        eventType,
        verificationId: verificationId ?? "unknown",
        signatureScheme: "header",
        signatureValid: verified.ok,
        eventTime,
        payloadRef,
      });

      if (!verified.ok) {
        req.log.warn({ reason: verified.reason, eventType, verificationId }, "cashfree_header_webhook_bad_sig");
        return reply.code(401).send({ error: "invalid_signature", reason: verified.reason });
      }

      if (!webhookRow.inserted) {
        // Duplicate delivery — already applied.
        return reply.send({ ok: true, duplicate: true });
      }

      if (verificationId) {
        await applyWebhookToRequest(verificationId, webhookRow.id, envelope, eventType, req);
      } else {
        req.log.warn({ eventType }, "cashfree_header_webhook_no_verification_id");
      }

      return reply.send({ ok: true, webhook_id: webhookRow.id });
    },
  );
};

export const cashfreeBodySignedWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/webhooks/cashfree/body-signed",
    { config: { rawBody: true } },
    async (req, reply) => {
      const raw = (req as { rawBody?: string }).rawBody ?? "";

      let cfg;
      try { cfg = await loadCashfreeConfig(); }
      catch (e) {
        req.log.warn({ err: (e as Error).message }, "cashfree_webhook_no_config");
        return reply.code(503).send({ error: "cashfree_not_configured" });
      }

      let envelope: Record<string, unknown>;
      try { envelope = JSON.parse(raw) as Record<string, unknown>; }
      catch { return reply.code(400).send({ error: "invalid_json" }); }

      const verified = verifyBodyEmbedded(envelope, cfg.clientSecret);

      const data = (envelope.data as Record<string, unknown> | undefined) ?? {};
      const verificationId = (data.verification_id ?? envelope.verification_id) as string | undefined;
      // Body-signed webhooks (BAV, RPD) don't ship event_id — synthesise a stable one.
      const providerEventId = (envelope.event_id ?? envelope.event_time ? `${verificationId ?? "unk"}_${envelope.event_time}` : null) as string | null;
      const eventType = String(envelope.event_type ?? envelope.type ?? "unknown");
      const eventTime = envelope.event_time ? new Date(String(envelope.event_time)) : null;

      const payloadRef = await maybeStoreOrphanPayload(envelope, req);
      const webhookRow = await tryStoreWebhook({
        provider: "cashfree",
        providerEventId,
        eventType,
        verificationId: verificationId ?? "unknown",
        signatureScheme: "body_embedded",
        signatureValid: verified.ok,
        eventTime,
        payloadRef,
      });

      if (!verified.ok) {
        req.log.warn({ reason: verified.reason, eventType, verificationId }, "cashfree_body_webhook_bad_sig");
        return reply.code(401).send({ error: "invalid_signature", reason: verified.reason });
      }

      if (!webhookRow.inserted) return reply.send({ ok: true, duplicate: true });

      if (verificationId) {
        await applyWebhookToRequest(verificationId, webhookRow.id, envelope, eventType, req);
      } else {
        req.log.warn({ eventType }, "cashfree_body_webhook_no_verification_id");
      }

      return reply.send({ ok: true, webhook_id: webhookRow.id });
    },
  );
};

/**
 * Payload store — we insert without a known request_id (nullable link).
 * If we later match the verification_id to a request, we update the row.
 */
async function maybeStoreOrphanPayload(envelope: Record<string, unknown>, _req: unknown): Promise<number | null> {
  // Store as an "orphan" payload attached to a synthesised request id of 0
  // is not possible because request_id has a NOT NULL FK — so we defer the
  // payload write until we resolve the request. Callers pass null here.
  void envelope;
  return null;
}

async function applyWebhookToRequest(
  verificationId: string,
  webhookId: number,
  envelope: Record<string, unknown>,
  eventType: string,
  req: { log: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void } },
): Promise<void> {
  const request = await findRequestByVerificationId(verificationId);
  if (!request) {
    req.log.warn({ verificationId, eventType }, "webhook_verification_id_unknown");
    return;
  }

  // Store the webhook body against the discovered request.
  const payloadRef = await storePayload({
    requestId: request.id,
    direction: "webhook",
    body: envelope,
  });

  const status = statusForEventType(eventType);
  await applyOutcome(request.id, {
    status,
    statusReason: `webhook:${eventType}`,
  });
  await appendEvent({
    requestId: request.id,
    eventKind: "webhook_apply",
    fromStatus: request.currentStatus,
    toStatus: status,
    actorType: "webhook",
    payloadRef,
    webhookRef: webhookId,
    details: { eventType },
  });
}
