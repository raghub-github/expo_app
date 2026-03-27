/**
 * GET /api/auth/rider-access
 * Returns the current user's rider dashboard action capabilities (for conditional UI).
 * Used to show/hide Add Penalty, Revert, Blacklist/Whitelist actions, Wallet freeze, etc.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSystemUserIdFromAuthUser,
  hasDashboardAccess,
  isSuperAdmin,
  hasAccessPointAction,
} from "@/lib/permissions/engine";
import {
  canPerformRiderServiceAction,
  canPerformRiderActionAnyService,
} from "@/lib/permissions/actions";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

const SERVICES = ["food", "parcel", "person_ride"] as const;

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    // Use getUser() instead of getSession() to avoid refresh token race conditions
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user || !user.email) {
      // Check if it's an invalid refresh token error
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const authId = user.id;
    const email = user.email ?? "";
    const systemUserId = await getSystemUserIdFromAuthUser(authId, email);
    if (!systemUserId) {
      return NextResponse.json({
        success: true,
        data: {
          hasRiderAccess: false,
          isSuperAdmin: false,
          canAddPenalty: { food: false, parcel: false, person_ride: false },
          canRevertPenalty: { food: false, parcel: false, person_ride: false },
          canBlock: { food: false, parcel: false, person_ride: false },
          canUnblock: { food: false, parcel: false, person_ride: false },
          canFreezeWallet: false,
          canRequestWalletCredit: false,
          canApproveRejectWalletCredit: false,
        },
      });
    }

    const superAdmin = await isSuperAdmin(authId, email);
    const hasRiderAccess = await hasDashboardAccess(systemUserId, "RIDER");

    const canAddPenalty = { food: false, parcel: false, person_ride: false };
    const canRevertPenalty = { food: false, parcel: false, person_ride: false };
    const canBlock = { food: false, parcel: false, person_ride: false };
    const canUnblock = { food: false, parcel: false, person_ride: false };

    if (hasRiderAccess || superAdmin) {
      for (const svc of SERVICES) {
        if (superAdmin) {
          canAddPenalty[svc] = true;
          canRevertPenalty[svc] = true;
          canBlock[svc] = true;
          canUnblock[svc] = true;
        } else {
          // All agents with rider access (including view-only) can add penalty and add amount
          canAddPenalty[svc] = true;
          canRevertPenalty[svc] = await canPerformRiderServiceAction(authId, email, svc, "UPDATE");
          canBlock[svc] = await canPerformRiderServiceAction(authId, email, svc, "BLOCK");
          canUnblock[svc] = await canPerformRiderServiceAction(authId, email, svc, "UNBLOCK");
        }
      }
    }

    const canFreezeWallet =
      superAdmin || (hasRiderAccess && (await canPerformRiderActionAnyService(authId, email, "UPDATE")));

    // Any agent with rider access (view or full) can request wallet credit (add amount)
    const canRequestWalletCredit = !!hasRiderAccess || superAdmin;

    const canApproveRejectWalletCredit =
      superAdmin ||
      (hasRiderAccess &&
        ((await hasAccessPointAction(systemUserId, "RIDER", "RIDER_WALLET_CREDITS", "APPROVE")) ||
          (await hasAccessPointAction(systemUserId, "RIDER", "RIDER_WALLET_CREDITS", "REJECT"))));

    return NextResponse.json({
      success: true,
      data: {
        hasRiderAccess: !!hasRiderAccess || superAdmin,
        isSuperAdmin: superAdmin,
        canAddPenalty,
        canRevertPenalty,
        canBlock,
        canUnblock,
        canFreezeWallet,
        canRequestWalletCredit,
        canApproveRejectWalletCredit: !!canApproveRejectWalletCredit,
      },
    });
  } catch (error) {
    console.error("[GET /api/auth/rider-access] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get rider access" },
      { status: 500 }
    );
  }
}
