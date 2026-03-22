/**
 * DELETE /api/wallet-credit-requests/[requestId]/delete
 * Delete a wallet credit request. Allowed only for:
 * - The agent who created the request (requestedBySystemUserId === current user), OR
 * - Any agent with APPROVE or REJECT on RIDER_WALLET_CREDITS.
 * Only pending requests can be deleted.
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

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId: requestIdParam } = await params;
    const requestId = parseInt(requestIdParam, 10);
    if (Number.isNaN(requestId) || requestId < 1) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const systemUserId = await getSystemUserIdFromAuthUser(
      user.id,
      user.email
    );
    if (!systemUserId) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 403 }
      );
    }

    const db = getDb();

    const [row] = await db
      .select({
        id: walletCreditRequests.id,
        status: walletCreditRequests.status,
        requestedBySystemUserId: walletCreditRequests.requestedBySystemUserId,
      })
      .from(walletCreditRequests)
      .where(eq(walletCreditRequests.id, requestId))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 }
      );
    }

    if (row.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Only pending requests can be deleted" },
        { status: 400 }
      );
    }

    const isRequester = row.requestedBySystemUserId === systemUserId;
    const hasApproveReject =
      (await isSuperAdmin(user.id, user.email)) ||      ((await hasDashboardAccess(systemUserId, "RIDER")) &&
        ((await hasAccessPointAction(systemUserId, "RIDER", "RIDER_WALLET_CREDITS", "APPROVE")) ||
          (await hasAccessPointAction(systemUserId, "RIDER", "RIDER_WALLET_CREDITS", "REJECT"))));

    if (!isRequester && !hasApproveReject) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only the requesting agent or users with approve/reject access can delete this request",
        },
        { status: 403 }
      );
    }

    await db
      .delete(walletCreditRequests)
      .where(eq(walletCreditRequests.id, requestId));

    return NextResponse.json({ success: true, deleted: requestId });
  } catch (error) {
    console.error("[DELETE /api/wallet-credit-requests/[requestId]/delete] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete request",
      },
      { status: 500 }
    );
  }
}
