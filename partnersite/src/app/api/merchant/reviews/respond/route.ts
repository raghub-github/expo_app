import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/merchant/reviews/respond
 * Body: { reviewId, message, images? }
 * Updates `merchant_store_ratings` — same table as merchant app reply API.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reviewId, message, images } = body;

    if (!reviewId || (!message?.trim() && (!images || images.length === 0))) {
      return NextResponse.json(
        { success: false, error: "Review ID and either message or images are required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Please log in to respond to reviews." }, { status: 401 });
    }

    let merchant_parent_id: number | null = null;
    try {
      const validation = await validateMerchantFromSession({
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
      });
      if (validation.merchantParentId != null) {
        merchant_parent_id = validation.merchantParentId;
      }
    } catch {
      return NextResponse.json({ success: false, error: "Merchant account not found." }, { status: 403 });
    }

    if (merchant_parent_id == null) {
      return NextResponse.json({ success: false, error: "Merchant account not found." }, { status: 403 });
    }

    const db = getSupabaseAdmin();

    const { data: ratingRow, error: ratingErr } = await db
      .from("merchant_store_ratings")
      .select("id, store_id")
      .eq("id", reviewId)
      .maybeSingle();

    if (ratingErr || !ratingRow) {
      return NextResponse.json({ success: false, error: "Review not found." }, { status: 404 });
    }

    const { data: storeRow, error: storeErr } = await db
      .from("merchant_stores")
      .select("id, parent_id")
      .eq("id", ratingRow.store_id)
      .maybeSingle();

    if (storeErr || !storeRow || storeRow.parent_id !== merchant_parent_id) {
      return NextResponse.json(
        { success: false, error: "You don't have permission to respond to this review." },
        { status: 403 }
      );
    }

    let responseText = message?.trim() || "";
    if (images && Array.isArray(images) && images.length > 0) {
      const imageJson = JSON.stringify(images);
      if (responseText) {
        responseText += `\n\n[IMAGES:${imageJson}]`;
      } else {
        responseText = `[IMAGES:${imageJson}]`;
      }
    }

    const { data: updatedReview, error: updateError } = await db
      .from("merchant_store_ratings")
      .update({
        merchant_response: responseText,
        merchant_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .eq("store_id", ratingRow.store_id)
      .select()
      .single();

    if (updateError) {
      console.error("[merchant/reviews/respond] update error:", updateError);
      return NextResponse.json({ success: false, error: "Failed to save response." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Response saved successfully.",
      review: updatedReview,
    });
  } catch (e) {
    console.error("[merchant/reviews/respond] Error:", e);
    return NextResponse.json({ success: false, error: "An error occurred. Please try again." }, { status: 500 });
  }
}
