import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { applyMerchantReferralOnParentCreate } from "@/lib/applyMerchantReferralOnParent";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const referralCode = typeof body.referralCode === "string" ? body.referralCode : "";
    if (referralCode.trim().length < 3) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) {
      return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (validation.merchantParentId == null) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_parent" });
    }

    const result = await applyMerchantReferralOnParentCreate({
      parentPk: validation.merchantParentId,
      referralCode,
      source: "deep_link",
    });
    if (
      result.status === 409 ||
      result.error === "REFERRAL_SERVICE_DISABLED" ||
      result.error === "referral_disabled"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "REFERRAL_SERVICE_DISABLED",
          code: "REFERRAL_SERVICE_DISABLED",
          userMessage: "This referral code is no longer available.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn("[referral/apply-pending]", e);
    return NextResponse.json({ ok: false, error: "apply_failed" }, { status: 500 });
  }
}
