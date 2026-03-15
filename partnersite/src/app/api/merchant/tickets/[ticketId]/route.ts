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
 * GET /api/merchant/tickets/[ticketId]
 * Get a single ticket by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId: ticketIdParam } = await params;
    const ticketId = parseInt(ticketIdParam);

    if (!ticketId || isNaN(ticketId)) {
      return NextResponse.json(
        { success: false, error: "Invalid ticket ID." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in." },
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
    
    // Fetch ticket
    const { data: ticket, error: ticketError } = await db
      .from("unified_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket not found." },
        { status: 404 }
      );
    }

    if (ticket.merchant_parent_id !== merchant_parent_id) {
      return NextResponse.json(
        { success: false, error: "You don't have permission to view this ticket." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket: ticket,
    });
  } catch (e) {
    console.error("[merchant/tickets/[ticketId]] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
