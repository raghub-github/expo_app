import { NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getMerchantAccess, type MerchantAccess } from "@/lib/permissions/merchant-access";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export type MerchantStoreRouteAuth = {
  user: { id: string; email: string };
  storeId: number;
  isAdmin: boolean;
  access: MerchantAccess | null;
  sql: ReturnType<typeof getSql>;
};

async function getAreaManagerId(userId: string, email: string): Promise<number | null> {
  if (await isSuperAdmin(userId, email)) return null;
  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;
  const am = await getAreaManagerByUserId(systemUser.id);
  return am?.id ?? null;
}

export async function authorizeMerchantStoreRoute(
  rawStoreId: string,
  opts?: {
    requireAvailability?: boolean;
    requireTiming?: boolean;
  }
): Promise<MerchantStoreRouteAuth | NextResponse> {
  const storeId = parseInt(rawStoreId, 10);
  if (!Number.isFinite(storeId)) {
    return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
  }

  const auth = await getAuthenticatedApiUser();
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const user = auth.user;
  if (!user.email) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
  }

  const isAdmin = await isSuperAdmin(user.id, user.email);
  const areaManagerId = await getAreaManagerId(user.id, user.email);
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
  }

  let access: MerchantAccess | null = null;
  if (!isAdmin) {
    access = await getMerchantAccess(user.id, user.email);
    // Area managers may lack a merchant_management_access row but can manage assigned stores.
    if (!access && areaManagerId == null) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }
    if (access) {
      if (opts?.requireAvailability && !access.can_update_store_availability) {
        return NextResponse.json(
          { success: false, error: "Permission denied: cannot update store availability" },
          { status: 403 }
        );
      }
      if (opts?.requireTiming && !access.can_update_store_timing) {
        return NextResponse.json(
          { success: false, error: "Permission denied: cannot update store timing" },
          { status: 403 }
        );
      }
    }
  }

  return {
    user: { id: user.id, email: user.email },
    storeId,
    isAdmin,
    access,
    sql: getSql(),
  };
}
