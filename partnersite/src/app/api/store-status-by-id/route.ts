import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const storePublicId = req.nextUrl.searchParams.get("store_id");
    
    if (!storePublicId) {
      return NextResponse.json(
        { success: false, error: "Store ID is required" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();

    // Get store information from database
    const { data: storeData, error: storeError } = await db
      .from("merchant_stores")
      .select(`
        id,
        store_id,
        store_name,
        approval_status,
        status,
        onboarding_completed,
        current_onboarding_step,
        created_at,
        updated_at
      `)
      .eq("store_id", storePublicId)
      .single();

    if (storeError || !storeData) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    // Get registration progress from database
    const { data: progressData, error: progressError } = await db
      .from("merchant_store_registration_progress")
      .select(`
        id,
        current_step,
        completed_steps,
        registration_status,
        step_1_completed,
        step_2_completed,
        step_3_completed,
        step_4_completed,
        step_5_completed,
        step_6_completed,
        completed_at,
        created_at,
        updated_at
      `)
      .eq("store_id", storeData.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Determine the current status based on database records
    let currentStatus = "unknown";
    let statusDetails = {};

    if (storeData.onboarding_completed && storeData.approval_status === "APPROVED") {
      currentStatus = "completed_and_approved";
      statusDetails = {
        message: "Store registration completed and approved",
        canAcceptOrders: storeData.status === "ACTIVE",
      };
    } else if (storeData.onboarding_completed && storeData.approval_status === "SUBMITTED") {
      currentStatus = "completed_pending_approval";
      statusDetails = {
        message: "Store registration completed, pending approval",
        canAcceptOrders: false,
      };
    } else if (storeData.onboarding_completed && storeData.approval_status === "REJECTED") {
      currentStatus = "completed_but_rejected";
      statusDetails = {
        message: "Store registration completed but rejected",
        canAcceptOrders: false,
      };
    } else if (progressData?.registration_status === "COMPLETED") {
      currentStatus = "registration_completed";
      statusDetails = {
        message: "Registration process completed",
        canAcceptOrders: false,
      };
    } else if (progressData?.registration_status === "IN_PROGRESS") {
      currentStatus = "in_progress";
      statusDetails = {
        message: `Registration in progress - Step ${progressData.current_step || 1} of 9`,
        currentStep: progressData.current_step || 1,
        completedSteps: progressData.completed_steps || 0,
        canAcceptOrders: false,
      };
    } else if (progressData?.registration_status === "DRAFT") {
      currentStatus = "draft";
      statusDetails = {
        message: "Registration saved as draft",
        currentStep: progressData.current_step || 1,
        completedSteps: progressData.completed_steps || 0,
        canAcceptOrders: false,
      };
    } else if (storeData.approval_status === "DRAFT") {
      currentStatus = "draft";
      statusDetails = {
        message: "Store exists as draft",
        canAcceptOrders: false,
      };
    }

    return NextResponse.json({
      success: true,
      store: {
        id: storeData.id,
        store_id: storeData.store_id,
        store_name: storeData.store_name,
        approval_status: storeData.approval_status,
        status: storeData.status,
        onboarding_completed: storeData.onboarding_completed,
        current_onboarding_step: storeData.current_onboarding_step,
        created_at: storeData.created_at,
        updated_at: storeData.updated_at,
      },
      progress: progressData,
      currentStatus,
      statusDetails,
    });
  } catch (error) {
    console.error("[store-status-by-id] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}