import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { status, body } = await backendFetch("/v1/notifications/settings");
  return NextResponse.json(body, { status });
}

export async function PUT(req: Request) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { status, body } = await backendFetch("/v1/notifications/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return NextResponse.json(body, { status });
}
