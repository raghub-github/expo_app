/**
 * GET /api/tickets/reference-data/title-config - List ticket_title_config (super-admin)
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

async function requireSuperAdmin() {
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
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const sql = getSql();
    const sqlClient = sql as any;
    const rows = await sqlClient.unsafe(`
      SELECT
        id,
        ticket_title::text AS ticket_title,
        display_name,
        description,
        applicable_to_ticket_type,
        applicable_to_service_type,
        applicable_to_source,
        default_priority::text AS default_priority,
        default_category::text AS default_category,
        default_auto_assign,
        default_auto_assign_to_agent_id,
        is_active,
        display_order,
        metadata,
        created_at,
        updated_at
      FROM ticket_title_config
      ORDER BY display_order ASC NULLS LAST, display_name ASC
    `);
    const configs = (rows || []).map((r: any) => ({
      id: Number(r.id),
      ticketTitle: r.ticket_title ?? "",
      displayName: r.display_name ?? "",
      description: r.description ?? null,
      applicableToTicketType: r.applicable_to_ticket_type ?? null,
      applicableToServiceType: r.applicable_to_service_type ?? null,
      applicableToSource: r.applicable_to_source ?? null,
      defaultPriority: r.default_priority ?? null,
      defaultCategory: r.default_category ?? null,
      defaultAutoAssign: r.default_auto_assign ?? null,
      defaultAutoAssignToAgentId: r.default_auto_assign_to_agent_id != null ? Number(r.default_auto_assign_to_agent_id) : null,
      isActive: r.is_active == null ? true : Boolean(r.is_active),
      displayOrder: r.display_order != null ? Number(r.display_order) : null,
      metadata: r.metadata ?? {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return NextResponse.json({ success: true, data: { configs } });
  } catch (e) {
    console.error("[GET /api/tickets/reference-data/title-config]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
