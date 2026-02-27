/**
 * GET – wallet freeze/unfreeze history with agent email for the rider
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderWalletFreezeHistory, systemUsers } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
      "RIDER"
    );
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        { status: 403 }
      );
    }

    const riderId = parseInt((await params).id, 10);
    if (Number.isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider id" },
        { status: 400 }
      );
    }

    const limit = Math.min(
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "20", 10)),
      100
    );

    const db = getDb();
    const history = await db
      .select({
        id: riderWalletFreezeHistory.id,
        action: riderWalletFreezeHistory.action,
        reason: riderWalletFreezeHistory.reason,
        createdAt: riderWalletFreezeHistory.createdAt,
        performedByEmail: systemUsers.email,
        performedByName: systemUsers.fullName,
      })
      .from(riderWalletFreezeHistory)
      .leftJoin(
        systemUsers,
        eq(riderWalletFreezeHistory.performedBySystemUserId, systemUsers.id)
      )
      .where(eq(riderWalletFreezeHistory.riderId, riderId))
      .orderBy(desc(riderWalletFreezeHistory.createdAt))
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: { history },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/wallet-freeze-history] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
