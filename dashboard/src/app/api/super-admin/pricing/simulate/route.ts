/**
 * Super Admin — rider payout simulator proxy.
 *
 * Forwards to the backend production engine POST /v1/pricing/simulate so the dashboard
 * calculator uses the SAME independent pre/post-pickup + reconciliation engine as order
 * creation and settlement — no pricing formula is duplicated in the dashboard (§39).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  if (!base) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const secret = process.env.INTERNAL_API_TOKEN;
  try {
    const upstream = await fetch(`${base}/v1/pricing/simulate`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Internal-Secret": secret } : {}),
        "X-Actor-Role": "super_admin",
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[POST super-admin/pricing/simulate proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
