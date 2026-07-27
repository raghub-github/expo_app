/**
 * PATCH /api/tickets/helpdesk-todos/[id] — update title and/or done
 * DELETE /api/tickets/helpdesk-todos/[id] — remove (owner only)
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const o = body as { title?: unknown; done?: unknown };
  const hasTitle = typeof o.title === "string";
  const hasDone = typeof o.done === "boolean";
  if (!hasTitle && !hasDone) {
    return NextResponse.json({ success: false, error: "Provide title and/or done" }, { status: 400 });
  }

  const title = hasTitle ? String(o.title).trim().slice(0, TITLE_MAX) : null;
  if (hasTitle && !title) {
    return NextResponse.json({ success: false, error: "title cannot be empty" }, { status: 400 });
  }

  try {
    const sql = getSql();
    if (hasTitle && hasDone) {
      const [row] = await sql`
        UPDATE public.agent_helpdesk_todos
        SET title = ${title!}, done = ${Boolean(o.done)}, updated_at = NOW()
        WHERE id = ${id} AND system_user_id = ${systemUser.id}
        RETURNING id, title, done, sort_order, created_at, updated_at
      `;
      if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      return jsonTodo(row);
    }
    if (hasTitle) {
      const [row] = await sql`
        UPDATE public.agent_helpdesk_todos
        SET title = ${title!}, updated_at = NOW()
        WHERE id = ${id} AND system_user_id = ${systemUser.id}
        RETURNING id, title, done, sort_order, created_at, updated_at
      `;
      if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      return jsonTodo(row);
    }
    const [row] = await sql`
      UPDATE public.agent_helpdesk_todos
      SET done = ${o.done as boolean}, updated_at = NOW()
      WHERE id = ${id} AND system_user_id = ${systemUser.id}
      RETURNING id, title, done, sort_order, created_at, updated_at
    `;
    if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return jsonTodo(row);
  } catch (e) {
    console.error("[PATCH /api/tickets/helpdesk-todos/[id]]", e);
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
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const [row] = await sql`
      DELETE FROM public.agent_helpdesk_todos
      WHERE id = ${id} AND system_user_id = ${systemUser.id}
      RETURNING id
    `;
    if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/tickets/helpdesk-todos/[id]]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 }
    );
  }
}

function jsonTodo(row: Record<string, unknown>) {
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
}
