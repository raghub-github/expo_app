import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getReferralAnalyticsAdmin,
  getReferralSettingsAdmin,
  isReferralEngineMigrated,
  listReferralAuditAdmin,
  listReferralRewardRulesAdmin,
  updateReferralSettingsAdmin,
} from "@/lib/db/operations/referral-engine";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    if (!(await isReferralEngineMigrated())) {
      return NextResponse.json(
        {
          error: "Referral engine migration required (0470_unified_referral_rewards_engine.sql)",
          migrationRequired: true,
        },
        { status: 503 },
      );
    }
    const [settings, rules, analytics, audit] = await Promise.all([
      getReferralSettingsAdmin(),
      listReferralRewardRulesAdmin(),
      getReferralAnalyticsAdmin(),
      listReferralAuditAdmin(30),
    ]);
    return NextResponse.json({
      settings,
      rules,
      analytics,
      audit,
      migrationRequired: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load referral settings";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  reward_enabled: z.boolean().optional(),
  customer_referral_enabled: z.boolean().optional(),
  rider_referral_enabled: z.boolean().optional(),
  merchant_referral_enabled: z.boolean().optional(),
  customer_reward_enabled: z.boolean().optional(),
  rider_reward_enabled: z.boolean().optional(),
  merchant_reward_enabled: z.boolean().optional(),
  auto_apply_enabled: z.boolean().optional(),
  require_kyc: z.boolean().optional(),
  first_order_only: z.boolean().optional(),
  min_order_amount: z.number().nonnegative().optional(),
  monthly_reward_cap: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(8).optional(),
  eligible_services: z.array(z.string()).optional(),
  fraud_checks: z.record(z.string(), z.unknown()).optional(),
  deep_link: z.record(z.string(), z.unknown()).optional(),
  notification_templates: z.record(z.string(), z.unknown()).optional(),
  referral_validity_days: z.number().int().positive().max(3650).optional(),
  reward_expiry_days: z.number().int().positive().max(3650).optional(),
  reward_claim_window_days: z.number().int().positive().max(3650).optional(),
  code_prefix_customer: z.string().min(1).max(16).optional(),
  code_prefix_rider: z.string().min(1).max(16).optional(),
  code_prefix_merchant: z.string().min(1).max(16).optional(),
  reward_mode: z.enum(["incremental", "highest_only"]).optional(),
  referral_expiry_enabled: z.boolean().optional(),
  max_successful_referrals: z.number().int().nonnegative().nullable().optional(),
  campaign_budget: z.number().nonnegative().nullable().optional(),
  merchant_qualification_scope: z
    .enum(["ALL_CHILD_STORES", "SINGLE_STORE", "SELECTED_STORES"])
    .optional(),
  merchant_qualification_store_ids: z.array(z.number().int().positive()).optional(),
  reason: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const body = patchSchema.parse(await req.json());
    const { reason, ...patch } = body;
    const result = await updateReferralSettingsAdmin(patch, {
      adminEmail: null,
      reason: reason ?? null,
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update settings";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
