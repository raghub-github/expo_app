import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

/** Pull an already-sent campaign back out of every recipient's inbox. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const { status, body } = await backendFetch(`/v1/notifications/campaigns/${id}/revoke`, {
    method: "POST",
  });
  if (status >= 400) {
    return NextResponse.json(body ?? { error: "revoke_failed" }, { status });
  }
  return NextResponse.json(body ?? { ok: true }, { status: 200 });
}
