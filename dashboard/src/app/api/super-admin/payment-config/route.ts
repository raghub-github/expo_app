import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getPaymentConfigBundle } from "@/lib/db/operations/payment-config";
import { isPaymentEngineMigrated } from "@/lib/db/operations/payment-cancellation-rules";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  table: z.enum([
    "payment_settlement_rules",
    "payment_cancellation_rules",
    "payment_hold_rules",
    "payment_payout_rules",
    "payment_commission_rules",
    "payment_tax_rules",
    "payment_refund_rules",
    "payment_global_settings",
  ]),
  id: z.number().int().positive().optional(),
  payload: z.record(z.unknown()),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const migrationRequired = !(await isPaymentEngineMigrated());
    const bundle = await getPaymentConfigBundle();
    return NextResponse.json({
      success: true,
      migrationRequired,
      ...(migrationRequired
        ? { message: "Run SQL migrations 0239 + 0240 on Supabase, then refresh." }
        : {}),
      ...bundle,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }

  const { table, id, payload } = parsed.data;
  const sql = getSql();
  const allowed: Record<string, string[]> = {
    payment_settlement_rules: [
      "rule_name", "merchant_share_mode", "merchant_share_value",
      "platform_commission_mode", "platform_commission_value", "is_active", "priority",
    ],
    payment_cancellation_rules: [
      "rule_name", "merchant_gets_payment", "customer_refund_mode", "customer_refund_value",
      "platform_keeps_commission", "is_active", "priority",
    ],
    payment_hold_rules: ["rule_name", "hold_hours", "auto_release_enabled", "is_active"],
    payment_payout_rules: [
      "rule_name", "min_payout_amount", "requires_admin_approval", "max_retries", "is_active",
    ],
    payment_commission_rules: ["rule_name", "calculation_mode", "commission_value", "is_active"],
    payment_tax_rules: ["rule_name", "tax_value", "calculation_mode", "is_active"],
    payment_refund_rules: ["rule_name", "customer_refund_value", "auto_reverse_if_settled", "is_active"],
    payment_global_settings: ["setting_value", "description", "is_active"],
  };

  const cols = allowed[table];
  if (!cols) {
    return NextResponse.json({ success: false, error: "Invalid table" }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
  }

  try {
    if (table === "payment_settlement_rules") {
      await sql`
        UPDATE payment_settlement_rules SET
          merchant_share_value = COALESCE(${payload.merchant_share_value as number | null}, merchant_share_value),
          platform_commission_value = COALESCE(${payload.platform_commission_value as number | null}, platform_commission_value),
          is_active = COALESCE(${payload.is_active as boolean | null}, is_active),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (table === "payment_hold_rules") {
      await sql`
        UPDATE payment_hold_rules SET
          hold_hours = COALESCE(${payload.hold_hours as number | null}, hold_hours),
          is_active = COALESCE(${payload.is_active as boolean | null}, is_active),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (table === "payment_payout_rules") {
      await sql`
        UPDATE payment_payout_rules SET
          min_payout_amount = COALESCE(${payload.min_payout_amount as number | null}, min_payout_amount),
          requires_admin_approval = COALESCE(${payload.requires_admin_approval as boolean | null}, requires_admin_approval),
          is_active = COALESCE(${payload.is_active as boolean | null}, is_active),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (table === "payment_commission_rules") {
      await sql`
        UPDATE payment_commission_rules SET
          commission_value = COALESCE(${payload.commission_value as number | null}, commission_value),
          is_active = COALESCE(${payload.is_active as boolean | null}, is_active),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } else if (table === "payment_global_settings") {
      await sql`
        UPDATE payment_global_settings SET
          setting_value = COALESCE(${JSON.stringify(payload.setting_value ?? {})}::jsonb, setting_value),
          is_active = COALESCE(${payload.is_active as boolean | null}, is_active),
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }
    const bundle = await getPaymentConfigBundle();
    return NextResponse.json({ success: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
