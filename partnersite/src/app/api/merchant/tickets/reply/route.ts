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
 * POST /api/merchant/tickets/reply
 * Body: { ticket_id, message }
 * Adds a reply/comment to an existing ticket in unified_ticket_messages table
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticket_id, message, images } = body;

    if (!ticket_id || (!message?.trim() && (!images || images.length === 0))) {
      return NextResponse.json(
        { success: false, error: "Ticket ID and either message or images are required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to reply to tickets." },
        { status: 401 }
      );
    }

    let merchant_parent_id: number | null = null;
    let merchantData: any = null;
    try {
      const validation = await validateMerchantFromSession({ 
        id: user.id, 
        email: user.email ?? null, 
        phone: user.phone ?? null 
      });
      if (validation.merchantParentId != null) {
        merchant_parent_id = validation.merchantParentId;
        merchantData = validation;
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
        { success: false, error: "You don't have permission to reply to this ticket." },
        { status: 403 }
      );
    }

    // Strict: closed tickets cannot receive replies
    if (ticket.status === 'CLOSED') {
      return NextResponse.json(
        { success: false, error: "This ticket is closed. You cannot send messages." },
        { status: 403 }
      );
    }

    // Format message with images if provided
    let messageText = message?.trim() || '';
    if (images && Array.isArray(images) && images.length > 0) {
      const imageJson = JSON.stringify(images);
      if (messageText) {
        messageText += `\n\n[IMAGES:${imageJson}]`;
      } else {
        messageText = `[IMAGES:${imageJson}]`;
      }
    }

    // Insert message into unified_ticket_messages table
    const messageRow = {
      ticket_id: ticket.id,
      message_text: messageText,
      message_type: 'TEXT',
      sender_type: 'MERCHANT',
      sender_id: merchant_parent_id,
      sender_name: merchantData?.merchantParentName || user.email || user.phone || 'Merchant',
      sender_email: user.email || null,
      sender_mobile: user.phone || null,
      is_internal_note: false,
      is_read: false,
    };

    const { data: messageData, error: messageError } = await db
      .from("unified_ticket_messages")
      .insert(messageRow)
      .select()
      .single();

    if (messageError) {
      console.error("[merchant/tickets/reply] insert error:", messageError);
      return NextResponse.json(
        { success: false, error: "Failed to send reply." },
        { status: 500 }
      );
    }

    // Update ticket's updated_at timestamp
    // If ticket was reopened and now has a new message, it's active again
    await db
      .from("unified_tickets")
      .update({ 
        updated_at: new Date().toISOString(),
        last_response_at: new Date().toISOString(),
        last_response_by_type: 'MERCHANT',
        last_response_by_id: merchant_parent_id,
      })
      .eq("id", ticket_id);

    return NextResponse.json({
      success: true,
      message: "Reply sent successfully.",
      data: messageData,
    });
  } catch (e) {
    console.error("[merchant/tickets/reply] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
