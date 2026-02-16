/**
 * PATCH /api/tickets/reference-data/groups/[id] - Update ticket group
 * DELETE /api/tickets/reference-data/groups/[id] - Delete (deactivate) ticket group
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
      return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
    }
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
    const sqlClient = sql as any;
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
      idx++; updates.push(`ticket_section = $${idx}`); values.push(body.ticketSection && ["customer", "rider", "merchant", "system", "other"].includes(body.ticketSection) ? body.ticketSection : null);
    }
    const hasTicketCategory = await sqlClient.unsafe(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ticket_groups' AND column_name = 'ticket_category' LIMIT 1`).then((c: any[]) => c?.length > 0);
    if (hasTicketCategory && body.ticketCategory !== undefined) {
      idx++; updates.push(`ticket_category = $${idx}`); values.push(body.ticketCategory && ["order_related", "non_order", "other"].includes(body.ticketCategory) ? body.ticketCategory : null);
    }
    if (hasTicketCategory && body.sourceRole !== undefined) {
      idx++; updates.push(`source_role = $${idx}`); values.push(body.sourceRole && ["customer", "customer_pickup", "customer_drop", "rider", "rider_3pl", "merchant", "system", "provider"].includes(body.sourceRole) ? body.sourceRole : null);
    }
    if (body.isActive !== undefined) {
      idx++; updates.push(`is_active = $${idx}`); values.push(Boolean(body.isActive));
    }
    if (updates.length === 0 && !Array.isArray(body.titles)) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    let row: any = null;
    if (updates.length > 0) {
      updates.push("updated_at = NOW()");
      values.push(groupId);
      const returningCols = "id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active, created_at, updated_at" + (hasTicketCategory ? ", ticket_category, source_role" : "");
      const rows = await sqlClient.unsafe(
        `UPDATE ticket_groups SET ${updates.join(", ")} WHERE id = $${idx + 1} RETURNING ${returningCols}`,
        values
      );
      row = rows?.[0];
    }
    if (!row) {
      const existing = await sqlClient.unsafe(`SELECT id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active, created_at, updated_at${hasTicketCategory ? ", ticket_category, source_role" : ""} FROM ticket_groups WHERE id = $1`, [groupId]);
      row = existing?.[0];
    }
    if (!row) {
      return NextResponse.json({ success: false, error: "Group not found" }, { status: 404 });
    }
    if (Array.isArray(body.titles)) {
      await sqlClient.unsafe("UPDATE ticket_titles SET is_active = false, updated_at = NOW() WHERE group_id = $1", [groupId]);
      const groupCode = row.group_code ?? body.groupCode ?? "GRP";
      const serviceTypeVal = row.service_type ?? body.serviceType ?? "other";
      const ticketSectionVal = row.ticket_section ?? body.ticketSection ?? "other";
      const sourceRoleVal = row.source_role ?? body.sourceRole ?? "system";
      for (let i = 0; i < body.titles.length; i++) {
        const t = body.titles[i];
        const titleCode = t?.titleCode ?? t?.title_code;
        const titleText = t?.titleText ?? t?.title_text;
        if (!titleCode?.trim() || !titleText?.trim()) continue;
        const uniqueCode = `${String(groupCode).trim().toUpperCase()}_${String(titleCode).trim().toUpperCase()}_${groupId}_${i}`;
        await sqlClient.unsafe(
          `INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, display_order, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           ON CONFLICT (title_code) DO UPDATE SET title_text = EXCLUDED.title_text, display_order = EXCLUDED.display_order, is_active = true, updated_at = NOW()`,
          [groupId, serviceTypeVal, ticketSectionVal, sourceRoleVal, uniqueCode, String(titleText).trim(), i]
        );
      }
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
        ticketCategory: row.ticket_category ?? null,
        sourceRole: row.source_role ?? null,
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
