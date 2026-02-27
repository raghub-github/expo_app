/**
 * POST /api/wallet-credit-requests/[requestId]/reject
 * Reject a pending wallet credit request. Requires REJECT on RIDER_WALLET_CREDITS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { walletCreditRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getSystemUserIdFromAuthUser,
  hasDashboardAccess,
  hasAccessPointAction,
  isSuperAdmin,
} from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { logActionByAuth } from "@/lib/audit/logger";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUserId = await getSystemUserIdFromAuthUser(user.id, user.email ?? undefined);
    if (!systemUserId) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 403 });
    }

    const canReject =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      ((await hasDashboardAccess(systemUserId, "RIDER")) &&
        (await hasAccessPointAction(systemUserId, "RIDER", "RIDER_WALLET_CREDITS", "REJECT")));
    if (!canReject) {
      return NextResponse.json({
        success: false,
        error: "Insufficient permissions. REJECT on RIDER_WALLET_CREDITS required.",
      }, { status: 403 });
    }

    const { requestId } = await params;
    const id = parseInt(requestId);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: "Invalid request ID" }, { status: 400 });
    }

    let body: { reviewNote?: string };
    try {
      body = await request.json().catch(() => ({}));
    } catch {
      body = {};
    }
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim() || null : null;

    const db = getDb();
    const systemUser = await getSystemUserByEmail(user.email!);
    const reviewedByEmail = systemUser?.email ?? user.email ?? null;

    const [existing] = await db
      .select()
      .from(walletCreditRequests)
      .where(eq(walletCreditRequests.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ success: false, error: "Request is not pending" }, { status: 400 });
    }

    await db
      .update(walletCreditRequests)
      .set({
        status: "rejected",
        reviewedBySystemUserId: systemUserId,
        reviewedByEmail,
        reviewedAt: new Date(),
        reviewNote,
      })
      .where(eq(walletCreditRequests.id, id));

    await logActionByAuth(
      user.id,
      user.email!,
      "RIDER",
      "REQUEST_REJECT",
      {
        resourceType: "wallet_credit_request",
        resourceId: String(id),
        actionDetails: { requestId: id, reviewNote },
        newValues: { status: "rejected" },
      }
    );

    const [updated] = await db
      .select()
      .from(walletCreditRequests)
      .where(eq(walletCreditRequests.id, id))
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        id: updated!.id,
        status: updated!.status,
        reviewedAt: updated!.reviewedAt ?? undefined,
        reviewNote: updated!.reviewNote ?? undefined,
      },
    });
  } catch (error) {
    console.error("[POST /api/wallet-credit-requests/[requestId]/reject] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to reject" },
      { status: 500 }
    );
  }
}
