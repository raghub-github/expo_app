/**
 * GET /api/tickets/reference-data/priorities — list ticket_priorities (super-admin)
 * POST — create priority row
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

export async function GET() {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const sql = getSql();
    const sqlClient = sql as { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };
    const rows = await sqlClient.unsafe(
      `SELECT id, priority_code, priority_name, priority_description, priority_level, display_color, display_icon,
              display_order, default_sla_minutes, is_active, created_at, updated_at
       FROM ticket_priorities
       ORDER BY display_order ASC NULLS LAST, priority_level ASC NULLS LAST, priority_name ASC`
    );
    const priorities = (rows || []).map(mapPriorityRow);
    return NextResponse.json({ success: true, data: { priorities } });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("ticket_priorities") || msg.includes("does not exist")) {
      return NextResponse.json({ success: true, data: { priorities: [] } });
    }
    console.error("[GET /api/tickets/reference-data/priorities]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const body = await request.json();
    const priorityCode = String(body.priorityCode ?? body.priority_code ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? body.display_name ?? body.priority_name ?? "").trim();
    if (!priorityCode || !displayName) {
      return NextResponse.json({ success: false, error: "priorityCode and displayName are required" }, { status: 400 });
    }
    const description = body.description == null ? null : String(body.description).trim() || null;
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : body.sort_order != null ? Number(body.sort_order) : 0;
    const colorHex =
      body.colorHex == null && body.color_hex == null && body.displayColor == null
        ? null
        : String(body.colorHex ?? body.color_hex ?? body.displayColor ?? "").trim() || null;
    let priorityLevel =
      body.priorityLevel != null
        ? Number(body.priorityLevel)
        : body.priority_level != null
          ? Number(body.priority_level)
          : NaN;
    const defaultSla =
      body.defaultSlaMinutes != null
        ? Number(body.defaultSlaMinutes)
        : body.default_sla_minutes != null
          ? Number(body.default_sla_minutes)
          : null;
    const displayIcon =
      body.displayIcon == null && body.display_icon == null
        ? null
        : String(body.displayIcon ?? body.display_icon).trim() || null;
    const sql = getSql();
    const sqlClient = sql as { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };
    if (!Number.isFinite(priorityLevel) || priorityLevel < 1) {
      const maxRow = await sqlClient.unsafe(`SELECT COALESCE(MAX(priority_level), 0) AS m FROM ticket_priorities`);
      const m = Number((maxRow?.[0] as { m?: unknown })?.m ?? 0);
      priorityLevel = (Number.isFinite(m) ? m : 0) + 1;
    }
    const displayOrder = Number.isFinite(sortOrder) ? sortOrder : 0;
    const rows = await sqlClient.unsafe(
      `INSERT INTO ticket_priorities (
         priority_code, priority_name, priority_description, priority_level,
         display_order, display_color, default_sla_minutes, display_icon, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING id, priority_code, priority_name, priority_description, priority_level, display_color, display_icon,
                 display_order, default_sla_minutes, is_active, created_at, updated_at`,
      [
        priorityCode,
        displayName,
        description,
        priorityLevel,
        displayOrder,
        colorHex,
        defaultSla != null && Number.isFinite(defaultSla) ? defaultSla : null,
        displayIcon,
      ]
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { priority: mapPriorityRow(row) } });
  } catch (e) {
    console.error("[POST /api/tickets/reference-data/priorities]", e);
    const msg = String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ success: false, error: "A priority with this code already exists" }, { status: 409 });
    }
    if (msg.includes("ticket_priorities") || msg.includes("does not exist")) {
      return NextResponse.json(
        { success: false, error: "Run DB migration 0194_ticket_priority_definitions_and_title_intake.sql (ticket_priorities)" },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
