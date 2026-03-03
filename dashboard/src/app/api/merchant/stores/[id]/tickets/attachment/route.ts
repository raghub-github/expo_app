/**
 * GET /api/merchant/stores/[id]/tickets/attachment?storageKey=...
 * Streams the attachment file (for use as img src). Verifies the ticket belongs to this store.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const storageKey = request.nextUrl.searchParams.get("storageKey");
    if (!storageKey || !storageKey.startsWith("tickets/")) {
      return NextResponse.json({ error: "Invalid storageKey" }, { status: 400 });
    }
    const parts = storageKey.split("/");
    const ticketIdStr = parts[1];
    const ticketId = ticketIdStr ? parseInt(ticketIdStr, 10) : NaN;
    if (!Number.isFinite(ticketId)) {
      return NextResponse.json({ error: "Invalid storageKey" }, { status: 400 });
    }

    const sqlClient = getSql();
    const ticketCheck = await sqlClient`
      SELECT id FROM public.unified_tickets WHERE id = ${ticketId} AND merchant_store_id = ${storeId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storageKey);
    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
    }

    const contentType = data.type || "application/octet-stream";
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/tickets/attachment]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
