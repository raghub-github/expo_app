import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const payload = await req.json().catch(() => ({}));
  const { status, body } = await backendFetch(`/v1/notifications/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return NextResponse.json(body, { status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const { status, body } = await backendFetch(`/v1/notifications/templates/${id}`, { method: "DELETE" });
  return NextResponse.json(body, { status });
}
