import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** R2 object key from raw key or `/api/attachments/proxy?key=…` (partnersite / dashboard). */
function extractStorageKeyFromInput(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("tickets/")) return raw;
  try {
    const u = new URL(raw, "http://localhost");
    const key = u.searchParams.get("key");
    if (key) {
      const decoded = decodeURIComponent(key).trim();
      return decoded || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function canonicalProxyUrl(storageKey: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(storageKey)}`;
}

function mimeFromKindAndName(kind: string | undefined, name: string): string {
  const n = (name || "").toLowerCase();
  const k = (kind || "").toLowerCase();
  if (k === "video") {
    if (n.endsWith(".webm")) return "video/webm";
    if (n.endsWith(".mov")) return "video/quicktime";
    return "video/mp4";
  }
  if (k === "audio") {
    if (n.endsWith(".wav")) return "audio/wav";
    if (n.endsWith(".webm")) return "audio/webm";
    if (n.endsWith(".ogg")) return "audio/ogg";
    if (n.endsWith(".m4a")) return "audio/mp4";
    return "audio/mpeg";
  }
  if (k === "image") {
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".webp")) return "image/webp";
    if (n.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".wav")) return "audio/wav";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

type IncomingAttachment = { url?: string; kind?: string; name?: string };

/**
 * Same shape as merchant app / dashboard: `text[]` of JSON strings with
 * storageKey, name, mimeType, url (relative proxy).
 */
function buildAttachmentsForDb(
  imageUrls: string[],
  extra: IncomingAttachment[],
): string[] {
  const rows: string[] = [];
  const seen = new Set<string>();

  const push = (storageKey: string, name: string, mimeType: string) => {
    if (!storageKey || seen.has(storageKey)) return;
    seen.add(storageKey);
    rows.push(
      JSON.stringify({
        storageKey,
        name: name || "Attachment",
        mimeType,
        url: canonicalProxyUrl(storageKey),
      }),
    );
  };

  for (const imgUrl of imageUrls) {
    const key = extractStorageKeyFromInput(String(imgUrl || ""));
    if (!key) continue;
    const name = key.split("/").pop() || "image";
    push(key, name, mimeFromKindAndName("image", name));
  }

  for (const att of extra) {
    const url = String(att?.url || "").trim();
    if (!url) continue;
    const key = extractStorageKeyFromInput(url);
    if (!key) continue;
    const name =
      (typeof att.name === "string" && att.name.trim()) ||
      key.split("/").pop() ||
      "Attachment";
    push(key, name, mimeFromKindAndName(att.kind, name));
  }

  return rows;
}

/**
 * POST /api/merchant/tickets/reply
 * Body: { ticket_id, message?, images?, attachments? }
 * Persists `attachments` on the row (same format as merchant app / dashboard), not embedded proxy JSON in message_text.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticket_id, message, images, attachments } = body;

    const imageList = Array.isArray(images) ? images.filter((u: unknown): u is string => typeof u === "string") : [];
    const attList = Array.isArray(attachments)
      ? (attachments as IncomingAttachment[])
      : [];
    const hasMedia = imageList.length > 0 || attList.length > 0;
    if (!ticket_id || (!message?.trim() && !hasMedia)) {
      return NextResponse.json(
        {
          success: false,
          error: "Ticket ID and either a message or at least one attachment are required.",
        },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Please log in to reply to tickets." },
        { status: 401 },
      );
    }

    let merchant_parent_id: number | null = null;
    let merchantData: any = null;
    try {
      const validation = await validateMerchantFromSession({
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
      });
      if (validation.merchantParentId != null) {
        merchant_parent_id = validation.merchantParentId;
        merchantData = validation;
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Merchant account not found." },
        { status: 403 },
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
        { status: 404 },
      );
    }

    if (ticket.merchant_parent_id !== merchant_parent_id) {
      return NextResponse.json(
        {
          success: false,
          error: "You don't have permission to reply to this ticket.",
        },
        { status: 403 },
      );
    }

    // Strict: closed tickets cannot receive replies
    if (ticket.status === "CLOSED") {
      return NextResponse.json(
        {
          success: false,
          error: "This ticket is closed. You cannot send messages.",
        },
        { status: 403 },
      );
    }

    const messageText = typeof message === "string" ? message.trim() : "";
    const attachmentsForDb = buildAttachmentsForDb(imageList, attList);

    // Insert message into unified_ticket_messages table
    const messageRow = {
      ticket_id: ticket.id,
      message_text: messageText,
      message_type: "TEXT",
      sender_type: "MERCHANT",
      sender_id: merchant_parent_id,
      sender_name:
        merchantData?.merchantParentName ||
        user.email ||
        user.phone ||
        "Merchant",
      sender_email: user.email || null,
      sender_mobile: user.phone || null,
      is_internal_note: false,
      is_read: false,
      attachments: attachmentsForDb,
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
        { status: 500 },
      );
    }

    // Update ticket's updated_at timestamp
    // If ticket was reopened and now has a new message, it's active again
    await db
      .from("unified_tickets")
      .update({
        updated_at: new Date().toISOString(),
        last_response_at: new Date().toISOString(),
        last_response_by_type: "MERCHANT",
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
      { status: 500 },
    );
  }
}
