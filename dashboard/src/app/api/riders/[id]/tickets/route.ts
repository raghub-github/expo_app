/**
 * GET /api/riders/[id]/tickets – rider tickets with filters (order-related, category/service, status, date)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, tickets } from "@/lib/db/schema";
import { eq, and, desc, gte, lte, isNotNull, isNull } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasRiderAccess = await hasDashboardAccessByAuth(session.user.id, session.user.email!, "RIDER");
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
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "30"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const orderRelated = searchParams.get("orderRelated"); // yes | no | all
    const category = searchParams.get("category"); // payment | order | technical | food | parcel | person_ride | all
    const status = searchParams.get("status"); // open | in_progress | resolved | closed | all

    const conditions: any[] = [eq(tickets.riderId, riderId)];
    if (orderRelated === "yes") conditions.push(isNotNull(tickets.orderId));
    if (orderRelated === "no") conditions.push(isNull(tickets.orderId));
    if (category && category !== "all") conditions.push(eq(tickets.category, category));
    if (status && status !== "all") conditions.push(eq(tickets.status, status as any));
    if (from) conditions.push(gte(tickets.createdAt, new Date(from)));
    if (to) conditions.push(lte(tickets.createdAt, new Date(to)));

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    // Explicit select without resolved_by so this works even if migration 0080 has not been run
    const rows = await db
      .select({
        id: tickets.id,
        riderId: tickets.riderId,
        orderId: tickets.orderId,
        category: tickets.category,
        priority: tickets.priority,
        subject: tickets.subject,
        message: tickets.message,
        status: tickets.status,
        resolution: tickets.resolution,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        resolvedAt: tickets.resolvedAt,
      })
      .from(tickets)
      .where(whereClause)
      .orderBy(desc(tickets.createdAt))
      .limit(Number.isNaN(limit) ? 30 : limit);

    const list = rows.map((r) => ({
      id: r.id,
      riderId: r.riderId,
      orderId: r.orderId,
      category: r.category,
      priority: r.priority,
      subject: r.subject,
      message: r.message,
      status: r.status,
      resolution: r.resolution,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      resolvedAt: r.resolvedAt,
      resolvedBy: null as number | null,
      resolvedByEmail: null as string | null,
      resolvedByName: null as string | null,
    }));

    return NextResponse.json({ success: true, data: { tickets: list } });
  } catch (error) {
    console.error("[GET /api/riders/[id]/tickets] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
