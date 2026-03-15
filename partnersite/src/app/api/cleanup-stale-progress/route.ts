import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/cleanup-stale-progress
 * Marks orphaned progress rows as COMPLETED when all stores for that parent have completed onboarding.
 * This prevents the "Incomplete onboarding draft" banner from showing incorrectly.
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseAdmin();

    // Get all progress rows with store_id = null and registration_status != COMPLETED
    const { data: staleProgress, error: progressError } = await db
      .from("merchant_store_registration_progress")
      .select("id, parent_id")
      .is("store_id", null)
      .neq("registration_status", "COMPLETED");

    if (progressError) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch progress rows" },
        { status: 500 }
      );
    }

    if (!staleProgress || staleProgress.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No stale progress rows found",
        cleaned: 0,
      });
    }

    let cleanedCount = 0;

    // For each stale progress row, check if the parent has any incomplete stores
    for (const progress of staleProgress) {
      const { data: stores } = await db
        .from("merchant_stores")
        .select("id, approval_status, current_onboarding_step, onboarding_completed")
        .eq("parent_id", progress.parent_id);

      if (!stores || stores.length === 0) {
        // No stores for this parent, skip (they might be in the middle of creating their first store)
        continue;
      }

      // Check if there are any incomplete stores
      const hasIncompleteStore = stores.some((s) => {
        const isDraft = (s.approval_status || "").toUpperCase() === "DRAFT";
        const isIncomplete = typeof s.current_onboarding_step === "number" && s.current_onboarding_step < 9;
        return isDraft || isIncomplete;
      });

      // If no incomplete stores, mark the progress as COMPLETED
      if (!hasIncompleteStore) {
        await db
          .from("merchant_store_registration_progress")
          .update({
            registration_status: "COMPLETED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", progress.id);
        cleanedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cleanedCount} stale progress rows`,
      cleaned: cleanedCount,
    });
  } catch (e) {
    console.error("[cleanup-stale-progress] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred" },
      { status: 500 }
    );
  }
}
