/**
 * PATCH /api/tickets/reference-data/priorities/[id]
 * DELETE — soft-deactivate (is_active = false)
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
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

function mapPriorityRow(r: Record<string, unknown>) {
  const sortOrder =
    r.display_order != null
      ? Number(r.display_order)
      : r.priority_level != null
        ? Number(r.priority_level) * 10
        : 0;
  return {
    id: Number(r.id),
    priorityCode: String(r.priority_code ?? ""),
    displayName: String(r.priority_name ?? ""),
    description: r.priority_description == null ? null : String(r.priority_description),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    colorHex: r.display_color == null ? null : String(r.display_color),
    priorityLevel: r.priority_level != null ? Number(r.priority_level) : null,
    defaultSlaMinutes: r.default_sla_minutes != null ? Number(r.default_sla_minutes) : null,
    displayIcon: r.display_icon == null ? null : String(r.display_icon),
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireSuperAdmin();
  if (err) return err;
  const { id } = await params;
  const pid = parseInt(id, 10);
  if (Number.isNaN(pid)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 0;
    if (body.priorityCode !== undefined || body.priority_code !== undefined) {
      idx++;
      updates.push(`priority_code = $${idx}`);
      values.push(String(body.priorityCode ?? body.priority_code).trim().toLowerCase());
    }
    if (body.displayName !== undefined || body.display_name !== undefined || body.priority_name !== undefined) {
      idx++;
      updates.push(`priority_name = $${idx}`);
      values.push(String(body.displayName ?? body.display_name ?? body.priority_name).trim());
    }
    if (body.description !== undefined || body.priority_description !== undefined) {
      idx++;
      updates.push(`priority_description = $${idx}`);
      const v = body.description ?? body.priority_description;
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.priorityLevel !== undefined || body.priority_level !== undefined) {
      idx++;
      updates.push(`priority_level = $${idx}`);
      const n = Number(body.priorityLevel ?? body.priority_level);
      values.push(Number.isFinite(n) ? n : 0);
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined || body.display_order !== undefined) {
      idx++;
      updates.push(`display_order = $${idx}`);
      const n = Number(body.sortOrder ?? body.sort_order ?? body.display_order);
      values.push(Number.isFinite(n) ? n : 0);
    }
    if (body.colorHex !== undefined || body.color_hex !== undefined || body.displayColor !== undefined) {
      idx++;
      updates.push(`display_color = $${idx}`);
      const v = body.colorHex ?? body.color_hex ?? body.displayColor;
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.defaultSlaMinutes !== undefined || body.default_sla_minutes !== undefined) {
      idx++;
      updates.push(`default_sla_minutes = $${idx}`);
      const n = Number(body.defaultSlaMinutes ?? body.default_sla_minutes);
      values.push(n != null && Number.isFinite(n) ? n : null);
    }
    if (body.displayIcon !== undefined || body.display_icon !== undefined) {
      idx++;
      updates.push(`display_icon = $${idx}`);
      const v = body.displayIcon ?? body.display_icon;
      values.push(v == null ? null : String(v).trim() || null);
    }
    if (body.isActive !== undefined) {
      idx++;
      updates.push(`is_active = $${idx}`);
      values.push(Boolean(body.isActive));
    }
    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    updates.push("updated_at = NOW()");
    values.push(pid);
    const sql = getSql();
    const sqlClient = sql as { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };
    const rows = await sqlClient.unsafe(
      `UPDATE ticket_priorities SET ${updates.join(", ")} WHERE id = $${idx + 1}
       RETURNING id, priority_code, priority_name, priority_description, priority_level, display_color, display_icon,
                 display_order, default_sla_minutes, is_active, created_at, updated_at`,
      values
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: mapPriorityRow(row) });
  } catch (e) {
    console.error("[PATCH /api/tickets/reference-data/priorities/[id]]", e);
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
  const pid = parseInt(id, 10);
  if (Number.isNaN(pid)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const sql = getSql();
    const sqlClient = sql as { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };
    const rows = await sqlClient.unsafe(
      `UPDATE ticket_priorities SET is_active = false, updated_at = NOW() WHERE id = $1
       RETURNING id`,
      [pid]
    );
    if (!rows?.[0]) {
      return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: pid } });
  } catch (e) {
    console.error("[DELETE /api/tickets/reference-data/priorities/[id]]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
