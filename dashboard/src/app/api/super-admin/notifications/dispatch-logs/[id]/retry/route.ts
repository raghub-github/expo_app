import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const { status, body } = await backendFetch(
    `/v1/notifications/logs/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
  return NextResponse.json(body, { status });
}
