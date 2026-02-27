/**
 * POST /api/merchant/stores/[id]/tickets/[ticketId]/upload
 * Upload attachment for a store ticket. Uses Supabase Storage bucket "ticket-attachments".
 * Returns { success, storageKey } (client uses storageKey in reply and for attachment-url).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

const BUCKET = "ticket-attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/octet-stream"]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string }> }
) {
  try {
    const { id, ticketId: ticketIdParam } = await params;
    const storeId = parseInt(id, 10);
    const ticketId = parseInt(ticketIdParam, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(ticketId)) {
      return NextResponse.json({ success: false, error: "Invalid id or ticketId" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const { getSql } = await import("@/lib/db/client");
    const sqlClient = getSql();
    const ticketCheck = await sqlClient`
      SELECT id FROM public.unified_tickets WHERE id = ${ticketId} AND merchant_store_id = ${storeId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: "File exceeds 10MB limit" }, { status: 400 });
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(mimeType) && !mimeType.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "File type not allowed" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
    }

    await supabaseAdmin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });

    const crypto = await import("crypto");
    const safeName = sanitizeFileName(file.name);
    const storageKey = `tickets/${ticketId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storageKey, file, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("[store ticket upload]", uploadError);
      return NextResponse.json(
        { success: false, error: uploadError.message || "Upload failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      storageKey,
      url: storageKey,
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/tickets/[ticketId]/upload]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
