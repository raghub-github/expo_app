/**
 * GET /api/merchant/stores/[id]/tickets/[ticketId]/messages
 * List messages for a ticket that belongs to this store.
 */
import { NextResponse } from "next/server";
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

export async function GET(
  _request: Request,
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

    const sqlClient = getSql();
    const ticketCheck = await sqlClient`
      SELECT id FROM public.unified_tickets WHERE id = ${ticketId} AND merchant_store_id = ${storeId} LIMIT 1
    `;
    if (!ticketCheck || ticketCheck.length === 0) {
      return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
    }

    let msgResult: Record<string, unknown>[] = [];
    try {
      msgResult = await sqlClient`
        SELECT id, ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email,
               attachments, is_internal_note, created_at, updated_at
        FROM public.unified_ticket_messages
        WHERE ticket_id = ${ticketId}
        ORDER BY created_at ASC
      `;
    } catch {
      try {
        msgResult = await sqlClient`
          SELECT id, ticket_id, message_text, message_type, sender_type, sender_id, sender_name,
                 attachments, is_internal_note, created_at, updated_at
          FROM public.unified_ticket_messages
          WHERE ticket_id = ${ticketId}
          ORDER BY created_at ASC
        `;
      } catch {
        return NextResponse.json({ success: true, messages: [] });
      }
    }

    const messages = (msgResult || []).map((m: Record<string, unknown>) => {
      const rawAtt = m.attachments ?? [];
      const attList = Array.isArray(rawAtt) ? rawAtt : [];
      const attachmentUrls = attList.map((item: unknown) => {
        if (item != null && typeof item === "string") {
          if (item.startsWith("{")) {
            try {
              const parsed = JSON.parse(item) as { storageKey?: string; url?: string };
              return parsed.storageKey ?? parsed.url ?? item;
            } catch {
              return item;
            }
          }
          return item;
        }
        if (item != null && typeof item === "object" && "storageKey" in (item as object))
          return (item as { storageKey: string }).storageKey;
        return null;
      }).filter(Boolean) as string[];
      return {
        id: m.id,
        ticket_id: m.ticket_id,
        message_text: m.message_text ?? m.message ?? "",
        message_type: m.message_type ?? "TEXT",
        sender_type: typeof m.sender_type === "string" ? m.sender_type.toUpperCase() : String(m.sender_type ?? "").toUpperCase(),
        sender_id: m.sender_id,
        sender_name: m.sender_name ?? null,
        sender_email: m.sender_email ?? null,
        attachments: attachmentUrls,
        is_internal_note: Boolean(m.is_internal_note),
        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    });

    return NextResponse.json({ success: true, messages });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/tickets/[ticketId]/messages]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
