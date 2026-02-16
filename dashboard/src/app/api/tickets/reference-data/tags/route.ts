/**
 * GET /api/tickets/reference-data/tags - List all ticket tags (super-admin)
 * POST /api/tickets/reference-data/tags - Create ticket tag (super-admin)
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

export async function GET() {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, tag_code, tag_name, tag_description, tag_color, is_active, created_at
      FROM ticket_tags
      ORDER BY tag_name ASC
    `;
    const tags = (rows || []).map((r: any) => ({
      id: Number(r.id),
      tagCode: r.tag_code ?? "",
      tagName: r.tag_name ?? "",
      tagDescription: r.tag_description ?? null,
      tagColor: r.tag_color ?? null,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    }));
    return NextResponse.json({ success: true, data: { tags } });
  } catch (e) {
    console.error("[GET /api/tickets/reference-data/tags]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const err = await requireSuperAdmin();
  if (err) return err;
  try {
    const body = await request.json();
    const { tagCode, tagName, tagDescription, tagColor } = body;
    if (!tagCode || !tagName) {
      return NextResponse.json({ success: false, error: "tagCode and tagName required" }, { status: 400 });
    }
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO ticket_tags (tag_code, tag_name, tag_description, tag_color, is_active)
      VALUES (
        ${String(tagCode).trim()},
        ${String(tagName).trim()},
        ${tagDescription != null ? String(tagDescription).trim() : null},
        ${tagColor != null ? String(tagColor).trim() : null},
        true
      )
      RETURNING id, tag_code, tag_name, tag_description, tag_color, is_active, created_at
    `;
    if (!row) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }
    const r = row as any;
    return NextResponse.json({
      success: true,
      data: {
        id: Number(r.id),
        tagCode: r.tag_code,
        tagName: r.tag_name,
        tagDescription: r.tag_description,
        tagColor: r.tag_color,
        isActive: Boolean(r.is_active),
        createdAt: r.created_at,
      },
    });
  } catch (e) {
    console.error("[POST /api/tickets/reference-data/tags]", e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
