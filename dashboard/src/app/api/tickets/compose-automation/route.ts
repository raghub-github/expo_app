/**
 * GET / PUT /api/tickets/compose-automation
 * Per-user defaults for ticket reply To / Cc / Bcc (replaces localStorage-only storage).
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
  return { systemUser };
}

export async function GET() {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT default_to, default_cc, default_bcc, updated_at
      FROM public.ticket_compose_automation
      WHERE system_user_id = ${systemUser.id}
      LIMIT 1
    `;
    const row = rows?.[0] as
      | { default_to?: string; default_cc?: string; default_bcc?: string; updated_at?: string }
      | undefined;
    return NextResponse.json({
      success: true,
      data: {
        defaultTo: typeof row?.default_to === "string" ? row.default_to : "",
        defaultCc: typeof row?.default_cc === "string" ? row.default_cc : "",
        defaultBcc: typeof row?.default_bcc === "string" ? row.default_bcc : "",
        updatedAt: row?.updated_at ?? null,
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/compose-automation]", e);
    return NextResponse.json(
      {
        success: false,
        error: "Compose automation table missing — run migration 0156_ticket_compose_automation.sql",
      },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireTicketUser();
  if ("error" in auth && auth.error) return auth.error;
  const { systemUser } = auth;

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
      `INSERT INTO public.ticket_compose_automation (system_user_id, default_to, default_cc, default_bcc, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (system_user_id) DO UPDATE SET
         default_to = EXCLUDED.default_to,
         default_cc = EXCLUDED.default_cc,
         default_bcc = EXCLUDED.default_bcc,
         updated_at = NOW()`,
      [systemUser.id, defaultTo, defaultCc, defaultBcc]
    );

    const rows = await sqlTagged`
      SELECT default_to, default_cc, default_bcc, updated_at
      FROM public.ticket_compose_automation
      WHERE system_user_id = ${systemUser.id}
      LIMIT 1
    `;
    const row = (rows?.[0] ?? {}) as {
      default_to?: string;
      default_cc?: string;
      default_bcc?: string;
      updated_at?: string;
    };
    return NextResponse.json({
      success: true,
      data: {
        defaultTo: String(row.default_to ?? ""),
        defaultCc: String(row.default_cc ?? ""),
        defaultBcc: String(row.default_bcc ?? ""),
        updatedAt: row.updated_at ?? null,
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
