/**
 * GET/PUT singleton ticket_queue_auto_assign_settings (max open tickets per agent).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

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

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "TICKET"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const sql = getSql();
    const rows = (await sql`
      SELECT max_open_tickets_per_agent, updated_at
      FROM public.ticket_queue_auto_assign_settings
      WHERE id = 1
      LIMIT 1
    `) as { max_open_tickets_per_agent?: number; updated_at?: string }[];

    const maxOpen = Number(rows[0]?.max_open_tickets_per_agent);
    return NextResponse.json({
      success: true,
      data: {
        maxOpenTicketsPerAgent: Number.isFinite(maxOpen) && maxOpen >= 1 ? maxOpen : 6,
        updatedAt: rows[0]?.updated_at ?? null,
      },
    });
  } catch (e) {
    console.error("[GET /api/tickets/queue/auto-assign-settings]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to load settings" },
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

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
    const hasTicket = await hasDashboardAccessByAuth(user.id, user.email, "TICKET");
    if (!userIsSuperAdmin && !hasTicket) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const body = (await request.json()) as { maxOpenTicketsPerAgent?: unknown };
    const raw = body.maxOpenTicketsPerAgent;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      return NextResponse.json(
        { success: false, error: "maxOpenTicketsPerAgent must be between 1 and 500" },
        { status: 400 }
      );
    }

    const sql = getSql();
    await sql`
      INSERT INTO public.ticket_queue_auto_assign_settings (id, max_open_tickets_per_agent, updated_at)
      VALUES (1, ${Math.floor(n)}, now())
      ON CONFLICT (id) DO UPDATE SET
        max_open_tickets_per_agent = ${Math.floor(n)},
        updated_at = now()
    `;

    return NextResponse.json({
      success: true,
      data: { maxOpenTicketsPerAgent: Math.floor(n) },
    });
  } catch (e) {
    console.error("[PUT /api/tickets/queue/auto-assign-settings]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 }
    );
  }
}
