import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteReferralRewardRuleAdmin,
  updateReferralRewardRuleAdmin,
} from "@/lib/db/operations/referral-engine";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  milestone_orders: z.number().int().nonnegative().optional(),
  reward_amount: z.number().nonnegative().optional(),
  reward_type: z.enum(["GATICASH", "WALLET_CREDIT"]).optional(),
  reward_party: z.enum(["referrer", "referred"]).optional(),
  also_credit_referred: z.boolean().optional(),
  referred_reward_amount: z.number().nonnegative().nullable().optional(),
  require_kyc: z.boolean().nullable().optional(),
  min_order_amount: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
  priority: z.number().int().optional(),
  event_type: z.string().max(64).nullable().optional(),
  reward_mode: z.enum(["incremental", "highest_only"]).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const { id } = await ctx.params;
    const ruleId = Number(id);
    if (!Number.isFinite(ruleId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = patchSchema.parse(await req.json());
    const result = await updateReferralRewardRuleAdmin(ruleId, body, {
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update rule";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const { id } = await ctx.params;
    const ruleId = Number(id);
    if (!Number.isFinite(ruleId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const result = await deleteReferralRewardRuleAdmin(ruleId, {
      ip: _req.headers.get("x-forwarded-for") ?? _req.headers.get("x-real-ip"),
      userAgent: _req.headers.get("user-agent"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete rule";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
