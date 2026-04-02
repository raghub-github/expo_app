/**
 * GET/PATCH agent per-user max open ticket override (agent_profiles.max_open_tickets_override).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { getMaxOpenTicketsPerAgent } from "@/lib/tickets/queue-balance-auto-assign";

export const runtime = "nodejs";

const TERMINAL = ["CLOSED", "REJECTED", "RESOLVED", "CANCELLED", "PROVISIONALLY_RESOLVED"];

async function requireTicketManager() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.email) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  const systemUser = await getSystemUserByEmail(user.email);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const ok =
    (await isSuperAdmin(user.id, user.email)) || (await hasDashboardAccessByAuth(user.id, user.email, "TICKET"));
  if (!ok) {
    return { error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { systemUser };
}

export async function GET() {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const sql = getSql();
    const globalCap = await getMaxOpenTicketsPerAgent(sql);

    const rows = (await sql`
      SELECT DISTINCT ON (u.id)
             u.id AS user_id,
             u.full_name,
             u.email,
             ap.max_open_tickets_override,
             ap.is_online,
             ap.current_status::text AS current_status,
             (SELECT COUNT(*)::int FROM public.unified_tickets ut
               WHERE ut.assigned_to_agent_id = u.id
                 AND NOT (ut.status::text = ANY (${TERMINAL}))) AS open_count
      FROM public.system_users u
      INNER JOIN public.agent_profiles ap ON ap.user_id = u.id
      INNER JOIN public.ticket_agent_queue_assignments qa ON qa.system_user_id = u.id
      ORDER BY u.id ASC, u.full_name ASC NULLS LAST, u.email ASC
    `) as {
      user_id?: unknown;
      full_name?: string | null;
      email?: string | null;
      max_open_tickets_override?: number | null;
      is_online?: boolean | null;
      current_status?: string | null;
      open_count?: number | null;
    }[];

    const agents = rows.map((r) => {
      const uid = Number(r.user_id);
      const open = Number(r.open_count) || 0;
      const rawOv = r.max_open_tickets_override;
      const hasOv = rawOv != null && Number.isFinite(Number(rawOv));
      const personal = hasOv ? Math.min(500, Math.max(1, Math.floor(Number(rawOv)))) : null;
      const effectiveCap = Math.min(globalCap, personal ?? globalCap);
      const atCapacity = open >= effectiveCap;
      return {
        userId: uid,
        name: r.full_name?.trim() || r.email || `User ${uid}`,
        email: r.email ?? "",
        openCount: open,
        globalCap,
        maxOpenTicketsOverride: personal,
        effectiveCap,
        atCapacity,
        isOnline: r.is_online === true,
        currentStatus: r.current_status ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: { globalCap, agents },
    });
  } catch (e) {
    console.error("[GET /api/tickets/agents/capacity]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("max_open_tickets_override")) {
      return NextResponse.json(
        {
          success: false,
          error: "Run migration 0172_agent_max_open_override_and_assignment_logs.sql",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireTicketManager();
  if ("error" in auth && auth.error) return auth.error;

  let body: { userId?: unknown; maxOpenTicketsOverride?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const userId = Number(body.userId);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ success: false, error: "userId required" }, { status: 400 });
  }

  const raw = body.maxOpenTicketsOverride;
  let override: number | null;
  if (raw === null || raw === "") {
    override = null;
  } else {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      return NextResponse.json(
        { success: false, error: "maxOpenTicketsOverride must be 1–500 or null" },
        { status: 400 }
      );
    }
    override = Math.floor(n);
  }

  try {
    const sql = getSql();
    await sql`
      UPDATE public.agent_profiles
      SET max_open_tickets_override = ${override}
      WHERE user_id = ${userId}
    `;
    return NextResponse.json({ success: true, data: { userId, maxOpenTicketsOverride: override } });
  } catch (e) {
    console.error("[PATCH /api/tickets/agents/capacity]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("max_open_tickets_override")) {
      return NextResponse.json(
        {
          success: false,
          error: "Run migration 0172_agent_max_open_override_and_assignment_logs.sql",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
