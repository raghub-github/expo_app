import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

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
      await signOutIfSessionDead(supabase, userError);
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

  const [superAdmin, canViewManager, canCreateManager, canUpdateManager] = await Promise.all([
    isSuperAdmin(user.id, user.email),
    canPerformActionByAuth(user.id, user.email, "TICKET", "VIEW", "TICKET", {
      access_point_group: "TICKET_QUEUE_MANAGER",
    }),
    canPerformActionByAuth(user.id, user.email, "TICKET", "CREATE", "TICKET", {
      access_point_group: "TICKET_QUEUE_MANAGER",
    }),
    canPerformActionByAuth(user.id, user.email, "TICKET", "UPDATE", "TICKET", {
      access_point_group: "TICKET_QUEUE_MANAGER",
    }),
  ]);

  const canView = superAdmin || canViewManager;
  const canManage = superAdmin || canCreateManager || canUpdateManager;
  if (!canView) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }

  return { user, systemUser, canManage };
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        id,
        template_type,
        title,
        content,
        sort_order,
        is_active,
        updated_at
      FROM public.ticket_response_templates
      WHERE is_active = true
      ORDER BY template_type ASC, sort_order ASC, id ASC
    `) as Array<Record<string, unknown>>;

    const templates = rows.map((r) => ({
      id: Number(r.id ?? 0),
      templateType: String(r.template_type ?? ""),
      title: String(r.title ?? ""),
      content: String(r.content ?? ""),
      sortOrder: Number(r.sort_order ?? 0),
      isActive: Boolean(r.is_active),
      updatedAt: r.updated_at ? String(r.updated_at) : null,
    }));

    const quickReplyTemplates = templates
      .filter((t) => t.templateType === "quick_reply")
      .map((t) => t.content);
    const knowledgeBaseSnippets = templates
      .filter((t) => t.templateType === "knowledge_base")
      .map((t) => t.content);

    return NextResponse.json({
      success: true,
      data: {
        templates,
        quickReplyTemplates,
        knowledgeBaseSnippets,
        canManage: auth.canManage,
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/response-templates]", e);
    return NextResponse.json(
      {
        success: false,
        error:
          "Response templates unavailable. Run migration dashboard/drizzle/0191_ticket_response_templates.sql.",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return auth.error;
  if (!auth.canManage) {
    return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const templateType = asTemplateType(body.templateType);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 5000) : "";
  const sortOrderRaw = Number(body.sortOrder ?? 0);
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, Math.floor(sortOrderRaw)) : 0;

  if (!templateType) {
    return NextResponse.json({ success: false, error: "Invalid templateType" }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      INSERT INTO public.ticket_response_templates (
        template_type,
        title,
        content,
        sort_order,
        is_active,
        created_by_system_user_id,
        updated_by_system_user_id,
        created_at,
        updated_at
      )
      VALUES (
        ${templateType},
        ${title},
        ${content},
        ${sortOrder},
        true,
        ${auth.systemUser.id},
        ${auth.systemUser.id},
        NOW(),
        NOW()
      )
      RETURNING id, template_type, title, content, sort_order, is_active, updated_at
    `) as Array<Record<string, unknown>>;

    const row = rows[0] ?? {};
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
    console.error("[POST /api/tickets/response-templates]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Create failed" },
      { status: 500 }
    );
  }
}
