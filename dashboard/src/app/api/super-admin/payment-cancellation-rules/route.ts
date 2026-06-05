import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  isPaymentEngineMigrated,
  listPaymentCancellationRules,
} from "@/lib/db/operations/payment-cancellation-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — read-only legacy snapshot. Writes are deprecated (use Financial Rule Engine). */
export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const migrated = await isPaymentEngineMigrated();
    if (!migrated) {
      return NextResponse.json({
        success: true,
        migrationRequired: true,
        rows: [],
        deprecated: true,
        message: "Run migrations 0239 and 0240 on Supabase first.",
      });
    }
    const rows = await listPaymentCancellationRules();
    return NextResponse.json({
      success: true,
      migrationRequired: false,
      deprecated: true,
      rows,
      message: "Legacy table — edit active rules in /dashboard/super-admin/rule-engine",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: "Deprecated. Manage cancellation/refund rules in Financial Rule Engine (/dashboard/super-admin/rule-engine).",
      deprecated: true,
    },
    { status: 410 }
  );
}
