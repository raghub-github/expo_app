/**
 * GET /api/admin/ride-settlement-reports/summary
 *
 * Proxies to the backend Super Admin summary endpoint. Query params:
 *   ?from=<ISO>&to=<ISO> — defaults to last 7 days.
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

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { error: "backend_not_configured" },
      { status: 503 }
    );
  }

  const search = req.nextUrl.search || "";
  try {
    const upstream = await fetch(
      `${base}/v1/admin/ride-settlement-reports/summary${search}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-Internal-Secret": secret,
          "X-Actor-Role": "super_admin",
        },
      }
    );
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET ride-settlement-reports/summary proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
