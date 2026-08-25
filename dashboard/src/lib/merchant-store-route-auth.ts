import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getMerchantAccess, type MerchantAccess } from "@/lib/permissions/merchant-access";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  getAreaManagerByUserId,
  requireAreaManagerApiAuth,
  requireMerchantManager,
} from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
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

function responseAsNext(res: Response): NextResponse {
  if (res instanceof NextResponse) return res;
  return new NextResponse(res.body, { status: res.status, headers: res.headers });
}

/**
 * Cookie-safe operator auth for merchant store media / AM child onboarding.
 * Super-admin JWTs often omit email — never 401 solely because email is missing.
 */
export async function authenticateMerchantStoreOperator(request?: NextRequest): Promise<
  | { ok: true; user: { id: string; email?: string } }
  | { ok: false; response: NextResponse }
> {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) return { ok: false, response: authFailureResponse(auth) };
  const user = auth.user;
  const email = user.email?.trim() || "";

  if (await isSuperAdmin(user.id, email || undefined)) {
    return { ok: true, user: { id: user.id, email: email || undefined } };
  }
  if (email && (await hasDashboardAccessByAuth(user.id, email, "MERCHANT"))) {
    return { ok: true, user: { id: user.id, email } };
  }

  const am = await requireAreaManagerApiAuth(
    async () => ({ id: user.id, email: email || undefined }),
    request
  );
  if (am.error) return { ok: false, response: responseAsNext(am.error) };
  if (!am.resolved) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Area manager access required" },
        { status: 403 }
      ),
    };
  }
  const merchantErr = requireMerchantManager(am.resolved);
  if (merchantErr) return { ok: false, response: responseAsNext(merchantErr) };
  return { ok: true, user: { id: user.id, email: email || undefined } };
}

export async function authenticateMerchantStoreForId(
  request: NextRequest | undefined,
  storeId: number
): Promise<
  | {
      ok: true;
      user: { id: string; email?: string };
      store: NonNullable<Awaited<ReturnType<typeof getMerchantStoreById>>>;
    }
  | { ok: false; response: NextResponse }
> {
  const operator = await authenticateMerchantStoreOperator(request);
  if (!operator.ok) return operator;
  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: operator.user.id,
    email: operator.user.email ?? "",
  });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Store not found" }, { status: 404 }),
    };
  }
  return { ok: true, user: operator.user, store };
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

  const operator = await authenticateMerchantStoreOperator();
  if (!operator.ok) return operator.response;
  const user = { id: operator.user.id, email: operator.user.email ?? "" };

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
    // View-only (MERCHANT_VIEW): never allow availability/timing mutations even if AM-assigned.
    if (opts?.requireAvailability) {
      if (!access?.can_update_store_availability) {
        return NextResponse.json(
          { success: false, error: "Permission denied: cannot update store availability" },
          { status: 403 }
        );
      }
    }
    if (opts?.requireTiming) {
      if (!access?.can_update_store_timing) {
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
