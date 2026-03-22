/**
 * GET /api/merchant/stores/[id]/tickets
 * List tickets for this store (unified_tickets where merchant_store_id = storeId).
 * Response shape compatible with MX User Insights inbox: { success, tickets }.
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const sqlClient = getSql();
    type Row = Record<string, unknown> & {
      id: number;
      ticket_id: string;
      status: string;
      subject: string;
      description: string;
      priority: string;
      created_at: string;
      resolution?: string | null;
      resolved_at?: string | null;
      resolved_by_name?: string | null;
      satisfaction_rating?: number | null;
      satisfaction_feedback?: string | null;
      satisfaction_collected_at?: string | null;
      attachments?: string[] | null;
      raised_by_name?: string | null;
      ticket_category?: string | null;
      ticket_title?: string | null;
      closed_at?: string | null;
      reopened_at?: string | null;
    };

    let rows: Row[] = [];
    try {
      const result = await sqlClient`
        SELECT
          ut.id, ut.ticket_id, ut.subject, ut.description, ut.priority, ut.status,
          ut.created_at, ut.resolved_at, ut.closed_at, ut.raised_by_name, ut.ticket_category, ut.ticket_title,
          ut.resolution, ut.resolved_by_name, ut.satisfaction_rating, ut.satisfaction_feedback, ut.satisfaction_collected_at,
          ut.attachments, ut.reopened_at
        FROM public.unified_tickets ut
        WHERE ut.merchant_store_id = ${storeId}
        ORDER BY ut.updated_at DESC NULLS LAST, ut.created_at DESC
        LIMIT 500
      `;
      rows = (result || []) as unknown as Row[];
    } catch (colErr) {
      try {
        const result = await sqlClient`
          SELECT
            ut.id, ut.ticket_id, ut.subject, ut.description, ut.priority, ut.status,
            ut.created_at, ut.resolved_at, ut.closed_at, ut.raised_by_name, ut.ticket_category, ut.ticket_title,
            ut.resolution, ut.resolved_by_name, ut.satisfaction_rating, ut.satisfaction_feedback, ut.satisfaction_collected_at,
            ut.attachments
          FROM public.unified_tickets ut
          WHERE ut.merchant_store_id = ${storeId}
          ORDER BY ut.updated_at DESC NULLS LAST, ut.created_at DESC
          LIMIT 500
        `;
        rows = (result || []).map((r: Record<string, unknown>) => ({ ...r, reopened_at: null })) as unknown as Row[];
      } catch {
        return NextResponse.json({ success: true, tickets: [] });
      }
    }

    const tickets = rows.map((r) => {
      const status = String(r.status ?? "OPEN").toUpperCase().trim().replace(/-/g, "_");
      const priority = String(r.priority ?? "MEDIUM").toUpperCase().trim().replace(/-/g, "_");
      const attachments = Array.isArray(r.attachments) ? r.attachments : r.attachments ? [r.attachments] : [];
      return {
        id: r.id,
        ticket_id: String(r.ticket_id ?? ""),
        subject: String(r.subject ?? ""),
        description: String(r.description ?? ""),
        priority,
        status,
        created_at: r.created_at,
        resolved_at: r.resolved_at ?? null,
        closed_at: r.closed_at ?? null,
        resolution: r.resolution ?? null,
        resolved_by_name: r.resolved_by_name ?? null,
        satisfaction_rating: r.satisfaction_rating ?? null,
        satisfaction_feedback: r.satisfaction_feedback ?? null,
        satisfaction_collected_at: r.satisfaction_collected_at ?? null,
        attachments,
        raised_by_name: r.raised_by_name ?? null,
        ticket_category: r.ticket_category ?? null,
        ticket_title: r.ticket_title ?? null,
        reopened_at: r.reopened_at ?? null,
      };
    });

    return NextResponse.json({ success: true, tickets });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/tickets]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
