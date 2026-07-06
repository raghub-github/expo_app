/**
 * R2 mirror worker for verification artifacts.
 *
 * Cashfree ships provider-side URLs with a 24 h expiry (verified live in
 * Phase 2 — see the X-Amz-Expires=86400 query param on DL / Voter photo URLs).
 * If we don't copy those objects to our own R2 within 24 h, we lose the
 * artifact and manual re-review breaks.
 *
 * This worker picks unprocessed `verification_files` rows (r2_mirrored_at
 * IS NULL), downloads the provider URL, uploads to R2 under
 *   verification/<provider>/<verification_id>/artifact_<kind>_<seq>.<ext>
 * and stamps `r2_mirrored_at`.
 *
 * Runs on a cron tick — same lock pattern as the notification poller. Safe
 * to run multiple workers because each row is locked via SKIP LOCKED.
 */
import crypto from "node:crypto";
import { getSql } from "../../../db/client.js";
import { uploadToR2 } from "../../../services/r2/r2Service.js";
import type { FastifyBaseLogger } from "fastify";

type FileRow = {
  id: number;
  request_id: number;
  kind: string;
  provider_url: string;
  content_type: string | null;
  verification_id: string;
  provider: string;
};

/** Download + upload one file. Returns the R2 key on success, throws on failure. */
async function mirrorOne(row: FileRow, logger: FastifyBaseLogger): Promise<{
  r2Key: string; bytes: number; sha256: string;
}> {
  const res = await fetch(row.provider_url);
  if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const ext =
    row.kind === "photo" ? "jpg" :
    row.kind === "xml" ? "xml" :
    row.kind === "pdf" ? "pdf" :
    row.kind === "qr" ? "png" :
    row.kind === "signature" ? "png" : "bin";

  const r2Key = `verification/${row.provider}/${row.verification_id}/artifact_${row.kind}_${row.id}.${ext}`;
  const contentType = row.content_type ?? (ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : "application/octet-stream");

  await uploadToR2(buf, r2Key, contentType);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  logger.info({ r2Key, bytes: buf.length }, "verification_r2_mirror_ok");
  return { r2Key, bytes: buf.length, sha256: sha };
}

/**
 * Pick up to `batchSize` unprocessed files and mirror them.
 * Never throws — errors are logged and the row is left with r2_mirrored_at
 * null so the next tick retries.
 */
export async function runR2MirrorTick(
  logger: FastifyBaseLogger,
  batchSize = 20,
): Promise<{ scanned: number; ok: number; failed: number }> {
  const sql = getSql();
  // Pick rows near their expiry first — that's the deadline pressure that matters.
  const rows = (await sql`
    SELECT f.id, f.request_id, f.kind, f.provider_url, f.content_type,
           r.verification_id, r.provider
      FROM public.verification_files f
      JOIN public.verification_requests r ON r.id = f.request_id
     WHERE f.r2_mirrored_at IS NULL
       AND f.provider_url IS NOT NULL
     ORDER BY f.provider_url_expires_at ASC NULLS LAST, f.id
     FOR UPDATE OF f SKIP LOCKED
     LIMIT ${batchSize}
  `) as unknown as FileRow[];

  let ok = 0, failed = 0;
  for (const row of rows) {
    try {
      const { r2Key, bytes, sha256 } = await mirrorOne(row, logger);
      await sql`
        UPDATE public.verification_files
           SET r2_key = ${r2Key}, r2_mirrored_at = NOW(),
               bytes = ${bytes}, sha256 = ${sha256}
         WHERE id = ${row.id}
      `;
      // Emit an artifact_mirror event for the request's timeline.
      await sql`
        INSERT INTO public.verification_events (request_id, event_kind, to_status, actor_type, details)
        SELECT ${row.request_id}, 'artifact_mirror', status, 'system', ${JSON.stringify({ fileId: row.id, r2Key })}::jsonb
        FROM public.verification_requests WHERE id = ${row.request_id}
      `;
      ok++;
    } catch (e) {
      logger.warn({ err: (e as Error).message, fileId: row.id }, "verification_r2_mirror_failed");
      failed++;
    }
  }
  return { scanned: rows.length, ok, failed };
}
