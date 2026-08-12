/**
 * GET /api/tickets/attachment-url?storageKey=...
 * Returns a signed URL for a ticket attachment (Supabase Storage). Auto-renew: call again when expired.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireTicketApiUser } from "@/lib/tickets/require-ticket-api-user";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSignedUrlFromKey } from "@/lib/services/r2";

export const runtime = "nodejs";

const BUCKET = "ticket-attachments";
const EXPIRES_IN = 3600; // 1 hour

function isR2TicketKey(key: string): boolean {
  return key.startsWith("tickets/images/") || key.startsWith("docs/tickets/");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireTicketApiUser(request);
    if ("error" in auth) return auth.error;

    const storageKey = request.nextUrl.searchParams.get("storageKey");
    if (!storageKey || typeof storageKey !== "string") {
      return NextResponse.json({ success: false, error: "Invalid storageKey" }, { status: 400 });
    }

    if (isR2TicketKey(storageKey)) {
      try {
        const url = await getSignedUrlFromKey(storageKey, EXPIRES_IN);
        const expiresAt = new Date(Date.now() + EXPIRES_IN * 1000).toISOString();
        return NextResponse.json({ success: true, data: { url, expiresAt } });
      } catch (e) {
        console.error("[GET /api/tickets/attachment-url] R2:", e);
        return NextResponse.json(
          { success: false, error: e instanceof Error ? e.message : "R2 signing failed" },
          { status: 503 }
        );
      }
    }

    if (!storageKey.startsWith("tickets/")) {
      return NextResponse.json({ success: false, error: "Invalid storageKey" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storageKey, EXPIRES_IN);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + EXPIRES_IN * 1000).toISOString();
    return NextResponse.json({
      success: true,
      data: { url: data.signedUrl, expiresAt },
    });
  } catch (error) {
    console.error("[GET /api/tickets/attachment-url] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
