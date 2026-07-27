/**
 * GET/PUT /api/admin/store-onboarding-commission — super admin only.
 * Controls the store registration "Commission plan" / onboarding fee section.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import {
  getStoreOnboardingCommissionConfig,
  updateStoreOnboardingCommissionConfig,
  type StoreOnboardingCommissionConfigUpdate,
} from "@/lib/db/operations/store-onboarding-commission-config";

export const runtime = "nodejs";

async function requireSuperAdminResponse() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return NextResponse.json(
        { success: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401 }
      );
    }
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }
  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) {
    return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
  }
  return null;
}

function parseNum(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return String(n);
  }
  return null;
}

function parseBody(body: Record<string, unknown>): { ok: true; value: StoreOnboardingCommissionConfigUpdate } | { ok: false; error: string } {
  const planName = typeof body.planName === "string" ? body.planName.trim() : "";
  if (!planName) return { ok: false, error: "planName is required" };

  const showRecommendedBadge =
    typeof body.showRecommendedBadge === "boolean" ? body.showRecommendedBadge : Boolean(body.showRecommendedBadge);

  const standardOnboardingFee = parseNum(body.standardOnboardingFee);
  const discountedOnboardingFee = parseNum(body.discountedOnboardingFee);
  const discountPercent = parseNum(body.discountPercent);
  const baseServiceFeePercent = parseNum(body.baseServiceFeePercent);
  const gstPercent = parseNum(body.gstPercent);
  if (standardOnboardingFee == null) return { ok: false, error: "Invalid standardOnboardingFee" };
  if (discountedOnboardingFee == null) return { ok: false, error: "Invalid discountedOnboardingFee" };
  if (discountPercent == null) return { ok: false, error: "Invalid discountPercent" };
  if (baseServiceFeePercent == null) return { ok: false, error: "Invalid baseServiceFeePercent" };
  if (gstPercent == null) return { ok: false, error: "Invalid gstPercent" };

  const dp = Number(discountPercent);
  const bsf = Number(baseServiceFeePercent);
  const gp = Number(gstPercent);
  if (dp < 0 || dp > 100) return { ok: false, error: "discountPercent must be 0–100" };
  if (bsf < 0 || bsf > 100) return { ok: false, error: "baseServiceFeePercent must be 0–100" };
  if (gp < 0 || gp > 100) return { ok: false, error: "gstPercent must be 0–100" };
  if (Number(standardOnboardingFee) < 0 || Number(discountedOnboardingFee) < 0) {
    return { ok: false, error: "Fees must be non-negative" };
  }

  const discountPeriodLabel =
    typeof body.discountPeriodLabel === "string" && body.discountPeriodLabel.trim()
      ? body.discountPeriodLabel.trim()
      : "for limited time";
  const baseServiceFeePeriodLabel =
    typeof body.baseServiceFeePeriodLabel === "string" && body.baseServiceFeePeriodLabel.trim()
      ? body.baseServiceFeePeriodLabel.trim()
      : "for initial period";

  let features: string[] = [];
  if (Array.isArray(body.features)) {
    features = body.features.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  } else if (typeof body.featuresText === "string") {
    const t = body.featuresText;
    features = t.includes("\n")
      ? t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : t.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  }

  if (features.length === 0) {
    return { ok: false, error: "At least one feature line is required" };
  }

  const alertNotice = typeof body.alertNotice === "string" ? body.alertNotice.trim() : "";
  const footerNote = typeof body.footerNote === "string" ? body.footerNote.trim() : "";
  const supportContact = typeof body.supportContact === "string" ? body.supportContact.trim() : "";
  if (!alertNotice) return { ok: false, error: "alertNotice is required" };
  if (!footerNote) return { ok: false, error: "footerNote is required" };
  if (!supportContact) return { ok: false, error: "supportContact is required" };

  let payButtonText: string | null = null;
  if (body.payButtonText != null && String(body.payButtonText).trim() !== "") {
    payButtonText = String(body.payButtonText).trim();
  }

  return {
    ok: true,
    value: {
      planName,
      showRecommendedBadge,
      standardOnboardingFee,
      discountedOnboardingFee,
      discountPercent,
      baseServiceFeePercent,
      gstPercent,
      discountPeriodLabel,
      baseServiceFeePeriodLabel,
      features,
      alertNotice,
      footerNote,
      supportContact,
      payButtonText,
    },
  };
}

export async function GET() {
  const gate = await requireSuperAdminResponse();
  if (gate) return gate;
  try {
    const config = await getStoreOnboardingCommissionConfig();
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: "Config not found — apply migrations 0189_store_onboarding_commission_config.sql and 0191_onboarding_fee_gst.sql",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[GET /api/admin/store-onboarding-commission]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireSuperAdminResponse();
  if (gate) return gate;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const config = await updateStoreOnboardingCommissionConfig(parsed.value);
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[PUT /api/admin/store-onboarding-commission]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
