/**
 * GET /api/transactions/detail?uid=<source:id>
 * Full transaction view: normalized summary + persisted financial breakdown +
 * lifecycle timeline (from payment_events). Read-only. Super-admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getTransactionDetail } from "@/lib/db/operations/transactions";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;

    if (!(await isSuperAdmin(user.id, user.email ?? ""))) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Transactions access requires Super Admin." },
        { status: 403 },
      );
    }

    const uid = request.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ success: false, error: "uid is required" }, { status: 400 });
    }

    const detail = await getTransactionDetail(uid);
    if (!detail.row) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...detail });
  } catch (err) {
    console.error("[api/transactions/detail] failed", err);
    return NextResponse.json({ success: false, error: "Failed to load transaction detail" }, { status: 500 });
  }
}
