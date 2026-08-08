import { NextRequest, NextResponse } from "next/server";
import {
  getPartnerAuthRedirectOriginFromRequest,
  safeSameOriginPath,
} from "@/lib/auth/auth-redirect-url";

/**
 * POST /api/merchant-auth/app-handoff
 * Redeems a merchant-app SSO handoff token via the Fastify backend, then
 * returns Supabase session tokens for set-cookie on the client page.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { handoffToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const handoffToken = typeof body?.handoffToken === "string" ? body.handoffToken.trim() : "";
    if (!handoffToken || handoffToken.length < 20) {
      return NextResponse.json(
        { success: false, error: "Missing handoff token", code: "MISSING_TOKEN" },
        { status: 400 }
      );
    }

    const backendBase = (process.env.GATIMITRA_BACKEND_API_URL || "").replace(/\/+$/, "");
    const secret = (process.env.BACKEND_SCHEDULE_TICK_SECRET || "").trim();
    if (!backendBase || !secret) {
      return NextResponse.json(
        { success: false, error: "Server configuration error.", code: "CONFIG_MISSING" },
        { status: 503 }
      );
    }

    const redeemRes = await fetch(`${backendBase}/v1/auth/internal/merchant/partner-handoff/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({ handoffToken }),
      cache: "no-store",
    });

    const raw = await redeemRes.text();
    let data: {
      access_token?: string;
      refresh_token?: string;
      next?: string;
      error?: string;
      message?: string;
    } = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!redeemRes.ok || !data.access_token || !data.refresh_token || !data.next) {
      return NextResponse.json(
        {
          success: false,
          error: data.message || data.error || "Handoff expired or invalid.",
          code: "REDEEM_FAILED",
        },
        { status: redeemRes.status >= 400 && redeemRes.status < 600 ? redeemRes.status : 400 }
      );
    }

    // startsWith("/") lets "//evil.com" through; resolve against our own origin instead.
    const next = safeSameOriginPath(
      data.next,
      getPartnerAuthRedirectOriginFromRequest(request.url, request.headers)
    );
    return NextResponse.json({
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      next,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "app-handoff error";
    console.error("[merchant-auth/app-handoff]", message);
    return NextResponse.json(
      { success: false, error: message, code: "HANDOFF_ERROR" },
      { status: 500 }
    );
  }
}
