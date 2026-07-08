import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getTotals,
  getBreakdown,
  getDaily,
  type Filters,
} from "@/lib/db/operations/verification-analytics";

export const runtime = "nodejs";

/** GET /api/super-admin/verification/analytics?subjectType=&documentKind=&provider=&from=&to= */
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const params = req.nextUrl.searchParams;
  const s = params.get("subjectType");
  const filters: Filters = {
    subjectType: s === "rider" || s === "merchant_store" ? s : undefined,
    documentKind: params.get("documentKind") ?? undefined,
    provider: params.get("provider") === "cashfree" ? "cashfree" : undefined,
    fromDate: params.get("from") ?? undefined,
    toDate: params.get("to") ?? undefined,
  };

  try {
    const [totals, breakdown, daily] = await Promise.all([
      getTotals(filters),
      getBreakdown(filters),
      getDaily(filters, 14),
    ]);
    return NextResponse.json({ success: true, totals, breakdown, daily, filters });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
