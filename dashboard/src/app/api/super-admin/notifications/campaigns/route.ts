import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const { status, body } = await backendFetch(`/v1/notifications/campaigns${url.search}`);
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const payload = await req.json().catch(() => ({}));
  const { status, body } = await backendFetch("/v1/notifications/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return NextResponse.json(body, { status });
}
