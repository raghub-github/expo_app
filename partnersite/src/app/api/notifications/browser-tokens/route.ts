import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { fetchBackend } from "@/lib/fetch-backend";

export const runtime = "nodejs";

/**
 * Partnersite browser FCM registration → backend native_device_push_tokens.
 * Super Admin merchant campaigns can then reach the open partnersite session.
 *
 * Uses the same backend URL resolution as schedule-tick / sync-acceptance
 * (GATIMITRA_BACKEND_API_URL → 127.0.0.1:3000), not a separate BACKEND_URL.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      platform?: string;
      store_id?: string | number;
      source?: string;
    };
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "token_required" }, { status: 400 });
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
        { status: 403 }
      );
    }

    let storeId: number | null = null;
    const storeParam =
      body.store_id != null ? String(body.store_id).trim() : "";
    if (storeParam) {
      const gate = await assertStoreAccess(storeParam);
      if (gate.ok) storeId = gate.storeIdNum;
    }

    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
    if (!secret) {
      return NextResponse.json(
        {
          error: "backend_not_configured",
          message: "Set BACKEND_SCHEDULE_TICK_SECRET on partnersite.",
        },
        { status: 503 }
      );
    }

    const res = await fetchBackend("/v1/notifications/browser-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        token,
        platform: body.platform ?? "web",
        user_id: merchant.parentMerchantId,
        role: "merchant",
        store_id: storeId,
        source: body.source ?? "partnersite",
      }),
      timeoutMs: 15_000,
    });

    if (!res) {
      return NextResponse.json(
        {
          error: "backend_unreachable",
          message: "Fastify backend not reachable. Start backend on :3000.",
        },
        { status: 503 }
      );
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      console.warn("[browser-tokens] backend error", res.status, text.slice(0, 200));
    }
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    console.error("[browser-tokens POST]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
