import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Allowed ticket titles per page context (merchant cannot raise payment/rider from registration). */
const TITLES_BY_CONTEXT: Record<string, string[]> = {
  "auth": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "ACCOUNT_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "register": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "ACCOUNT_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "login": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "ACCOUNT_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "post-login": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "store-onboarding": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "MENU_UPDATE_ISSUE", "STORE_STATUS_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "dashboard": ["MERCHANT_APP_TECHNICAL_ISSUE", "PAYOUT_DELAYED", "PAYOUT_NOT_RECEIVED", "SETTLEMENT_DISPUTE", "COMMISSION_DISPUTE", "MENU_UPDATE_ISSUE", "STORE_STATUS_ISSUE", "MERCHANT_ORDER_NOT_RECEIVING", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
};

const TITLE_TO_CATEGORY: Record<string, string> = {
  MERCHANT_APP_TECHNICAL_ISSUE: "TECHNICAL",
  VERIFICATION_ISSUE: "VERIFICATION",
  ACCOUNT_ISSUE: "ACCOUNT",
  PAYOUT_DELAYED: "EARNINGS",
  PAYOUT_NOT_RECEIVED: "EARNINGS",
  SETTLEMENT_DISPUTE: "PAYMENT",
  COMMISSION_DISPUTE: "PAYMENT",
  MENU_UPDATE_ISSUE: "TECHNICAL",
  STORE_STATUS_ISSUE: "TECHNICAL",
  MERCHANT_ORDER_NOT_RECEIVING: "TECHNICAL",
  OTHER: "OTHER",
  FEEDBACK: "FEEDBACK",
  COMPLAINT: "COMPLAINT",
  SUGGESTION: "FEEDBACK",
};

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Merchant tickets are stored in unified_tickets (the current table for the entire
 * unified ticket system: merchant, customer, rider). The legacy "tickets" table
 * is rider-centric (rider_id NOT NULL) and used by the dashboard for other flows.
 */
/**
 * POST /api/merchant/tickets
 * Body: { ticket_title, subject, description, page_context, raised_by_name?, raised_by_email?, raised_by_mobile?, attachments? }
 * attachments: optional array of image URLs (e.g. from R2 upload). Optionally get merchant_parent_id from session (if logged in).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ticket_title,
      subject,
      description,
      page_context,
      raised_by_name,
      raised_by_email,
      raised_by_mobile,
      attachments,
    } = body;

    const context = (page_context || "auth").toString();
    const allowed = TITLES_BY_CONTEXT[context] || TITLES_BY_CONTEXT["auth"];
    if (!allowed.includes(ticket_title)) {
      return NextResponse.json(
        { success: false, error: "This ticket type is not allowed on this page." },
        { status: 400 }
      );
    }

    if (!subject?.trim() || !description?.trim()) {
      return NextResponse.json(
        { success: false, error: "Subject and description are required." },
        { status: 400 }
      );
    }

    const category = TITLE_TO_CATEGORY[ticket_title] || "OTHER";
    const db = getSupabaseAdmin();

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to raise a ticket." },
        { status: 401 }
      );
    }

    let merchant_parent_id: number | null = null;
    try {
      const validation = await validateMerchantFromSession({ id: user.id, email: user.email ?? null, phone: user.phone ?? null });
      if (validation.merchantParentId != null) merchant_parent_id = validation.merchantParentId;
    } catch {
      // continue with null merchant_parent_id (e.g. logged in but not yet registered as merchant)
    }

    const attachmentUrls =
      Array.isArray(attachments) && attachments.length > 0
        ? attachments.filter((u: unknown) => typeof u === "string" && u.trim()).slice(0, 20)
        : null;

    const row = {
      ticket_id: "",
      ticket_type: "NON_ORDER_RELATED",
      ticket_source: "MERCHANT",
      service_type: "GENERAL",
      ticket_title,
      ticket_category: category,
      subject: subject.trim().slice(0, 500),
      description: description.trim().slice(0, 5000),
      raised_by_type: "MERCHANT",
      raised_by_id: merchant_parent_id,
      raised_by_name: raised_by_name?.trim() || null,
      raised_by_email: raised_by_email?.trim() || null,
      raised_by_mobile: raised_by_mobile?.trim() || null,
      merchant_parent_id,
      ...(attachmentUrls?.length ? { attachments: attachmentUrls } : {}),
    };

    const { data, error } = await db.from("unified_tickets").insert(row).select("id, ticket_id").single();

    if (error) {
      console.error("[merchant/tickets] insert error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create ticket. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket_id: data?.ticket_id ?? data?.id,
      message: "Ticket raised successfully. We will get back to you soon.",
    });
  } catch (e) {
    console.error("[merchant/tickets] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
