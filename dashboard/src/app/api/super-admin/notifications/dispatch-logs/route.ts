import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

/** Alias of /logs — folder is not named logs so Docker ignore globs cannot drop it. */
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const { status, body } = await backendFetch(`/v1/notifications/logs${url.search}`);
  return NextResponse.json(body, { status });
}
