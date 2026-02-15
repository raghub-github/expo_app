/**
 * POST /api/tickets/[id]/upload
 * Upload attachment(s) for a ticket. Files are stored in Supabase Storage bucket "ticket-attachments".
 * Returns array of { storageKey, name, mimeType } to be sent with the message.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

const BUCKET = "ticket-attachments";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/csv", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg",
  "video/mp4", "video/webm", "video/quicktime",
  "application/octet-stream", "text/plain",
]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
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

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
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

    const results: { storageKey: string; name: string; mimeType: string }[] = [];
    const crypto = await import("crypto");
    const uuid = () => crypto.randomUUID();

    for (const file of files) {
      if (!(file instanceof File)) continue;
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `File ${file.name} exceeds 50MB limit` },
          { status: 400 }
        );
      }
      const mimeType = file.type || "application/octet-stream";
      if (!ALLOWED_TYPES.has(mimeType) && !mimeType.startsWith("image/") && !mimeType.startsWith("audio/") && !mimeType.startsWith("video/")) {
        return NextResponse.json(
          { success: false, error: `File type not allowed: ${file.name}` },
          { status: 400 }
        );
      }
      const safeName = sanitizeFileName(file.name);
      const storageKey = `tickets/${ticketId}/${uuid()}-${safeName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(storageKey, file, { contentType: mimeType, upsert: false });

      if (uploadError) {
        console.error("[ticket upload]", uploadError);
        const isBucketMissing = String(uploadError.message).toLowerCase().includes("bucket") && String(uploadError.message).toLowerCase().includes("not found");
        const message = isBucketMissing
          ? "Storage bucket 'ticket-attachments' not found. Create it in Supabase Dashboard → Storage → New bucket (private)."
          : (uploadError.message || "Upload failed");
        return NextResponse.json(
          { success: false, error: message },
          { status: isBucketMissing ? 503 : 500 }
        );
      }
      results.push({ storageKey, name: file.name, mimeType });
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
