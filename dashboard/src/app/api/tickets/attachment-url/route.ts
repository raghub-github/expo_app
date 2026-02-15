/**
 * GET /api/tickets/attachment-url?storageKey=...
 * Returns a signed URL for a ticket attachment (Supabase Storage). Auto-renew: call again when expired.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

const BUCKET = "ticket-attachments";
const EXPIRES_IN = 3600; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const storageKey = request.nextUrl.searchParams.get("storageKey");
    if (!storageKey || !storageKey.startsWith("tickets/")) {
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
