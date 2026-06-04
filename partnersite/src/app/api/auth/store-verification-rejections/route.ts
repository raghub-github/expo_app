/**
 * GET /api/auth/store-verification-rejections?store_public_id=GMMCxxxx
 * Active step rejections for the merchant's store (for onboarding lock / Review & fix).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
    }

    const storePublicId = request.nextUrl.searchParams.get("store_public_id")?.trim();
    if (!storePublicId) {
      return NextResponse.json(
        { success: false, error: "store_public_id is required" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select("id")
      .eq("store_id", storePublicId)
      .eq("parent_id", validation.merchantParentId)
      .maybeSingle();

    if (storeErr || !storeRow?.id) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const internalId = storeRow.id as number;
    const { data: rows, error: rejErr } = await db
      .from("store_verification_step_rejections")
      .select(
        "step_number, step_label, rejection_reason, rejected_at, merchant_resubmitted_at, step_rejection_detail"
      )
      .eq("store_id", internalId)
      .order("step_number", { ascending: true });

    if (rejErr) {
      console.warn("[store-verification-rejections]", rejErr.message);
      return NextResponse.json({
        success: true,
        rejections: [],
        min_verification_step: null,
      });
    }

    const rejections = (rows ?? []).map((r) => ({
      step_number: Number(r.step_number),
      step_label: (r.step_label as string | null) ?? null,
      rejection_reason: String(r.rejection_reason ?? ""),
      rejected_at:
        typeof r.rejected_at === "string"
          ? r.rejected_at
          : r.rejected_at != null
            ? String(r.rejected_at)
            : "",
      merchant_resubmitted_at:
        r.merchant_resubmitted_at == null
          ? null
          : typeof r.merchant_resubmitted_at === "string"
            ? r.merchant_resubmitted_at
            : String(r.merchant_resubmitted_at),
      step_rejection_detail: (r as { step_rejection_detail?: unknown }).step_rejection_detail ?? null,
    }));

    const minVerificationStep =
      rejections.length > 0 ? Math.min(...rejections.map((x) => x.step_number)) : null;

    return NextResponse.json({
      success: true,
      rejections,
      min_verification_step: minVerificationStep,
    });
  } catch (e) {
    console.error("[GET /api/auth/store-verification-rejections]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
