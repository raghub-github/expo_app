/**
 * GET /api/transactions
 * Central transactions list across Customer / Merchant / Rider apps.
 * Read-only aggregation over existing payment sources. Super-admin only.
 * Server-side pagination (keyset cursor) + filters + exact-id search.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { isSuperAdmin } from "@/lib/permissions/engine";
import {
  listTransactions,
  type TxnApp,
  type TxnNormStatus,
  type ListTransactionsParams,
} from "@/lib/db/operations/transactions";

const APPS = new Set(["customer", "merchant", "rider"]);
const NORM_STATUSES = new Set([
  "created", "pending", "paid", "captured_unfinalized", "failed",
  "reconciliation_required", "refund_pending", "refunded", "refund_failed", "cancelled", "unknown",
]);

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

    const sp = request.nextUrl.searchParams;
    const appRaw = (sp.get("app") ?? "").toLowerCase();
    const statusRaw = (sp.get("status") ?? "").toLowerCase();
    const num = (v: string | null): number | null => {
      if (v == null || v.trim() === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const params: ListTransactionsParams = {
      app: APPS.has(appRaw) ? (appRaw as TxnApp) : null,
      service: sp.get("service") || null,
      normStatus: NORM_STATUSES.has(statusRaw) ? (statusRaw as TxnNormStatus) : null,
      paymentMode: sp.get("mode") || null,
      search: sp.get("q") || null,
      dateFrom: sp.get("dateFrom") || null,
      dateTo: sp.get("dateTo") || null,
      amountMinPaise: num(sp.get("amountMin")),
      amountMaxPaise: num(sp.get("amountMax")),
      cursor: sp.get("cursor") || null,
      page: num(sp.get("page")),
      limit: num(sp.get("limit")) ?? 20,
    };

    const result = await listTransactions(params);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[api/transactions] list failed", err);
    return NextResponse.json({ success: false, error: "Failed to load transactions" }, { status: 500 });
  }
}
