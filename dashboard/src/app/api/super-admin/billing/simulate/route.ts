import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";

export const runtime = "nodejs";

/**
 * Proxies to Fastify POST /v1/billing/calculate with X-Billing-Sim-Secret (no customer JWT).
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.BILLING_SIM_SECRET;
  if (!backendUrl || !secret) {
    const missing: string[] = [];
    if (!backendUrl) missing.push("BACKEND_URL or NEXT_PUBLIC_BACKEND_URL");
    if (!secret) missing.push("BILLING_SIM_SECRET");
    return NextResponse.json(
      {
        error: "Simulator not configured",
        message:
          "Add the missing variable(s) to dashboard .env.local (see dashboard/.env.example), restart next dev, and set the same BILLING_SIM_SECRET in backend/.env.",
        missing,
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const base = backendUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/v1/billing/calculate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-billing-sim-secret": secret,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "backend_non_json", status: res.status, body: text.slice(0, 500) },
        { status: 502 }
      );
    }
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proxy failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
