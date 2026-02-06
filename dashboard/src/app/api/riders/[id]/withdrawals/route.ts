/**
 * GET /api/riders/[id]/withdrawals – rider withdrawals with filters (status, date range)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, withdrawalRequests } from "@/lib/db/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
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
    const [riderRow] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!riderRow) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "30"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    const conditions: any[] = [eq(withdrawalRequests.riderId, riderId)];
    if (status && status !== "all") {
      conditions.push(eq(withdrawalRequests.status, status as any));
    }
    if (from) conditions.push(gte(withdrawalRequests.createdAt, new Date(from)));
    if (to) conditions.push(lte(withdrawalRequests.createdAt, new Date(to)));

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const list = await db
      .select()
      .from(withdrawalRequests)
      .where(whereClause)
      .orderBy(desc(withdrawalRequests.createdAt))
      .limit(Number.isNaN(limit) ? 30 : limit);

    return NextResponse.json({ success: true, data: { withdrawals: list } });
  } catch (error) {
    console.error("[GET /api/riders/[id]/withdrawals] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
