/**
 * GET /api/tickets/reference-data/groups - List all ticket groups (super-admin)
 * POST /api/tickets/reference-data/groups - Create ticket group (super-admin)
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

export async function GET() {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const sql = getSql();
    const sqlClient = sql as any;
    let rows: any[] = [];
    try {
      rows = await sqlClient.unsafe(
        `SELECT id, group_code, group_name, group_description, parent_group_id, group_level, display_order,
               service_type, ticket_section, ticket_category, source_role, is_active, created_at, updated_at
         FROM ticket_groups
         ORDER BY display_order ASC NULLS LAST, group_name ASC`
      );
    } catch {
      rows = await sqlClient.unsafe(
        `SELECT id, group_code, group_name, group_description, parent_group_id, group_level, display_order,
               service_type, ticket_section, is_active, created_at, updated_at
         FROM ticket_groups
         ORDER BY display_order ASC NULLS LAST, group_name ASC`
      );
    }
    const safeRows = Array.isArray(rows) ? rows : [];
    const groupIds = safeRows.map((r: any) => Number(r.id));
    let titlesByGroup: Record<number, Array<{ id: number; titleCode: string; titleText: string; displayOrder: number | null }>> = {};
    if (groupIds.length > 0) {
      const titleRows = await sqlClient.unsafe(
        `SELECT id, group_id, title_code, title_text, display_order FROM ticket_titles WHERE group_id = ANY($1) AND is_active = true ORDER BY group_id, display_order ASC NULLS LAST, title_text ASC`,
        [groupIds]
      );
      for (const t of titleRows || []) {
        const gid = Number(t.group_id);
        if (!titlesByGroup[gid]) titlesByGroup[gid] = [];
        titlesByGroup[gid].push({
          id: Number(t.id),
          titleCode: t.title_code ?? "",
          titleText: t.title_text ?? "",
          displayOrder: t.display_order != null ? Number(t.display_order) : null,
        });
      }
    }
    const groups = safeRows.map((r: any) => ({
      id: Number(r.id),
      groupCode: r.group_code ?? "",
      groupName: r.group_name ?? "",
      groupDescription: r.group_description ?? null,
      parentGroupId: r.parent_group_id != null ? Number(r.parent_group_id) : null,
      groupLevel: Number(r.group_level ?? 1),
      displayOrder: r.display_order != null ? Number(r.display_order) : null,
      serviceType: r.service_type ?? null,
      ticketSection: r.ticket_section ?? null,
      ticketCategory: r.ticket_category ?? null,
      sourceRole: r.source_role ?? null,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      titles: titlesByGroup[Number(r.id)] ?? [],
    }));
    return NextResponse.json({ success: true, data: { groups } });
  } catch (e) {
    console.error("[GET /api/tickets/reference-data/groups]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

const SERVICE_TYPES = ["food", "parcel", "person_ride", "other"];
const TICKET_SECTIONS = ["customer", "rider", "merchant", "system", "other"];
const TICKET_CATEGORIES = ["order_related", "non_order", "other"];
const SOURCE_ROLES = ["customer", "customer_pickup", "customer_drop", "rider", "rider_3pl", "merchant", "system", "provider"];

export async function POST(request: NextRequest) {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const body = await request.json();
    const {
      groupCode,
      groupName,
      groupDescription,
      parentGroupId,
      displayOrder,
      serviceType,
      ticketSection,
      ticketCategory,
      sourceRole,
      titles,
    } = body;
    if (!groupCode?.trim() || !groupName?.trim()) {
      return NextResponse.json({ success: false, error: "groupCode and groupName required" }, { status: 400 });
    }
    const sql = getSql();
    const sqlClient = sql as any;
    let row: any = null;
    try {
      [row] = await sqlClient.unsafe(
        `INSERT INTO ticket_groups (
          group_code, group_name, group_description, parent_group_id, group_level, display_order,
          service_type, ticket_section, ticket_category, source_role, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        RETURNING id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, ticket_category, source_role, is_active, created_at, updated_at`,
        [
          String(groupCode).trim(),
          String(groupName).trim(),
          groupDescription != null ? String(groupDescription).trim() : null,
          parentGroupId != null ? Number(parentGroupId) : null,
          body.groupLevel != null ? Number(body.groupLevel) : 1,
          displayOrder != null ? Number(displayOrder) : null,
          serviceType && SERVICE_TYPES.includes(serviceType) ? serviceType : null,
          ticketSection && TICKET_SECTIONS.includes(ticketSection) ? ticketSection : null,
          ticketCategory && TICKET_CATEGORIES.includes(ticketCategory) ? ticketCategory : null,
          sourceRole && SOURCE_ROLES.includes(sourceRole) ? sourceRole : null,
        ]
      );
    } catch (insertErr: any) {
      if (insertErr?.message?.includes("ticket_category") || insertErr?.message?.includes("source_role")) {
        [row] = await sqlClient.unsafe(
          `INSERT INTO ticket_groups (
            group_code, group_name, group_description, parent_group_id, group_level, display_order,
            service_type, ticket_section, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
          RETURNING id, group_code, group_name, group_description, parent_group_id, group_level, display_order, service_type, ticket_section, is_active, created_at, updated_at`,
          [
            String(groupCode).trim(),
            String(groupName).trim(),
            groupDescription != null ? String(groupDescription).trim() : null,
            parentGroupId != null ? Number(parentGroupId) : null,
            body.groupLevel != null ? Number(body.groupLevel) : 1,
            displayOrder != null ? Number(displayOrder) : null,
            serviceType && SERVICE_TYPES.includes(serviceType) ? serviceType : null,
            ticketSection && TICKET_SECTIONS.includes(ticketSection) ? ticketSection : null,
          ]
        );
      } else throw insertErr;
    }
    if (!row) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }
    const groupId = Number(row.id);
    const serviceTypeVal = row.service_type ?? "other";
    const ticketSectionVal = row.ticket_section ?? "other";
    const sourceRoleVal = row.source_role ?? "system";
    const titleList = Array.isArray(titles) ? titles : [];
    for (let i = 0; i < titleList.length; i++) {
      const t = titleList[i];
      const titleCode = t?.titleCode ?? t?.title_code;
      const titleText = t?.titleText ?? t?.title_text;
      if (!titleCode?.trim() || !titleText?.trim()) continue;
      const uniqueCode = `${String(groupCode).trim().toUpperCase()}_${String(titleCode).trim().toUpperCase()}_${groupId}_${i}`;
      await sqlClient.unsafe(
        `INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, display_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (title_code) DO NOTHING`,
        [groupId, serviceTypeVal, ticketSectionVal, sourceRoleVal, uniqueCode, String(titleText).trim(), i]
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        id: groupId,
        groupCode: row.group_code,
        groupName: row.group_name,
        groupDescription: row.group_description,
        parentGroupId: row.parent_group_id != null ? Number(row.parent_group_id) : null,
        groupLevel: Number(row.group_level),
        displayOrder: row.display_order != null ? Number(row.display_order) : null,
        serviceType: row.service_type,
        ticketSection: row.ticket_section,
        ticketCategory: row.ticket_category,
        sourceRole: row.source_role,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (e) {
    console.error("[POST /api/tickets/reference-data/groups]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
