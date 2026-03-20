/**
 * GET /api/system-roles/[id] — single role (super admin or USERS VIEW)
 * PATCH /api/system-roles/[id] — update role; updated_by = current system user (super admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { rowsFromExecute } from "@/lib/db/execute-rows";
import { checkPermission, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = "nodejs";

function normalizeRoleTypeFromBody(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function coerceBoolean(
  v: unknown,
  fallback: boolean
): { ok: true; value: boolean } | { ok: false; error: string } {
  if (typeof v === "boolean") return { ok: true, value: v };
  if (v === null || v === undefined) return { ok: true, value: fallback };
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "") return { ok: true, value: fallback };
    if (["true", "1", "yes", "y"].includes(s)) return { ok: true, value: true };
    if (["false", "0", "no", "n"].includes(s)) return { ok: true, value: false };
  }
  return { ok: false, error: "Boolean fields must be true or false (typed)" };
}

type RoleRow = {
  id: string | number;
  role_id: string;
  role_name: string;
  role_display_name: string;
  role_type: string;
  role_level: string | number;
  is_system_role: boolean | null;
  is_custom_role: boolean | null;
  is_active: boolean | null;
  created_by: string | number | null;
  updated_by: string | number | null;
  created_by_system_user_id: string | null;
  created_by_full_name: string | null;
  updated_by_system_user_id: string | null;
  updated_by_full_name: string | null;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await context.params;
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await checkPermission(user.id, user.email ?? "", "USERS", "VIEW"));

    if (!canView) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const db = getDb();
    const result = await db.execute(
      sql`SELECT
            sr.id,
            sr.role_id,
            sr.role_name,
            sr.role_display_name,
            sr.role_type,
            sr.role_level,
            sr.is_system_role,
            sr.is_custom_role,
            sr.is_active,
            sr.created_by,
            sr.updated_by,
            cb.system_user_id AS created_by_system_user_id,
            cb.full_name AS created_by_full_name,
            ub.system_user_id AS updated_by_system_user_id,
            ub.full_name AS updated_by_full_name
          FROM public.system_roles sr
          LEFT JOIN public.system_users cb ON cb.id = sr.created_by
          LEFT JOIN public.system_users ub ON ub.id = sr.updated_by
          WHERE sr.id = ${id}
          LIMIT 1`
    );
    const rows = rowsFromExecute<RoleRow>(result);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const r = rows[0];
    return NextResponse.json({
      success: true,
      data: {
        id: Number(r.id),
        role_id: r.role_id,
        role_name: r.role_name,
        role_display_name: r.role_display_name,
        role_type: r.role_type,
        role_level: Number(r.role_level),
        is_system_role: r.is_system_role,
        is_custom_role: r.is_custom_role,
        is_active: r.is_active,
        created_by: r.created_by != null ? Number(r.created_by) : null,
        updated_by: r.updated_by != null ? Number(r.updated_by) : null,
        created_by_system_user_id: r.created_by_system_user_id ?? null,
        created_by_full_name: r.created_by_full_name ?? null,
        updated_by_system_user_id: r.updated_by_system_user_id ?? null,
        updated_by_full_name: r.updated_by_full_name ?? null,
      },
    });
  } catch (error) {
    console.error("[GET /api/system-roles/[id]] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await context.params;
    const id = parseInt(idParam, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    if (!(await isSuperAdmin(user.id, user.email ?? ""))) {
      return NextResponse.json({ success: false, error: "Super admin access required" }, { status: 403 });
    }

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found in system" }, { status: 404 });
    }

    const body = await request.json();
    const role_display_name =
      typeof body.role_display_name === "string" ? body.role_display_name.trim() : "";
    const role_type =
      typeof body.role_type === "string" ? normalizeRoleTypeFromBody(body.role_type) : "";
    const role_level =
      typeof body.role_level === "string"
        ? parseInt(body.role_level.trim(), 10)
        : Number(body.role_level);

    const sysB = coerceBoolean(body.is_system_role, false);
    const custB = coerceBoolean(body.is_custom_role, false);
    const actB = coerceBoolean(body.is_active, true);
    if (!sysB.ok) {
      return NextResponse.json({ success: false, error: `is_system_role: ${sysB.error}` }, { status: 400 });
    }
    if (!custB.ok) {
      return NextResponse.json({ success: false, error: `is_custom_role: ${custB.error}` }, { status: 400 });
    }
    if (!actB.ok) {
      return NextResponse.json({ success: false, error: `is_active: ${actB.error}` }, { status: 400 });
    }

    if (!role_display_name) {
      return NextResponse.json({ success: false, error: "role_display_name is required" }, { status: 400 });
    }
    if (!role_type || role_type.length > 500) {
      return NextResponse.json(
        { success: false, error: "role_type is required and must be at most 500 characters" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(role_level) || role_level < 1) {
      return NextResponse.json(
        { success: false, error: "role_level must be a positive integer" },
        { status: 400 }
      );
    }

    const db = getDb();

    const updateResult = await db.execute(
      sql`
      UPDATE public.system_roles SET
        role_display_name = ${role_display_name},
        role_type = ${role_type},
        role_level = ${role_level},
        is_system_role = ${sysB.value},
        is_custom_role = ${custB.value},
        is_active = ${actB.value},
        updated_by = ${systemUser.id}
      WHERE id = ${id}
      RETURNING id, role_id, role_name, role_display_name
    `
    );

    const updated = rowsFromExecute<Record<string, unknown>>(updateResult);
    const row = updated[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: row });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code;
    if (code === "42501" || /row-level security/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Database blocked this write (row-level security). Apply migration drizzle/0138_system_roles_rls_policies.sql or use a DB role that bypasses RLS.",
        },
        { status: 403 }
      );
    }
    console.error("[PATCH /api/system-roles/[id]] Error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
