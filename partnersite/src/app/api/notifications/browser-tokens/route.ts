import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { fetchBackend } from "@/lib/fetch-backend";

export const runtime = "nodejs";

/**
 * GET /api/notifications/browser-tokens?store_id=GMMC1001
 * Returns whether this merchant has an active web push token registered recently.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ registered: false, error: "unauthorized" }, { status: 401 });
    }

    const merchant = await validateMerchantFromSession(user);
    if (!merchant.isValid || !merchant.parentMerchantId) {
      return NextResponse.json(
        { registered: false, error: merchant.error ?? "merchant_required" },
        { status: 403 },
      );
    }

    const storeParam = new URL(req.url).searchParams.get("store_id")?.trim() ?? "";
    let storeId: number | null = null;
    if (storeParam) {
      const gate = await assertStoreAccess(storeParam);
      if (gate.ok) storeId = gate.storeIdNum;
    }

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const parentMerchantId = merchant.parentMerchantId;
    let query = admin
      .from("native_device_push_tokens")
      .select("id")
      .eq("user_id", parentMerchantId)
      .eq("platform", "web")
      .eq("token_type", "fcm")
      .gte("last_seen_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (storeId != null) {
      query = query.eq("store_id", storeId);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.warn("[browser-tokens GET] lookup failed:", error.message);
      return NextResponse.json({ registered: false, error: "lookup_failed" }, { status: 503 });
    }

    return NextResponse.json({ registered: Array.isArray(rows) && rows.length > 0 });
  } catch (e) {
    console.error("[browser-tokens GET]", e);
    return NextResponse.json({ registered: false, error: "internal_error" }, { status: 500 });
  }
}

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
    let parentMerchantId =
      merchant.isValid && merchant.parentMerchantId
        ? String(merchant.parentMerchantId)
        : null;

    let storeId: number | null = null;
    const storeParam =
      body.store_id != null ? String(body.store_id).trim() : "";
    if (storeParam) {
      const gate = await assertStoreAccess(storeParam);
      if (gate.ok) {
        storeId = gate.storeIdNum;
        // Platform staff / AM may pass store access without a merchant_parents session.
        // Register the token against the store's parent so campaigns still resolve.
        if (!parentMerchantId) {
          const { createClient } = await import("@supabase/supabase-js");
          const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || "",
            process.env.SUPABASE_SERVICE_ROLE_KEY || "",
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          const { data: storeParent } = await admin
            .from("merchant_stores")
            .select("parent_id")
            .eq("id", gate.storeIdNum)
            .maybeSingle();
          if (storeParent?.parent_id != null) {
            const { data: parent } = await admin
              .from("merchant_parents")
              .select("parent_merchant_id")
              .eq("id", storeParent.parent_id)
              .maybeSingle();
            if (parent?.parent_merchant_id) {
              parentMerchantId = String(parent.parent_merchant_id);
            }
          }
        }
      }
    }

    if (!parentMerchantId) {
      return NextResponse.json(
        { error: merchant.error ?? "merchant_required" },
        { status: 403 },
      );
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
        user_id: parentMerchantId,
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

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = String(body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "token_required" }, { status: 400 });
    }

    const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
    if (!secret) {
      return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
    }

    const res = await fetchBackend("/v1/notifications/browser-tokens", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({ token }),
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
    console.error("[browser-tokens DELETE]", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
