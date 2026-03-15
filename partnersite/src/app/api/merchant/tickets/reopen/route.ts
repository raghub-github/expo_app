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
 * POST /api/merchant/tickets/reopen
 * Body: { ticket_id }
 * Reopens a resolved/closed ticket
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticket_id } = body;

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
        { success: false, error: "Please log in to reopen tickets." },
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
      .select("id, merchant_parent_id, status, resolved_at")
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
        { success: false, error: "You don't have permission to reopen this ticket." },
        { status: 403 }
      );
    }

    // Strict: closed tickets cannot be reopened under any condition
    if (ticket.status === 'CLOSED') {
      return NextResponse.json(
        { success: false, error: "Closed tickets cannot be reopened." },
        { status: 400 }
      );
    }

    // Only allow reopening if ticket is RESOLVED (or already REOPENED for idempotency)
    if (ticket.status !== 'RESOLVED' && ticket.status !== 'REOPENED') {
      return NextResponse.json(
        { success: false, error: "Only resolved tickets can be reopened." },
        { status: 400 }
      );
    }

    // Update ticket status to REOPENED and mark as reopened
    // Keep resolved_at to track that it was previously resolved (for filtering)
    // Note: When this ticket is resolved again (by agent), reopened_at should be cleared
    const updateData: any = {
      status: 'REOPENED',
      updated_at: new Date().toISOString(),
      resolution: null,
      resolved_by_name: null,
      reopened_at: new Date().toISOString(),
      // Keep resolved_at to identify reopened tickets in the UI
    };
    
    const { data: updatedTicket, error: updateError } = await db
      .from("unified_tickets")
      .update(updateData)
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      console.error("[merchant/tickets/reopen] update error:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to reopen ticket." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Ticket reopened successfully.",
      ticket: updatedTicket,
    });
  } catch (e) {
    console.error("[merchant/tickets/reopen] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
