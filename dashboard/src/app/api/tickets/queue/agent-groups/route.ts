/**
 * GET/PUT /api/tickets/queue/agent-groups
 * Supervisor: per-agent primary[] and secondary[] ticket group ids (stored as bigint[] in Postgres).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

type Tiered = { primary: number[]; secondary: number[] };

async function assertTicketUser(userId: string, email: string) {
  const userIsSuperAdmin = await isSuperAdmin(userId, email);
  const hasTicket = await hasDashboardAccessByAuth(userId, email, "TICKET");
  if (!userIsSuperAdmin && !hasTicket) {
    return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
  }
  return null;
}

function normalizeIds(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => Number(x)).filter((n) => Number.isFinite(n)))];
}

/**
 * postgres.js with `prepare: false` can send `sql.array()` as a bare CSV string, which Postgres
 * rejects for bigint[] ("malformed array literal"). A braced literal + ::bigint[] cast is reliable.
 */
function pgBigintArrayLiteral(ids: number[]): string {
  if (ids.length === 0) return "{}";
  return `{${ids.map((n) => String(Math.trunc(n))).join(",")}}`;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const denied = await assertTicketUser(user.id, user.email);
    if (denied) return denied;

    const sql = getSql();
    const rows = (await sql`
      SELECT system_user_id, primary_group_ids, secondary_group_ids
      FROM public.ticket_agent_queue_assignments
    `) as {
      system_user_id: string | number;
      primary_group_ids: unknown;
      secondary_group_ids: unknown;
    }[];

    const assignments: Record<string, Tiered> = {};
    for (const r of rows) {
      const uid = String(r.system_user_id);
      assignments[uid] = {
        primary: normalizeIds(r.primary_group_ids),
        secondary: normalizeIds(r.secondary_group_ids),
      };
    }
    return NextResponse.json({ success: true, data: { assignments } });
  } catch (e) {
    console.error("[GET /api/tickets/queue/agent-groups]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load assignments" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const denied = await assertTicketUser(user.id, user.email);
    if (denied) return denied;

    const body = (await request.json()) as { assignments?: Record<string, Tiered | { primary?: unknown; secondary?: unknown }> };
    const raw = body.assignments;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ success: false, error: "assignments object required" }, { status: 400 });
    }

    const sql = getSql();
    await sql`DELETE FROM public.ticket_agent_queue_assignments`;

    for (const [uid, tiers] of Object.entries(raw)) {
      const systemUserId = Number(uid);
      if (!Number.isFinite(systemUserId)) continue;
      const primary = normalizeIds(tiers?.primary);
      const secondary = normalizeIds(tiers?.secondary).filter((id) => !primary.includes(id));
      if (primary.length === 0 && secondary.length === 0) continue;

      await sql`
        INSERT INTO public.ticket_agent_queue_assignments (system_user_id, primary_group_ids, secondary_group_ids, updated_at)
        VALUES (
          ${systemUserId},
          ${pgBigintArrayLiteral(primary)}::bigint[],
          ${pgBigintArrayLiteral(secondary)}::bigint[],
          now()
        )
      `;
    }

    return NextResponse.json({ success: true, data: { saved: true } });
  } catch (e) {
    console.error("[PUT /api/tickets/queue/agent-groups]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save assignments" },
      { status: 500 }
    );
  }
}
