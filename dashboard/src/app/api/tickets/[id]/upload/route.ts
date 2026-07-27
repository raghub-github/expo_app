/**
 * POST /api/tickets/[id]/upload
 * Upload attachment(s) for ticket replies. Prefers Cloudflare R2 under
 * tickets/images/{ticketId}/... (bucket root is already docs/ — avoid docs/docs/).
 * Falls back to Supabase Storage "ticket-attachments" when R2 is not configured.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";

/** R2 object key prefix: docs/tickets/images/... in dashboard when bucket root is docs/ */
const R2_TICKET_ATTACHMENTS_PREFIX = "tickets/images";

const BUCKET = "ticket-attachments";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/octet-stream",
  "text/plain",
]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

function buildProxyUrl(r2Key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
}

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY &&
      process.env.R2_SECRET_KEY &&
      process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET_NAME
  );
}

export type TicketUploadAttachment = {
  storageKey: string;
  name: string;
  mimeType: string;
  /** Stable app-relative URL (R2 proxy); never store raw R2 signed URLs */
  url: string;
};

async function uploadToR2(files: File[], ticketId: number): Promise<TicketUploadAttachment[]> {
  const crypto = await import("crypto");
  const validated = files.filter((f): f is File => f instanceof File);
  // Upload in parallel; faster for multiple attachments.
  const results = await Promise.all(
    validated.map(async (file) => {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File ${file.name} exceeds 50MB limit`);
      }
      const mimeType = file.type || "application/octet-stream";
      if (
        !ALLOWED_TYPES.has(mimeType) &&
        !mimeType.startsWith("image/") &&
        !mimeType.startsWith("audio/") &&
        !mimeType.startsWith("video/")
      ) {
        throw new Error(`File type not allowed: ${file.name}`);
      }
      const safeName = sanitizeFileName(file.name);
      const r2Key = `${R2_TICKET_ATTACHMENTS_PREFIX}/${ticketId}/${crypto.randomUUID()}-${safeName}`;
      await uploadWithKey(file, r2Key);
      return {
        storageKey: r2Key,
        name: file.name,
        mimeType,
        url: buildProxyUrl(r2Key),
      } satisfies TicketUploadAttachment;
    }),
  );
  return results;
}

async function uploadToSupabase(files: File[], ticketId: number): Promise<TicketUploadAttachment[]> {
  if (!supabaseAdmin) {
    throw new Error("Storage not configured");
  }

  const { error: bucketError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (bucketError) {
    const msg = String(bucketError.message || "");
    if (!msg.toLowerCase().includes("already exists") && !msg.toLowerCase().includes("duplicate")) {
      console.warn("[ticket upload] createBucket:", bucketError.message);
    }
  }

  const results: TicketUploadAttachment[] = [];
  const crypto = await import("crypto");
  const uuid = () => crypto.randomUUID();

  for (const file of files) {
    if (!(file instanceof File)) continue;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File ${file.name} exceeds 50MB limit`);
    }
    const mimeType = file.type || "application/octet-stream";
    if (
      !ALLOWED_TYPES.has(mimeType) &&
      !mimeType.startsWith("image/") &&
      !mimeType.startsWith("audio/") &&
      !mimeType.startsWith("video/")
    ) {
      throw new Error(`File type not allowed: ${file.name}`);
    }
    const safeName = sanitizeFileName(file.name);
    const storageKey = `tickets/${ticketId}/${uuid()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storageKey, file, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("[ticket upload supabase]", uploadError);
      const isBucketMissing =
        String(uploadError.message).toLowerCase().includes("bucket") &&
        String(uploadError.message).toLowerCase().includes("not found");
      throw new Error(
        isBucketMissing
          ? "Storage bucket 'ticket-attachments' not found. Create it in Supabase Dashboard → Storage → New bucket (private)."
          : uploadError.message || "Upload failed"
      );
    }

    const { data, error: signErr } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storageKey, 3600 * 24 * 7);
    if (signErr || !data?.signedUrl) {
      results.push({ storageKey, name: file.name, mimeType, url: "" });
    } else {
      results.push({
        storageKey,
        name: file.name,
        mimeType,
        url: data.signedUrl,
      });
    }
  }
  return results;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
        return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid ticket ID" }, { status: 400 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files?.length) {
      return NextResponse.json({ success: false, error: "No files provided" }, { status: 400 });
    }

    let results: TicketUploadAttachment[] = [];
    if (r2Configured()) {
      try {
        results = await uploadToR2(files, ticketId);
      } catch (e) {
        console.warn("[ticket upload] R2 failed, trying Supabase:", e);
      }
    }

    if (results.length === 0) {
      try {
        results = await uploadToSupabase(files, ticketId);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        const status =
          message.includes("ticket-attachments") || message.includes("Storage bucket") || message.includes("not configured")
            ? 503
            : 400;
        return NextResponse.json({ success: false, error: message }, { status });
      }
    }

    return NextResponse.json({ success: true, data: { attachments: results } });
  } catch (error) {
    console.error("[POST /api/tickets/[id]/upload] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
