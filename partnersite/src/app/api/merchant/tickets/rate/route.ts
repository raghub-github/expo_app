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

/**
 * POST /api/merchant/tickets/rate
 * Body: { ticket_id, rating, feedback }
 * Adds rating to a resolved ticket
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticket_id, rating, feedback } = body;

    if (!ticket_id || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "Ticket ID and rating (1-5) are required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to rate tickets." },
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
    
    // Verify ticket belongs to this merchant and is resolved
    const { data: ticket, error: ticketError } = await db
      .from("unified_tickets")
      .select("id, merchant_parent_id, status")
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
        { success: false, error: "You don't have permission to rate this ticket." },
        { status: 403 }
      );
    }

    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      return NextResponse.json(
        { success: false, error: "Only resolved or closed tickets can be rated." },
        { status: 400 }
      );
    }

    // Update ticket with rating
    const { data: updatedTicket, error: updateError } = await db
      .from("unified_tickets")
      .update({
        satisfaction_rating: rating,
        satisfaction_feedback: feedback || null,
        satisfaction_collected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      console.error("[merchant/tickets/rate] update error:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to submit rating." },
        { status: 500 }
      );
    }

    const bucket = rating >= 4 ? "CSAT" : rating <= 2 ? "DSAT" : "Neutral";
    try {
      await db.from("unified_ticket_activity_audit").insert({
        ticket_id: ticket_id,
        activity_type: "satisfaction_rating",
        activity_category: "feedback",
        activity_description: `${bucket} ${rating}/5 submitted`,
        actor_type: "MERCHANT",
        actor_name: user.email ?? "Merchant",
        actor_email: user.email ?? null,
        new_value: { rating, feedback: feedback || null, bucket: bucket.toLowerCase() },
        changed_fields: [
          "satisfaction_rating",
          "satisfaction_feedback",
          "satisfaction_collected_at",
        ],
        update_source: "system",
      });
    } catch (auditErr) {
      console.warn("[merchant/tickets/rate] activity audit skipped:", auditErr);
    }

    return NextResponse.json({
      success: true,
      message: "Rating submitted successfully.",
      ticket: updatedTicket,
    });
  } catch (e) {
    console.error("[merchant/tickets/rate] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
