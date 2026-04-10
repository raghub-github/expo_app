/**
 * Load ticket reply attachment bytes on the server for outbound email (SMTP / Resend).
 * Keys from upload: R2 `tickets/images/{ticketId}/...` or Supabase `tickets/{ticketId}/...`.
 */

import { getObjectByKey } from "@/lib/services/r2";
import { supabaseAdmin } from "@/lib/supabase/server";

const R2_TICKET_IMAGES_PREFIX = "tickets/images/";
const SUPABASE_TICKET_ATTACHMENTS_BUCKET = "ticket-attachments";

function r2EnvConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY &&
      process.env.R2_SECRET_KEY &&
      process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET_NAME
  );
}

export async function loadTicketAttachmentBuffer(
  storageKey: string,
  mimeTypeFallback: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const key = String(storageKey || "").trim();
  if (!key) return null;

  if (r2EnvConfigured() && key.startsWith(R2_TICKET_IMAGES_PREFIX)) {
    const r2 = await getObjectByKey(key);
    if (r2?.buffer?.length) {
      return { buffer: r2.buffer, contentType: r2.contentType || mimeTypeFallback || "application/octet-stream" };
    }
  }

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.storage.from(SUPABASE_TICKET_ATTACHMENTS_BUCKET).download(key);
    if (!error && data) {
      try {
        const buf = Buffer.from(await data.arrayBuffer());
        if (buf.length) return { buffer: buf, contentType: mimeTypeFallback || "application/octet-stream" };
      } catch {
        /* ignore */
      }
    }
  }

  if (r2EnvConfigured()) {
    const r2 = await getObjectByKey(key);
    if (r2?.buffer?.length) {
      return { buffer: r2.buffer, contentType: r2.contentType || mimeTypeFallback || "application/octet-stream" };
    }
  }

  return null;
}
