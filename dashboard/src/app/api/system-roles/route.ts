/**
 * GET /api/system-roles — list roles (super admin or USERS VIEW)
 * POST /api/system-roles — create row; created_by & updated_by = current system user; description & parent null (super admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, type SQL } from "drizzle-orm";
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

type ListRoleRow = {
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

/** List roles from `public.system_roles` with optional search and filters (super admin or USERS VIEW). */
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const searchRaw = searchParams.get("search")?.trim() ?? "";
    const roleTypeParam = searchParams.get("roleType")?.trim() ?? "";
    const isActiveParam = searchParams.get("isActive")?.trim() ?? "";
    const scopeParam = searchParams.get("scope")?.trim() ?? "";

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limitRaw = parseInt(searchParams.get("limit") ?? "20", 10) || 20;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (searchRaw.length > 0) {
      const pattern = `%${searchRaw}%`;
      conditions.push(
        sql`(sr.role_id ILIKE ${pattern}
            OR sr.role_name ILIKE ${pattern}
            OR sr.role_display_name ILIKE ${pattern}
            OR COALESCE(sr.role_description, '') ILIKE ${pattern})`
      );
    }
    if (roleTypeParam.length > 0) {
      const typePattern = `%${roleTypeParam}%`;
      conditions.push(sql`sr.role_type ILIKE ${typePattern}`);
    }
    if (isActiveParam === "true") {
      conditions.push(sql`sr.is_active IS TRUE`);
    } else if (isActiveParam === "false") {
      conditions.push(sql`(sr.is_active IS FALSE OR sr.is_active IS NULL)`);
    }
    if (scopeParam === "system") {
      conditions.push(sql`sr.is_system_role IS TRUE`);
    } else if (scopeParam === "custom") {
      conditions.push(sql`sr.is_custom_role IS TRUE`);
    }

    let whereClause: SQL = sql`TRUE`;
    for (const c of conditions) {
      whereClause = sql`${whereClause} AND ${c}`;
    }

    const db = getDb();

    const countResult = await db.execute(
      sql`SELECT COUNT(*)::bigint AS cnt FROM public.system_roles sr WHERE ${whereClause}`
    );
    const countRows = rowsFromExecute<{ cnt: string | number }>(countResult);
    const total = Number(countRows[0]?.cnt ?? 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    const listResult = await db.execute(
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
          WHERE ${whereClause}
          ORDER BY sr.role_level ASC, sr.role_display_name ASC
          LIMIT ${limit} OFFSET ${offset}`
    );

    const rows = rowsFromExecute<ListRoleRow>(listResult);
    const roles = rows.map((row) => ({
      id: Number(row.id),
      role_id: row.role_id,
      role_name: row.role_name,
      role_display_name: row.role_display_name,
      role_type: row.role_type,
      role_level: Number(row.role_level),
      is_system_role: row.is_system_role,
      is_custom_role: row.is_custom_role,
      is_active: row.is_active,
      created_by: row.created_by != null ? Number(row.created_by) : null,
      updated_by: row.updated_by != null ? Number(row.updated_by) : null,
      created_by_system_user_id: row.created_by_system_user_id ?? null,
      created_by_full_name: row.created_by_full_name ?? null,
      updated_by_system_user_id: row.updated_by_system_user_id ?? null,
      updated_by_full_name: row.updated_by_full_name ?? null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        roles,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/system-roles] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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
    const role_id = typeof body.role_id === "string" ? body.role_id.trim() : "";
    const role_name = typeof body.role_name === "string" ? body.role_name.trim() : "";
    const role_display_name =
      typeof body.role_display_name === "string" ? body.role_display_name.trim() : "";
    const role_type = typeof body.role_type === "string" ? normalizeRoleTypeFromBody(body.role_type) : "";
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
    const is_system_role = sysB.value;
    const is_custom_role = custB.value;
    const is_active = actB.value;

    if (!role_id || !role_name || !role_display_name) {
      return NextResponse.json(
        { success: false, error: "role_id, role_name, and role_display_name are required" },
        { status: 400 }
      );
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

    const insertResult = await db.execute(
      sql`
      INSERT INTO public.system_roles (
        role_id,
        role_name,
        role_display_name,
        role_description,
        role_type,
        role_level,
        parent_role_id,
        is_system_role,
        is_custom_role,
        is_active,
        created_by,
        updated_by
      ) VALUES (
        ${role_id},
        ${role_name},
        ${role_display_name},
        NULL,
        ${role_type},
        ${role_level},
        NULL,
        ${is_system_role},
        ${is_custom_role},
        ${is_active},
        ${systemUser.id},
        ${systemUser.id}
      )
      RETURNING id, role_id, role_name, role_display_name
    `
    );

    const inserted = rowsFromExecute<Record<string, unknown>>(insertResult);
    const row = inserted[0] ?? null;
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Insert did not return a row; check database logs and RLS on system_roles" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: row,
    });
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
    if (code === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { success: false, error: "A role with this role_id or role_name already exists" },
        { status: 409 }
      );
    }
    console.error("[POST /api/system-roles] Error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
