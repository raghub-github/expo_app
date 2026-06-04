/**
 * GET/PUT /api/admin/rider-onboarding-commission — super admin only.
 * Controls rider app onboarding fee (amount, GST, copy).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import {
  getRiderOnboardingCommissionConfig,
  updateRiderOnboardingCommissionConfig,
  type RiderOnboardingCommissionConfigUpdate,
} from "@/lib/db/operations/rider-onboarding-commission-config";

export const runtime = "nodejs";

async function requireSuperAdminResponse() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
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

function parseBody(body: Record<string, unknown>): { ok: true; value: RiderOnboardingCommissionConfigUpdate } | { ok: false; error: string } {
  const standardOnboardingFee = parseNum(body.standardOnboardingFee);
  const discountedOnboardingFee = parseNum(body.discountedOnboardingFee);
  const discountPercent = parseNum(body.discountPercent);
  const gstPercent = parseNum(body.gstPercent);
  if (standardOnboardingFee == null) return { ok: false, error: "Invalid standardOnboardingFee" };
  if (discountedOnboardingFee == null) return { ok: false, error: "Invalid discountedOnboardingFee" };
  if (discountPercent == null) return { ok: false, error: "Invalid discountPercent" };
  if (gstPercent == null) return { ok: false, error: "Invalid gstPercent" };

  const dp = Number(discountPercent);
  const gp = Number(gstPercent);
  if (dp < 0 || dp > 100) return { ok: false, error: "discountPercent must be 0–100" };
  if (gp < 0 || gp > 100) return { ok: false, error: "gstPercent must be 0–100" };
  if (Number(standardOnboardingFee) < 0 || Number(discountedOnboardingFee) < 0) {
    return { ok: false, error: "Fees must be non-negative" };
  }

  const discountPeriodLabel =
    typeof body.discountPeriodLabel === "string" && body.discountPeriodLabel.trim()
      ? body.discountPeriodLabel.trim()
      : "for limited time";

  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  const subtitle = typeof body.subtitle === "string" ? body.subtitle.trim() : "";
  const feeLabel = typeof body.feeLabel === "string" ? body.feeLabel.trim() : "";
  const infoMessage = typeof body.infoMessage === "string" ? body.infoMessage.trim() : "";
  const alertNotice = typeof body.alertNotice === "string" ? body.alertNotice.trim() : "";
  const footerNote = typeof body.footerNote === "string" ? body.footerNote.trim() : "";
  if (!headline) return { ok: false, error: "headline is required" };
  if (!subtitle) return { ok: false, error: "subtitle is required" };
  if (!feeLabel) return { ok: false, error: "feeLabel is required" };
  if (!infoMessage) return { ok: false, error: "infoMessage is required" };
  if (!alertNotice) return { ok: false, error: "alertNotice is required" };
  if (!footerNote) return { ok: false, error: "footerNote is required" };

  let payButtonText: string | null = null;
  if (body.payButtonText != null && String(body.payButtonText).trim() !== "") {
    payButtonText = String(body.payButtonText).trim();
  }

  return {
    ok: true,
    value: {
      standardOnboardingFee,
      discountedOnboardingFee,
      discountPercent,
      gstPercent,
      discountPeriodLabel,
      headline,
      subtitle,
      feeLabel,
      infoMessage,
      alertNotice,
      footerNote,
      payButtonText,
    },
  };
}

export async function GET() {
  const gate = await requireSuperAdminResponse();
  if (gate) return gate;
  try {
    const config = await getRiderOnboardingCommissionConfig();
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: "Config not found — apply migration 0254_rider_onboarding_commission_config.sql",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[GET /api/admin/rider-onboarding-commission]", e);
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
    const config = await updateRiderOnboardingCommissionConfig(parsed.value);
    return NextResponse.json({ success: true, config });
  } catch (e) {
    console.error("[PUT /api/admin/rider-onboarding-commission]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
