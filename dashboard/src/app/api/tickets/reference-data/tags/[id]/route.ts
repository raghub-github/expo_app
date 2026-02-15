/**
 * PATCH /api/tickets/reference-data/tags/[id] - Update ticket tag
 * DELETE /api/tickets/reference-data/tags/[id] - Deactivate ticket tag
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
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 0;
    if (body.tagCode !== undefined) {
      idx++; updates.push(`tag_code = $${idx}`); values.push(String(body.tagCode).trim());
    }
    if (body.tagName !== undefined) {
      idx++; updates.push(`tag_name = $${idx}`); values.push(String(body.tagName).trim());
    }
    if (body.tagDescription !== undefined) {
      idx++; updates.push(`tag_description = $${idx}`); values.push(body.tagDescription == null ? null : String(body.tagDescription).trim());
    }
    if (body.tagColor !== undefined) {
      idx++; updates.push(`tag_color = $${idx}`); values.push(body.tagColor == null ? null : String(body.tagColor).trim());
    }
    if (body.isActive !== undefined) {
      idx++; updates.push(`is_active = $${idx}`); values.push(Boolean(body.isActive));
    }
    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }
    values.push(tagId);
    const sql = getSql();
    const sqlClient = sql as any;
    const rows = await sqlClient.unsafe(
      `UPDATE ticket_tags SET ${updates.join(", ")} WHERE id = $${idx + 1} RETURNING id, tag_code, tag_name, tag_description, tag_color, is_active, created_at`,
      values
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Tag not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        id: Number(row.id),
        tagCode: row.tag_code,
        tagName: row.tag_name,
        tagDescription: row.tag_description,
        tagColor: row.tag_color,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
      },
    });
  } catch (e) {
    console.error("[PATCH /api/tickets/reference-data/tags]", e);
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
  const tagId = parseInt(id, 10);
  if (Number.isNaN(tagId)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const sql = getSql();
    const sqlClient = sql as any;
    const rows = await sqlClient.unsafe(
      "UPDATE ticket_tags SET is_active = false WHERE id = $1 RETURNING id",
      [tagId]
    );
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "Tag not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: tagId } });
  } catch (e) {
    console.error("[DELETE /api/tickets/reference-data/tags]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
