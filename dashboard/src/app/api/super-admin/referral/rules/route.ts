import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  createReferralRewardRuleAdmin,
  listReferralRewardRulesAdmin,
} from "@/lib/db/operations/referral-engine";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const userType = req.nextUrl.searchParams.get("userType") as
      | "customer"
      | "rider"
      | "merchant"
      | null;
    const rules = await listReferralRewardRulesAdmin(userType ?? undefined);
    return NextResponse.json({ rules });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list rules";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const createSchema = z.object({
  user_type: z.enum(["customer", "rider", "merchant"]),
  rule_code: z.string().min(2).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  milestone_orders: z.number().int().nonnegative(),
  reward_amount: z.number().nonnegative(),
  reward_type: z.enum(["GATICASH", "WALLET_CREDIT"]),
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

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const body = createSchema.parse(await req.json());
    const result = await createReferralRewardRuleAdmin(body, {
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create rule";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
