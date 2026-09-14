import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { forwardJson, notConfigured } from "@/lib/store-ranking-proxy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  const nc = notConfigured();
  if (nc) return nc;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid_json" }, { status: 400 });
  }
  return forwardJson("/v1/admin/store-ranking/preview", { method: "POST", body });
}
