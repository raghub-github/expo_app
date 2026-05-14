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

    // Build the canonical set of rows we want in the table after this PUT.
    // De-dup secondary against primary so the same group never appears in both
    // tiers for a single agent.
    type Row = { systemUserId: number; primary: number[]; secondary: number[] };
    const desired: Row[] = [];
    for (const [uid, tiers] of Object.entries(raw)) {
      const systemUserId = Number(uid);
      if (!Number.isFinite(systemUserId)) continue;
      const primary = normalizeIds(tiers?.primary);
      const secondary = normalizeIds(tiers?.secondary).filter((id) => !primary.includes(id));
      if (primary.length === 0 && secondary.length === 0) continue;
      desired.push({ systemUserId, primary, secondary });
    }

    const sql = getSql();

    // All writes inside one transaction so the resulting table state is the
    // exact `desired` set even under rapid-fire concurrent PUTs from the UI.
    // Replaces the old "DELETE ALL + INSERT loop" — that pattern raced when
    // two PUTs overlapped: both deleted, then both inserted the same
    // system_user_id → unique-constraint violation on
    // ticket_agent_queue_assignments_pkey.
    await sql.begin(async (tx) => {
      // Cast to outer `sql` shape so TypeScript recognizes tx as callable
      // as a template tag (same pattern used elsewhere in the codebase, e.g.
      // user-app-categories.ts).
      const run = tx as unknown as typeof sql;

      // 1. Remove rows for agents no longer assigned to ANY group. When the
      //    desired set is empty we wipe the whole table.
      if (desired.length === 0) {
        await run`DELETE FROM public.ticket_agent_queue_assignments`;
      } else {
        const keepIds = desired.map((r) => r.systemUserId);
        await run`
          DELETE FROM public.ticket_agent_queue_assignments
          WHERE system_user_id <> ALL(${keepIds}::bigint[])
        `;
      }

      // 2. Upsert each desired row. ON CONFLICT (system_user_id) DO UPDATE
      //    means concurrent PUTs no longer collide on the primary key — the
      //    last writer wins for that agent's row, which matches the user's
      //    intent (latest save reflects what they see in the UI).
      for (const r of desired) {
        await run`
          INSERT INTO public.ticket_agent_queue_assignments
            (system_user_id, primary_group_ids, secondary_group_ids, updated_at)
          VALUES (
            ${r.systemUserId},
            ${pgBigintArrayLiteral(r.primary)}::bigint[],
            ${pgBigintArrayLiteral(r.secondary)}::bigint[],
            now()
          )
          ON CONFLICT (system_user_id) DO UPDATE SET
            primary_group_ids = EXCLUDED.primary_group_ids,
            secondary_group_ids = EXCLUDED.secondary_group_ids,
            updated_at = now()
        `;
      }
    });

    return NextResponse.json({ success: true, data: { saved: true } });
  } catch (e) {
    console.error("[PUT /api/tickets/queue/agent-groups]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save assignments" },
      { status: 500 }
    );
  }
}
