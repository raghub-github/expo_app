/**
 * GET /api/riders/[id]/tickets – rider tickets from public.unified_tickets
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { fetchRiderUnifiedTickets } from "@/lib/riders/rider-unified-tickets";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const db = getDb();
    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10) || 30));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const { tickets, total } = await fetchRiderUnifiedTickets(riderId, {
      limit,
      offset,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      orderRelated: searchParams.get("orderRelated") || undefined,
      category: searchParams.get("category") || undefined,
      status: searchParams.get("status") || undefined,
      q: searchParams.get("q") || undefined,
    });

    const list = tickets.map((t) => ({
      id: t.id,
      ticketId: t.ticketId,
      riderId,
      orderId: t.orderId ?? null,
      category: t.category,
      priority: t.priority,
      subject: t.subject,
      message: t.message,
      status: t.status,
      resolution: null as string | null,
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
      resolvedAt: t.resolvedAt ?? null,
      resolvedBy: null as number | null,
      resolvedByEmail: null as string | null,
      resolvedByName: null as string | null,
    }));

    return NextResponse.json({ success: true, data: { tickets: list, total } });
  } catch (error) {
    console.error("[GET /api/riders/[id]/tickets] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
