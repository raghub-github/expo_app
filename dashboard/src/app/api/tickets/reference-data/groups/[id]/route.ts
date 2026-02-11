/**
 * PATCH /api/tickets/reference-data/groups/[id] - Update ticket group
 * DELETE /api/tickets/reference-data/groups/[id] - Delete (deactivate) ticket group
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireSuperAdmin();
  if (err) return err;
  const { id } = await params;
  const groupId = parseInt(id, 10);
  if (Number.isNaN(groupId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const sql = getSql();
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 0;
    if (body.groupCode !== undefined) {
      idx++; updates.push(`group_code = $${idx}`); values.push(String(body.groupCode).trim());
    }
    if (body.groupName !== undefined) {
      idx++; updates.push(`group_name = $${idx}`); values.push(String(body.groupName).trim());
    }
    if (body.groupDescription !== undefined) {
      idx++; updates.push(`group_description = $${idx}`); values.push(body.groupDescription == null ? null : String(body.groupDescription).trim());
    }
    if (body.parentGroupId !== undefined) {
      idx++; updates.push(`parent_group_id = $${idx}`); values.push(body.parentGroupId == null ? null : Number(body.parentGroupId));
    }
    if (body.displayOrder !== undefined) {
      idx++; updates.push(`display_order = $${idx}`); values.push(body.displayOrder == null ? null : Number(body.displayOrder));
    }
    if (body.serviceType !== undefined) {
      idx++; updates.push(`service_type = $${idx}`); values.push(body.serviceType && ["food", "parcel", "person_ride", "other"].includes(body.serviceType) ? body.serviceType : null);
    }
    if (body.ticketSection !== undefined) {
      idx++; updates.push(`ticket_section = $${idx}`); values.push(body.ticketSection && ["customer", "rider", "merchant", "system"].includes(body.ticketSection) ? body.ticketSection : null);
    }
    if (body.isActive !== undefined) {
      idx++; updates.push(`is_active = $${idx}`); values.push(Boolean(body.isActive));
    }
    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    updates.push("updated_at = NOW()");
    values.push(groupId);
    const sqlClient = sql as any;
    const rows = await sqlClient.unsafe(
      `UPDATE ticket_groups SET ${updates.join(", ")} WHERE id = $${idx + 1} RETURNING id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active, created_at, updated_at`,
      values
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Group not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        id: Number(row.id),
        groupCode: row.group_code,
        groupName: row.group_name,
        groupDescription: row.group_description,
        parentGroupId: row.parent_group_id != null ? Number(row.parent_group_id) : null,
        groupLevel: Number(row.group_level),
        displayOrder: row.display_order != null ? Number(row.display_order) : null,
        serviceType: row.service_type,
        ticketSection: row.ticket_section,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (e) {
    console.error("[PATCH /api/tickets/reference-data/groups]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireSuperAdmin();
  if (err) return err;
  const { id } = await params;
  const groupId = parseInt(id, 10);
  if (Number.isNaN(groupId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const sql = getSql();
    const sqlClient = sql as any;
    const rows = await sqlClient.unsafe(
      "UPDATE ticket_groups SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id",
      [groupId]
    );
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "Group not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: groupId } });
  } catch (e) {
    console.error("[DELETE /api/tickets/reference-data/groups]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
