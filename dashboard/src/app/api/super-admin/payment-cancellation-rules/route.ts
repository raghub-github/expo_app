import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertPaymentCancellationRule,
  isPaymentEngineMigrated,
  listPaymentCancellationRules,
} from "@/lib/db/operations/payment-cancellation-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  rule_code: z.string().min(1).max(80),
  rule_name: z.string().min(1).max(200),
  order_milestone: z.string().min(1),
  cancelled_by: z.string().optional().nullable(),
  merchant_gets_payment: z.boolean().optional(),
  merchant_payment_value: z.number().optional(),
  customer_refund_mode: z.enum(["NONE", "FULL", "PARTIAL", "PLATFORM_POLICY"]).optional(),
  customer_refund_value: z.number().optional(),
  platform_keeps_commission: z.boolean().optional(),
  priority: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

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
        message: "Run migrations 0239 and 0240 on Supabase first.",
      });
    }
    const rows = await listPaymentCancellationRules();
    return NextResponse.json({ success: true, migrationRequired: false, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const row = await insertPaymentCancellationRule({
      ...parsed.data,
      cancelled_by: parsed.data.cancelled_by || null,
    });
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
