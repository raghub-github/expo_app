/**
 * GET /api/auth/rider-access
 * Returns the current user's rider dashboard action capabilities (for conditional UI).
 * Used to show/hide Add Penalty, Revert, Blacklist/Whitelist actions, Wallet freeze, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
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

export const runtime = "nodejs";

const SERVICES = ["food", "parcel", "person_ride"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);

    let email = (auth.user.email ?? "").trim();
    if (!email) {
      const mapped = await resolveSystemUserForSupabaseAuth(auth.user.id, undefined);
      email = (mapped?.email ?? "").trim();
    }
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const authId = auth.user.id;
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
          canAddPenalty[svc] = true;
          canRevertPenalty[svc] = await canPerformRiderServiceAction(authId, email, svc, "UPDATE");
          canBlock[svc] = await canPerformRiderServiceAction(authId, email, svc, "BLOCK");
          canUnblock[svc] = await canPerformRiderServiceAction(authId, email, svc, "UNBLOCK");
        }
      }
    }

    const canFreezeWallet =
      superAdmin || (hasRiderAccess && (await canPerformRiderActionAnyService(authId, email, "UPDATE")));

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
