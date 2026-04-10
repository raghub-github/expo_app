import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) return NextResponse.json({ error: "BACKEND_URL not set" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const base = backendUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/v1/delivery-fee/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "backend_non_json", status: res.status, body: text.slice(0, 500) }, { status: 502 });
    }
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proxy failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

