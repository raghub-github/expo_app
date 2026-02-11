/**
 * GET /api/tickets/reference-data/groups - List all ticket groups (super-admin)
 * POST /api/tickets/reference-data/groups - Create ticket group (super-admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const systemUser = await getSystemUserByEmail(session.user.email!);
  if (!systemUser) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }
  const ok = await isSuperAdmin(session.user.id, session.user.email!);
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
    const rows = await sql`
      SELECT id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active, created_at, updated_at
      FROM ticket_groups
      ORDER BY display_order ASC NULLS LAST, group_name ASC
    `;
    const groups = (rows || []).map((r: any) => ({
      id: Number(r.id),
      groupCode: r.group_code ?? "",
      groupName: r.group_name ?? "",
      groupDescription: r.group_description ?? null,
      parentGroupId: r.parent_group_id != null ? Number(r.parent_group_id) : null,
      groupLevel: Number(r.group_level ?? 1),
      displayOrder: r.display_order != null ? Number(r.display_order) : null,
      serviceType: r.service_type ?? null,
      ticketSection: r.ticket_section ?? null,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return NextResponse.json({ success: true, data: { groups } });
  } catch (e) {
    console.error("[GET /api/tickets/reference-data/groups]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const body = await request.json();
    const { groupCode, groupName, groupDescription, parentGroupId, displayOrder, serviceType, ticketSection } = body;
    if (!groupCode || !groupName) {
      return NextResponse.json({ success: false, error: "groupCode and groupName required" }, { status: 400 });
    }
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO ticket_groups (group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active)
      VALUES (
        ${String(groupCode).trim()},
        ${String(groupName).trim()},
        ${groupDescription != null ? String(groupDescription).trim() : null},
        ${parentGroupId != null ? Number(parentGroupId) : null},
        ${body.groupLevel != null ? Number(body.groupLevel) : 1},
        ${displayOrder != null ? Number(displayOrder) : null},
        ${serviceType && ["food", "parcel", "person_ride", "other"].includes(serviceType) ? serviceType : null},
        ${ticketSection && ["customer", "rider", "merchant", "system"].includes(ticketSection) ? ticketSection : null},
        true
      )
      RETURNING id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active, created_at, updated_at
    `;
    if (!row) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }
    const r = row as any;
    return NextResponse.json({
      success: true,
      data: {
        id: Number(r.id),
        groupCode: r.group_code,
        groupName: r.group_name,
        groupDescription: r.group_description,
        parentGroupId: r.parent_group_id != null ? Number(r.parent_group_id) : null,
        groupLevel: Number(r.group_level),
        displayOrder: r.display_order != null ? Number(r.display_order) : null,
        serviceType: r.service_type,
        ticketSection: r.ticket_section,
        isActive: Boolean(r.is_active),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    });
  } catch (e) {
    console.error("[POST /api/tickets/reference-data/groups]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
