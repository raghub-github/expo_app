import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

type TemplateType = "quick_reply" | "knowledge_base";

function asTemplateType(v: unknown): TemplateType | null {
  if (v === "quick_reply" || v === "knowledge_base") return v;
  return null;
}

async function requireAuth() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
      return {
        error: NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        ),
      };
    }
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  if (!user?.email) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  const systemUser = await getSystemUserByEmail(user.email);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const [superAdmin, canUpdateManager, canDeleteManager] = await Promise.all([
    isSuperAdmin(user.id, user.email),
    canPerformActionByAuth(user.id, user.email, "TICKET", "UPDATE", "TICKET", {
      access_point_group: "TICKET_QUEUE_MANAGER",
    }),
    canPerformActionByAuth(user.id, user.email, "TICKET", "DELETE", "TICKET", {
      access_point_group: "TICKET_QUEUE_MANAGER",
    }),
  ]);
  const canManage = superAdmin || canUpdateManager || canDeleteManager;
  if (!canManage) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return { systemUser };
}

function parseId(idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return Math.floor(id);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return auth.error;
  const { id: idParam } = await context.params;
  const id = parseId(idParam);
  if (!id) return NextResponse.json({ success: false, error: "Invalid template id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const templateType = body.templateType !== undefined ? asTemplateType(body.templateType) : undefined;
  if (body.templateType !== undefined && !templateType) {
    return NextResponse.json({ success: false, error: "Invalid templateType" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : undefined;
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 5000) : undefined;
  const isActive =
    body.isActive !== undefined ? Boolean(body.isActive) : undefined;
  const sortOrder =
    body.sortOrder !== undefined
      ? Math.max(0, Math.floor(Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0))
      : undefined;

  if (
    templateType === undefined &&
    title === undefined &&
    content === undefined &&
    isActive === undefined &&
    sortOrder === undefined
  ) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      UPDATE public.ticket_response_templates
      SET
        template_type = COALESCE(${templateType ?? null}, template_type),
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        is_active = COALESCE(${isActive ?? null}, is_active),
        sort_order = COALESCE(${sortOrder ?? null}, sort_order),
        updated_by_system_user_id = ${auth.systemUser.id},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, template_type, title, content, sort_order, is_active, updated_at
    `) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        template: {
          id: Number(row.id ?? 0),
          templateType: String(row.template_type ?? ""),
          title: String(row.title ?? ""),
          content: String(row.content ?? ""),
          sortOrder: Number(row.sort_order ?? 0),
          isActive: Boolean(row.is_active),
          updatedAt: row.updated_at ? String(row.updated_at) : null,
        },
      },
    });
  } catch (e) {
    console.error("[PATCH /api/tickets/response-templates/[id]]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return auth.error;
  const { id: idParam } = await context.params;
  const id = parseId(idParam);
  if (!id) return NextResponse.json({ success: false, error: "Invalid template id" }, { status: 400 });

  try {
    const sql = getSql();
    const rows = (await sql`
      DELETE FROM public.ticket_response_templates
      WHERE id = ${id}
      RETURNING id
    `) as Array<Record<string, unknown>>;

    if (!rows[0]) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deletedId: Number(rows[0].id ?? 0) } });
  } catch (e) {
    console.error("[DELETE /api/tickets/response-templates/[id]]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}
