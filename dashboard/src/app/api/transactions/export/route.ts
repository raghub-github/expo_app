/**
 * POST /api/transactions/export
 * Filtered transaction rows with payment breakdown for the xlsx export sheet.
 * Read-only. Super-admin only. Order id in each row is the formatted public id.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { isSuperAdmin } from "@/lib/permissions/engine";
import {
  exportTransactions,
  type TxnApp,
  type TxnNormStatus,
  type ListTransactionsParams,
} from "@/lib/db/operations/transactions";

const APPS = new Set(["customer", "merchant", "rider"]);
const NORM_STATUSES = new Set([
  "created", "pending", "paid", "captured_unfinalized", "failed",
  "reconciliation_required", "refund_pending", "refunded", "refund_failed", "cancelled", "unknown",
]);

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function strList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  return out.length ? out : null;
}

function rupeesToPaise(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const appRaw = (str(body.app) ?? "").toLowerCase();
    const statusRaw = (str(body.status) ?? "").toLowerCase();

    const apps = (strList(body.apps) ?? []).map((a) => a.toLowerCase()).filter((a) => APPS.has(a));
    const paymentStatuses = (strList(body.paymentStatuses) ?? []).map((s) => s.toLowerCase()).filter((s) => NORM_STATUSES.has(s));

    const params: ListTransactionsParams = {
      app: apps.length === 0 && APPS.has(appRaw) ? (appRaw as TxnApp) : null,
      apps: apps.length ? apps : null,
      service: str(body.service),
      services: strList(body.services),
      normStatus: paymentStatuses.length === 0 && NORM_STATUSES.has(statusRaw) ? (statusRaw as TxnNormStatus) : null,
      paymentStatuses: paymentStatuses.length ? paymentStatuses : null,
      paymentMode: str(body.mode),
      paymentModes: strList(body.paymentModes),
      search: str(body.q),
      dateFrom: str(body.dateFrom),
      dateTo: str(body.dateTo),
      amountMinPaise: rupeesToPaise(body.amountMin),
      amountMaxPaise: rupeesToPaise(body.amountMax),
      orderId: str(body.orderId),
      orderStatuses: strList(body.orderStatuses),
      delivery: strList(body.delivery),
      userTypes: strList(body.userTypes),
      overdueOnly: body.overdueOnly === true,
      forExport: true,
    };

    const result = await exportTransactions(params);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[api/transactions/export] failed", err);
    return NextResponse.json({ success: false, error: "Failed to export transactions" }, { status: 500 });
  }
}
