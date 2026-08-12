/**
 * Permission guard for the merchant-subscription refund API surface.
 *
 * Two levels:
 *   - requireMerchantSubscriptionViewApi() → MERCHANT dashboard access (or
 *     super_admin). Lets any merchant-facing agent see the payment list.
 *   - requireMerchantSubscriptionRefundApi() → the above PLUS the REFUND
 *     action permission (or super_admin). Only agents actually authorised
 *     to move money can hit the refund POST.
 *
 * Both authenticate via Supabase (dashboard's session) and look up the
 * system user + permissions via the existing engine.ts helpers. Fail-closed
 * on any error.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByAuthId, getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import { getUserAccessPoints, hasDashboardAccess, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import {
  isMerchantViewOnlyAccess,
  merchantCanMutate,
} from "@/lib/merchants/merchant-dashboard-access";

type OkResult = {
  ok: true;
  systemUserId: number;
  isSuperAdmin: boolean;
  canRefund: boolean;
  authId: string;
  email: string;
};
type FailResult = { ok: false; response: NextResponse };

async function baseAuth(): Promise<
  | { ok: true; systemUserId: number; authId: string; email: string; superAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      ),
    };
  }

  const systemUser =
    (user.id ? await getSystemUserByAuthId(user.id) : null) ??
    (user.email ? await getSystemUserByEmail(user.email) : null);

  if (!systemUser) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }),
    };
  }

  // Two independent super-admin signals — either is sufficient.
  //   (1) isSuperAdmin() → goes through getUserPermissions() which combines
  //       primary_role + assigned roles. Can occasionally miss (transient DB
  //       error, request-level cache poisoning by a prior null lookup).
  //   (2) Direct primary_role check on the freshly-fetched systemUser row.
  //       Bypasses the permissions cache entirely.
  // Empirically the check-based approach missed for a real super admin; the
  // direct check is the reliable escape hatch.
  const emailForCheck = (user.email ?? systemUser.email ?? "").trim();
  const [permsSuperAdmin, primaryRoleUpper] = await Promise.all([
    isSuperAdmin(user.id, emailForCheck).catch(() => false),
    Promise.resolve(String(systemUser.primary_role ?? "").toUpperCase()),
  ]);
  const superAdmin = permsSuperAdmin || primaryRoleUpper === "SUPER_ADMIN";

  return {
    ok: true,
    systemUserId: systemUser.id,
    authId: user.id,
    email: emailForCheck || systemUser.email,
    superAdmin,
  };
}

/**
 * Gate for the list-payments endpoint. Requires MERCHANT dashboard access
 * (or super_admin). Returns whether the caller can also perform a refund so
 * a single handler can pass `canRefund` through to the response for the UI.
 */
export async function requireMerchantSubscriptionViewApi(): Promise<OkResult | FailResult> {
  const base = await baseAuth();
  if (!base.ok) return base;

  if (base.superAdmin) {
    return {
      ok: true,
      systemUserId: base.systemUserId,
      isSuperAdmin: true,
      canRefund: true,
      authId: base.authId,
      email: base.email,
    };
  }

  const canView = await hasDashboardAccess(base.systemUserId, "MERCHANT");
  if (!canView) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "merchant_dashboard_access_required" },
        { status: 403 }
      ),
    };
  }

  const accessPoints = await getUserAccessPoints(base.systemUserId, "MERCHANT");
  const viewOnly =
    isMerchantViewOnlyAccess({ accessPoints }) || !merchantCanMutate({ accessPoints });
  const canRefundAction = await canPerformActionByAuth(
    base.authId,
    base.email,
    "MERCHANT",
    "REFUND"
  );
  return {
    ok: true,
    systemUserId: base.systemUserId,
    isSuperAdmin: false,
    canRefund: !viewOnly && canRefundAction,
    authId: base.authId,
    email: base.email,
  };
}

/**
 * Gate for the refund POST endpoint. Requires MERCHANT dashboard access AND
 * the REFUND action permission (or super_admin). Agents with view-only
 * access are rejected with 403.
 */
export async function requireMerchantSubscriptionRefundApi(): Promise<OkResult | FailResult> {
  const gate = await requireMerchantSubscriptionViewApi();
  if (!gate.ok) return gate;
  if (!gate.canRefund) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "refund_permission_required" },
        { status: 403 }
      ),
    };
  }
  return gate;
}
