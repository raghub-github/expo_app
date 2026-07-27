/**
 * GET /api/tickets/helpdesk-todos — list current user's to-dos
 * POST /api/tickets/helpdesk-todos — create (body: { title: string })
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

const TITLE_MAX = 500;

async function requireTicketUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return {
        error: NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 }),
      };
    }
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
  const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return { systemUser };
}

export async function GET() {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, title, done, sort_order, created_at, updated_at
      FROM public.agent_helpdesk_todos
      WHERE system_user_id = ${systemUser.id}
      ORDER BY sort_order ASC, id ASC
    `;
    return NextResponse.json({
      success: true,
      data: {
        todos: (rows ?? []).map((r) => ({
          id: Number(r.id),
          title: String(r.title ?? ""),
          done: Boolean(r.done),
          sortOrder: Number(r.sort_order ?? 0),
          createdAt: r.created_at != null ? String(r.created_at) : null,
          updatedAt: r.updated_at != null ? String(r.updated_at) : null,
        })),
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/helpdesk-todos]", e);
    return NextResponse.json(
      {
        success: false,
        error: "To-do table missing — run migration 0158_agent_helpdesk_todos.sql",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const titleRaw = typeof (body as { title?: unknown }).title === "string" ? (body as { title: string }).title : "";
  const title = titleRaw.trim().slice(0, TITLE_MAX);
  if (!title) {
    return NextResponse.json({ success: false, error: "title is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const [maxRow] = await sql`
      SELECT COALESCE(MAX(sort_order), -1)::int AS m
      FROM public.agent_helpdesk_todos
      WHERE system_user_id = ${systemUser.id}
    `;
    const nextOrder = Number(maxRow?.m ?? -1) + 1;
    const [row] = await sql`
      INSERT INTO public.agent_helpdesk_todos (system_user_id, title, sort_order)
      VALUES (${systemUser.id}, ${title}, ${nextOrder})
      RETURNING id, title, done, sort_order, created_at, updated_at
    `;
    if (!row) {
      return NextResponse.json({ success: false, error: "Insert failed" }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: {
        todo: {
          id: Number(row.id),
          title: String(row.title ?? ""),
          done: Boolean(row.done),
          sortOrder: Number(row.sort_order ?? 0),
          createdAt: row.created_at != null ? String(row.created_at) : null,
          updatedAt: row.updated_at != null ? String(row.updated_at) : null,
        },
      },
    });
  } catch (e) {
    console.error("[POST /api/tickets/helpdesk-todos]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Create failed" },
      { status: 500 }
    );
  }
}
