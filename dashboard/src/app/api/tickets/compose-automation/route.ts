/**
 * GET / PUT /api/tickets/compose-automation
 * Global defaults for ticket reply To / Cc / Bcc (single row for all ticket-dashboard users).
 * GET: any user with ticket dashboard access. PUT: super admins only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import type { TicketAuditSqlClient } from "@/lib/db/operations/ticket-activity-audit";

export const runtime = "nodejs";

const MAX_LEN = 8000;

function pickComposeRow(row: Record<string, unknown> | undefined): {
  default_to: string;
  default_cc: string;
  default_bcc: string;
  updated_at: string | null;
  updated_by_system_user_id: number | null;
  updated_by_email: string | null;
  updated_by_full_name: string | null;
} {
  if (!row || typeof row !== "object") {
    return {
      default_to: "",
      default_cc: "",
      default_bcc: "",
      updated_at: null,
      updated_by_system_user_id: null,
      updated_by_email: null,
      updated_by_full_name: null,
    };
  }
  const s = (k: string, ...alts: string[]) => {
    let v: unknown = row[k];
    for (const a of alts) {
      if (v !== undefined && v != null && v !== "") break;
      v = row[a];
    }
    return typeof v === "string" ? v : v != null ? String(v) : "";
  };
  const n = (k: string, ...alts: string[]) => {
    for (const key of [k, ...alts]) {
      const v = row[key];
      if (v == null || v === "") continue;
      const num = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(num)) return num;
    }
    return null;
  };
  const ts = (k: string, ...alts: string[]): string | null => {
    let v: unknown = row[k];
    for (const a of alts) {
      if (v != null && v !== "") break;
      v = row[a];
    }
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
    const str = typeof v === "string" ? v.trim() : String(v);
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? str : d.toISOString();
  };
  return {
    default_to: s("default_to", "defaultTo"),
    default_cc: s("default_cc", "defaultCc"),
    default_bcc: s("default_bcc", "defaultBcc"),
    updated_at: ts("updated_at", "updatedAt"),
    updated_by_system_user_id: n("updated_by_system_user_id", "updatedBySystemUserId"),
    updated_by_email: s("updated_by_email", "updatedByEmail") || null,
    updated_by_full_name: s("updated_by_full_name", "updatedByFullName") || null,
  };
}

async function requireTicketUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
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
  return { systemUser, userIsSuperAdmin };
}

export async function GET() {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { userIsSuperAdmin } = auth;

  try {
    const sql = getSql();
    let rows = await sql`
      SELECT c.default_to,
             c.default_cc,
             c.default_bcc,
             c.updated_at,
             c.updated_by_system_user_id,
             u.email AS updated_by_email,
             u.full_name AS updated_by_full_name
      FROM public.ticket_compose_automation c
      LEFT JOIN public.system_users u ON u.id = c.updated_by_system_user_id
      WHERE c.singleton = 1
      LIMIT 1
    `;
    if (!rows?.length) {
      await sql`
        INSERT INTO public.ticket_compose_automation (singleton)
        VALUES (1)
        ON CONFLICT (singleton) DO NOTHING
      `;
      rows = await sql`
        SELECT c.default_to,
               c.default_cc,
               c.default_bcc,
               c.updated_at,
               c.updated_by_system_user_id,
               u.email AS updated_by_email,
               u.full_name AS updated_by_full_name
        FROM public.ticket_compose_automation c
        LEFT JOIN public.system_users u ON u.id = c.updated_by_system_user_id
        WHERE c.singleton = 1
        LIMIT 1
      `;
    }
    const row = pickComposeRow(rows?.[0] as Record<string, unknown> | undefined);
    return NextResponse.json({
      success: true,
      data: {
        defaultTo: row.default_to,
        defaultCc: row.default_cc,
        defaultBcc: row.default_bcc,
        updatedAt: row.updated_at,
        updatedBySystemUserId: row.updated_by_system_user_id,
        updatedByEmail: row.updated_by_email,
        updatedByFullName: row.updated_by_full_name,
        canManage: userIsSuperAdmin,
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/compose-automation]", e);
    return NextResponse.json(
      {
        success: false,
        error:
          "Compose automation unavailable — run dashboard/drizzle/0159_ticket_compose_automation_global.sql (or ensure ticket_compose_automation has singleton = 1 row).",
      },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser, userIsSuperAdmin } = auth;

  if (!userIsSuperAdmin) {
    return NextResponse.json(
      { success: false, error: "Only super admins can update global compose automation." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const defaultTo = typeof b.defaultTo === "string" ? b.defaultTo.slice(0, MAX_LEN) : "";
  const defaultCc = typeof b.defaultCc === "string" ? b.defaultCc.slice(0, MAX_LEN) : "";
  const defaultBcc = typeof b.defaultBcc === "string" ? b.defaultBcc.slice(0, MAX_LEN) : "";

  const sqlTagged = getSql();
  const sqlUnsafe = sqlTagged as TicketAuditSqlClient;

  try {
    await sqlUnsafe.unsafe(
      `INSERT INTO public.ticket_compose_automation (singleton, default_to, default_cc, default_bcc, updated_by_system_user_id, updated_at)
       VALUES (1, $1, $2, $3, $4, NOW())
       ON CONFLICT (singleton) DO UPDATE SET
         default_to = EXCLUDED.default_to,
         default_cc = EXCLUDED.default_cc,
         default_bcc = EXCLUDED.default_bcc,
         updated_by_system_user_id = EXCLUDED.updated_by_system_user_id,
         updated_at = NOW()`,
      [defaultTo, defaultCc, defaultBcc, systemUser.id]
    );

    const rows = await sqlTagged`
      SELECT c.default_to,
             c.default_cc,
             c.default_bcc,
             c.updated_at,
             c.updated_by_system_user_id,
             u.email AS updated_by_email,
             u.full_name AS updated_by_full_name
      FROM public.ticket_compose_automation c
      LEFT JOIN public.system_users u ON u.id = c.updated_by_system_user_id
      WHERE c.singleton = 1
      LIMIT 1
    `;
    const row = pickComposeRow(rows?.[0] as Record<string, unknown> | undefined);
    return NextResponse.json({
      success: true,
      data: {
        defaultTo: row.default_to,
        defaultCc: row.default_cc,
        defaultBcc: row.default_bcc,
        updatedAt: row.updated_at,
        updatedBySystemUserId: row.updated_by_system_user_id,
        updatedByEmail: row.updated_by_email,
        updatedByFullName: row.updated_by_full_name,
        canManage: true,
      },
    });
  } catch (e) {
    console.error("[PUT /api/tickets/compose-automation]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
