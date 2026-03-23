/**
 * POST /api/merchant/stores/[id]/tickets/[ticketId]/reply
 * Merchant reply: insert message with sender_type MERCHANT. Body: { message?: string, images?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

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

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const images = Array.isArray(body.images)      ? body.images.filter((u: unknown): u is string => typeof u === "string")
      : [];
    if (!message && images.length === 0) {
      return NextResponse.json({ success: false, error: "Message or images required" }, { status: 400 });
    }

    const sqlClient = getSql();
    const ticketCheck = await sqlClient`
      SELECT id, status FROM public.unified_tickets WHERE id = ${ticketId} AND merchant_store_id = ${storeId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }
    const status = String((ticketCheck[0] as { status?: string }).status ?? "").toUpperCase();
    if (status === "CLOSED") {
      return NextResponse.json({ success: false, error: "Ticket is closed" }, { status: 400 });
    }

    const messageText = message + (images.length > 0 ? "\n[IMAGES:" + JSON.stringify(images) + "]" : "");
    const senderName = access.store.store_display_name || access.store.store_name || "Store";

    const attachmentsForDb = images.map((urlOrKey: string) =>
      JSON.stringify({ storageKey: urlOrKey, name: "image", mimeType: "image/jpeg" })
    );

    try {
      const inserted = await sqlClient`
        INSERT INTO public.unified_ticket_messages
          (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note, attachments)
        VALUES (${ticketId}, ${messageText}, 'TEXT', 'MERCHANT', ${storeId}, ${senderName}, false, ${attachmentsForDb})
        RETURNING id
      `;
      const messageId = inserted?.[0] != null ? (inserted[0] as { id: number }).id : null;

      await sqlClient`
        UPDATE public.unified_tickets
        SET last_response_at = NOW(), last_response_by_type = 'MERCHANT', last_response_by_id = ${storeId},
            updated_at = NOW()
        WHERE id = ${ticketId}
      `;

      return NextResponse.json({ success: true, messageId });
    } catch (insErr) {
      if (String(insErr).includes("sender_email") || String(insErr).includes("attachments")) {
        const inserted = await sqlClient`
          INSERT INTO public.unified_ticket_messages
            (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, is_internal_note)
          VALUES (${ticketId}, ${messageText}, 'TEXT', 'MERCHANT', ${storeId}, ${senderName}, false)
          RETURNING id
        `;
        await sqlClient`
          UPDATE public.unified_tickets
          SET last_response_at = NOW(), last_response_by_type = 'MERCHANT', last_response_by_id = ${storeId},
              updated_at = NOW()
          WHERE id = ${ticketId}
        `;
        return NextResponse.json({ success: true, messageId: (inserted?.[0] as { id: number })?.id ?? null });
      }
      throw insErr;
    }
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/tickets/[ticketId]/reply]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
