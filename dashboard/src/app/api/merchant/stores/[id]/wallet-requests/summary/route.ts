/**
 * GET /api/merchant/stores/[id]/wallet-requests/summary
 * Returns status counts for wallet requests for a specific store.
 */
import { NextResponse } from "next/server";
import { assertStoreAccess } from "@/app/api/merchant/stores/[id]/menu/assert-store-access";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM merchant_wallet_credit_requests
      WHERE merchant_store_id = ${storeId}
      GROUP BY status
    `;

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 };
    for (const r of rows as any[]) {
      const s = String(r.status ?? "");
      if (!s) continue;
      counts[s] = Number(r.count ?? 0);
    }
    const total = Object.values(counts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

    return NextResponse.json({ success: true, counts, total });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/wallet-requests/summary]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

