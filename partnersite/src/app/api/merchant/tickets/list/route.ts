import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/tickets/list
 * Returns tickets for the current merchant
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to view tickets." },
        { status: 401 }
      );
    }

    let merchant_parent_id: number | null = null;
    try {
      const validation = await validateMerchantFromSession({ 
        id: user.id, 
        email: user.email ?? null, 
        phone: user.phone ?? null 
      });
      if (validation.merchantParentId != null) {
        merchant_parent_id = validation.merchantParentId;
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Merchant account not found." },
        { status: 403 }
      );
    }

    const db = getSupabaseAdmin();
    
    // Fetch tickets for this merchant
    const { data: tickets, error } = await db
      .from("unified_tickets")
      .select("*")
      .eq("merchant_parent_id", merchant_parent_id)
      .eq("ticket_source", "MERCHANT")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[merchant/tickets/list] fetch error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch tickets." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tickets: tickets || [],
    });
  } catch (e) {
    console.error("[merchant/tickets/list] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
