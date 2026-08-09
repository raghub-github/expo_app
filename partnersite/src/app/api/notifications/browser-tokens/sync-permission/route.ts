import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { fetchBackend } from "@/lib/fetch-backend";

export const runtime = "nodejs";

/**
 * POST /api/notifications/browser-tokens/sync-permission
 * Client reports browser Notification.permission changes so backend can stop sending
 * to devices where the user blocked notifications.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      permission?: string;
      token?: string;
    };
    const permission = String(body.permission ?? "").trim().toLowerCase();
    if (permission !== "denied" && permission !== "granted") {
      return NextResponse.json({ error: "invalid_permission" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const merchant = await validateMerchantFromSession(user);
    if (!merchant.isValid || !merchant.parentMerchantId) {
      return NextResponse.json(
        { error: merchant.error ?? "merchant_required" },
        { status: 403 },
      );
    }

    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
    }

    const token = String(body.token ?? "").trim();
    const res = await fetchBackend("/v1/notifications/browser-tokens/sync-permission", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        permission,
        token: token || undefined,
        user_id: merchant.parentMerchantId,
      }),
      timeoutMs: 10_000,
    });

    if (!res) {
      return NextResponse.json({ error: "backend_unreachable" }, { status: 503 });
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    console.error("[browser-tokens sync-permission POST]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
