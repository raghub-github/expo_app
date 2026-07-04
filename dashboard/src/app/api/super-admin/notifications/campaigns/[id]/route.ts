import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const { status, body } = await backendFetch(`/v1/notifications/campaigns/${id}`);
  if (status >= 400) {
    return NextResponse.json(body ?? { error: "fetch_failed" }, { status });
  }
  return NextResponse.json(body ?? {}, { status: 200 });
}
