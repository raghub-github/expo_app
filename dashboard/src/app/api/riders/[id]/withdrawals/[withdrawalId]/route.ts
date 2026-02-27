/**
 * PATCH /api/riders/[id]/withdrawals/[withdrawalId]
 * Update withdrawal status (e.g. approve = processing/completed, reject = failed/cancelled).
 * If status is processing or completed, rider wallet must not be frozen; otherwise 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, withdrawalRequests, riderWallet } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

const ALLOWED_STATUSES = ["processing", "completed", "failed", "cancelled"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; withdrawalId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
      "RIDER"
    );
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id, withdrawalId } = await params;
    const riderId = parseInt(id, 10);
    const withdrawalIdNum = parseInt(withdrawalId, 10);
    if (Number.isNaN(riderId) || Number.isNaN(withdrawalIdNum)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID or withdrawal ID" }, { status: 400 });
    }

    let body: { status?: string; transactionId?: string; failureReason?: string } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const status = body.status?.toLowerCase();
    if (!status || !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getDb();

    const [riderRow] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!riderRow) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const [withdrawal] = await db
      .select()
      .from(withdrawalRequests)
      .where(and(eq(withdrawalRequests.id, withdrawalIdNum), eq(withdrawalRequests.riderId, riderId)))
      .limit(1);

    if (!withdrawal) {
      return NextResponse.json({ success: false, error: "Withdrawal not found" }, { status: 404 });
    }

    // Block approval (processing/completed) when rider wallet is frozen
    if (status === "processing" || status === "completed") {
      const [wallet] = await db
        .select({ isFrozen: riderWallet.isFrozen })
        .from(riderWallet)
        .where(eq(riderWallet.riderId, riderId))
        .limit(1);

      if (wallet?.isFrozen) {
        return NextResponse.json(
          {
            success: false,
            error: "Rider wallet is frozen. Unfreeze the wallet to allow withdrawals.",
            code: "WALLET_FROZEN",
          },
          { status: 403 }
        );
      }
    }

    const setPayload: {
      status: (typeof ALLOWED_STATUSES)[number];
      updatedAt: Date;
      processedAt?: Date;
      transactionId?: string;
      failureReason?: string;
    } = {
      status: status as (typeof ALLOWED_STATUSES)[number],
      updatedAt: new Date(),
    };

    if (status === "completed" || status === "failed") {
      setPayload.processedAt = new Date();
    }
    if (body.transactionId != null) {
      setPayload.transactionId = String(body.transactionId);
    }
    if (body.failureReason != null) {
      setPayload.failureReason = String(body.failureReason);
    }

    await db
      .update(withdrawalRequests)
      .set(setPayload)
      .where(eq(withdrawalRequests.id, withdrawalIdNum));

    return NextResponse.json({
      success: true,
      data: { id: withdrawalIdNum, status, processedAt: setPayload.processedAt ?? null },
    });
  } catch (error) {
    console.error("[PATCH /api/riders/[id]/withdrawals/[withdrawalId]] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
