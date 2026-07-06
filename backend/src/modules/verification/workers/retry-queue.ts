/**
 * Retry queue worker for verification requests.
 *
 * Retryable Cashfree errors (network, timeout, provider_down, rate_limit,
 * duplicate) are added to verification_retry_queue during
 * `service.runProviderCall`. This worker picks pending rows and re-fires
 * the same submit* method with a fresh verification_id.
 *
 * Same SKIP LOCKED pattern as the R2 mirror worker so multiple worker
 * processes can share the queue without stepping on each other.
 */
import { getSql } from "../../../db/client.js";
import type { FastifyBaseLogger } from "fastify";

type RetryRow = {
  queue_id: number;
  request_id: number;
  attempt_count: number;
  original_verification_id: string;
  document_kind: string;
  subject_type: string;
  subject_id: number;
};

/** Compute the next backoff based on attempt count (exponential capped at 15 min). */
function backoffSeconds(attempts: number, base: number): number {
  const bo = base * Math.pow(2, Math.min(attempts, 6));
  return Math.min(bo, 15 * 60);
}

export async function runRetryQueueTick(
  logger: FastifyBaseLogger,
  batchSize = 10,
): Promise<{ scanned: number; retried: number; exhausted: number }> {
  const sql = getSql();

  const rows = (await sql`
    SELECT q.id AS queue_id, q.request_id, q.attempt_count,
           r.verification_id AS original_verification_id,
           r.document_kind::text AS document_kind,
           r.subject_type::text AS subject_type,
           r.subject_id
      FROM public.verification_retry_queue q
      JOIN public.verification_requests r ON r.id = q.request_id
     WHERE q.status = 'pending'
       AND q.next_attempt_at <= NOW()
     ORDER BY q.next_attempt_at
     FOR UPDATE OF q SKIP LOCKED
     LIMIT ${batchSize}
  `) as unknown as RetryRow[];

  let retried = 0, exhausted = 0;
  for (const row of rows) {
    // Look up the policy for retry limit.
    const policy = (await sql`
      SELECT p.retry_limit, p.retry_backoff_seconds
        FROM public.verification_policies p
       WHERE p.subject_type = ${row.subject_type}::verification_subject_kind
         AND p.document_kind = ${row.document_kind}::verification_document_kind
         AND p.effective_to IS NULL
       LIMIT 1
    `) as unknown as Array<{ retry_limit: number; retry_backoff_seconds: number }>;
    const retryLimit = policy[0]?.retry_limit ?? 2;
    const baseBackoff = policy[0]?.retry_backoff_seconds ?? 30;

    if (row.attempt_count >= retryLimit) {
      await sql`
        UPDATE public.verification_retry_queue
           SET status = 'exhausted', updated_at = NOW()
         WHERE id = ${row.queue_id}
      `;
      // Also flip the parent request to 'fallback_manual' if policy says so.
      await sql`
        UPDATE public.verification_requests
           SET status = 'fallback_manual', updated_at = NOW()
         WHERE id = ${row.request_id} AND status IN ('failed','timeout','provider_down','duplicate','rate_limit'::text)
      `.catch(() => null);
      logger.info({ requestId: row.request_id }, "verification_retry_exhausted");
      exhausted++;
      continue;
    }

    // Mark in_flight, bump the attempt count, and mint a fresh verification_id
    // — Cashfree's DL enforces 409 on duplicate id, so retries MUST use a new one.
    const nextAttempt = row.attempt_count + 1;
    await sql`
      UPDATE public.verification_retry_queue
         SET status = 'in_flight',
             attempt_count = ${nextAttempt},
             locked_by = ${"retry-worker"},
             locked_at = NOW(),
             updated_at = NOW()
       WHERE id = ${row.queue_id}
    `;

    try {
      // The service module is loaded lazily to avoid a circular import.
      const svc = await import("../service.js");
      const args = {
        subjectType: row.subject_type as "rider" | "merchant_store" | "rider_document" | "merchant_document",
        subjectId: Number(row.subject_id),
      };
      let outcome;
      switch (row.document_kind) {
        // Retries need the original submit inputs — those are stored in the
        // original verification_provider_payloads.request row so we can replay.
        case "pan": {
          const orig = await getOriginalRequest(row.request_id, ["pan", "name"]);
          if (!orig) throw new Error("original_request_missing");
          outcome = await svc.submitPan({ ...args, pan: String(orig.pan), name: String(orig.name) });
          break;
        }
        case "driving_licence": {
          const orig = await getOriginalRequest(row.request_id, ["dl_number", "dob"]);
          if (!orig) throw new Error("original_request_missing");
          outcome = await svc.submitDrivingLicence({ ...args, dlNumber: String(orig.dl_number), dob: String(orig.dob) });
          break;
        }
        case "vehicle_rc": {
          const orig = await getOriginalRequest(row.request_id, ["vehicle_number"]);
          if (!orig) throw new Error("original_request_missing");
          outcome = await svc.submitVehicleRc({ ...args, vehicleNumber: String(orig.vehicle_number) });
          break;
        }
        case "ifsc": {
          const orig = await getOriginalRequest(row.request_id, ["ifsc"]);
          if (!orig) throw new Error("original_request_missing");
          outcome = await svc.submitIfsc({ ...args, ifsc: String(orig.ifsc) });
          break;
        }
        // Other doc kinds: fall through to exhausted — they either need extra
        // context (Aadhaar via DigiLocker needs user consent) or aren't
        // retryable here (RPD is user-payment driven).
        default: {
          await sql`UPDATE public.verification_retry_queue SET status = 'exhausted', updated_at = NOW() WHERE id = ${row.queue_id}`;
          exhausted++;
          continue;
        }
      }
      if (outcome.kind === "auto" && (outcome.result.status === "verified" || outcome.result.status === "rejected")) {
        await sql`UPDATE public.verification_retry_queue SET status = 'succeeded', updated_at = NOW() WHERE id = ${row.queue_id}`;
        retried++;
      } else {
        // Still not terminal — schedule another attempt.
        const seconds = backoffSeconds(nextAttempt, baseBackoff);
        await sql`
          UPDATE public.verification_retry_queue
             SET status = 'pending',
                 next_attempt_at = NOW() + (${seconds}::text || ' seconds')::interval,
                 locked_by = NULL, locked_at = NULL,
                 updated_at = NOW()
           WHERE id = ${row.queue_id}
        `;
        retried++;
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, requestId: row.request_id }, "verification_retry_failed");
      const seconds = backoffSeconds(nextAttempt, baseBackoff);
      await sql`
        UPDATE public.verification_retry_queue
           SET status = 'pending', last_error = ${(e as Error).message},
               next_attempt_at = NOW() + (${seconds}::text || ' seconds')::interval,
               locked_by = NULL, locked_at = NULL,
               updated_at = NOW()
         WHERE id = ${row.queue_id}
      `;
    }
  }
  return { scanned: rows.length, retried, exhausted };
}

/** Pull the original request body's fields from the archive. */
async function getOriginalRequest(requestId: number, keys: string[]): Promise<Record<string, unknown> | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT body FROM public.verification_provider_payloads
     WHERE request_id = ${requestId} AND direction = 'request'
     ORDER BY id ASC LIMIT 1
  `) as unknown as Array<{ body: Record<string, unknown> }>;
  if (rows.length === 0) return null;
  const body = rows[0]!.body;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] != null) out[k] = body[k];
  return keys.every((k) => out[k] != null) ? out : null;
}
