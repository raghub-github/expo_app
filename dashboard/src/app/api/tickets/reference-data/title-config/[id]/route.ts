/**
 * PATCH /api/tickets/reference-data/title-config/[id] - Update title config row (super-admin)
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await requireSuperAdmin();
  if (err) return err;
  const { id } = await params;
  const configId = parseInt(id, 10);
  if (Number.isNaN(configId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const sql = getSql();
    const sqlClient = sql as any;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 0;
    if (body.isActive !== undefined) {
      idx++;
      updates.push(`is_active = $${idx}`);
      values.push(Boolean(body.isActive));
    }
    if (body.displayName !== undefined) {
      idx++;
      updates.push(`display_name = $${idx}`);
      values.push(String(body.displayName).trim());
    }
    if (body.displayOrder !== undefined) {
      idx++;
      updates.push(`display_order = $${idx}`);
      values.push(body.displayOrder == null ? null : Number(body.displayOrder));
    }
    if (body.description !== undefined) {
      idx++;
      updates.push(`description = $${idx}`);
      values.push(body.description == null ? null : String(body.description).trim());
    }
    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    updates.push("updated_at = NOW()");
    values.push(configId);
    const rows = await sqlClient.unsafe(
      `UPDATE ticket_title_config SET ${updates.join(", ")} WHERE id = $${idx + 1}
       RETURNING id, ticket_title::text AS ticket_title, display_name, description, is_active, display_order, updated_at`,
      values
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Row not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        id: Number(row.id),
        ticketTitle: row.ticket_title ?? "",
        displayName: row.display_name ?? "",
        description: row.description ?? null,
        isActive: Boolean(row.is_active),
        displayOrder: row.display_order != null ? Number(row.display_order) : null,
        updatedAt: row.updated_at,
      },
    });
  } catch (e) {
    console.error("[PATCH /api/tickets/reference-data/title-config]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
