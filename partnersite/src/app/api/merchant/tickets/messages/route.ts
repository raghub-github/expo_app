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
 * GET /api/merchant/tickets/messages?ticket_id=123
 * Returns all messages for a specific ticket
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticket_id = searchParams.get('ticket_id');

    if (!ticket_id) {
      return NextResponse.json(
        { success: false, error: "Ticket ID is required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to view messages." },
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
    
    // Verify ticket belongs to this merchant
    const { data: ticket, error: ticketError } = await db
      .from("unified_tickets")
      .select("id, merchant_parent_id")
      .eq("id", ticket_id)
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

    // Fetch all messages for this ticket
    const { data: messages, error: messagesError } = await db
      .from("unified_ticket_messages")
      .select("*")
      .eq("ticket_id", ticket_id)
      .eq("is_internal_note", false) // Don't show internal notes to merchants
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[merchant/tickets/messages] fetch error:", messagesError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch messages." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messages: messages || [],
    });
  } catch (e) {
    console.error("[merchant/tickets/messages] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
