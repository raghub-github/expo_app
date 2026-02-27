/**
 * POST /api/auth/resolve-parent
 * Resolve parent merchant by phone; return parent and child stores (for merchant login flow).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone)
      return NextResponse.json({ error: "Phone required" }, { status: 400 });

    const digits = phone.replace(/\D/g, "");
    const normalized = digits.length > 10 ? digits.slice(-10) : digits;

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const { data: parent, error: parentError } = await supabaseAdmin
      .from("merchant_parents")
      .select("*")
      .eq("registered_phone_normalized", normalized)
      .single();

    if (parentError || !parent) {
      return NextResponse.json({ parentExists: false });
    }

    const { data: stores, error: storesError } = await supabaseAdmin
      .from("merchant_stores")
      .select(
        "store_id, store_name, full_address, store_phones, approval_status, is_active, current_onboarding_step, onboarding_completed"
      )
      .eq("parent_id", parent.id);

    if (storesError) {
      return NextResponse.json(
        { error: "Failed to fetch stores" },
        { status: 500 }
      );
    }

    const { data: progress, error: progressError } = await supabaseAdmin
      .from("merchant_store_registration_progress")
      .select("*")
      .eq("parent_id", parent.id)
      .is("store_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const storeList = stores || [];
    const hasDraftStore = storeList.some(
      (s) => (s.approval_status || "").toUpperCase() === "DRAFT"
    );
    const onboardingProgress =
      progress && hasDraftStore ? progress : null;

    return NextResponse.json({
      parentExists: true,
      parentId: parent.id,
      parentMerchantId: parent.parent_merchant_id ?? null,
      parentName: parent.parent_name ?? null,
      stores: storeList,
      onboardingProgress,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
