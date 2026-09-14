import { NextRequest } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { forwardJson, notConfigured } from "@/lib/store-ranking-proxy";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  const nc = notConfigured();
  if (nc) return nc;
  const profile = req.nextUrl.searchParams.get("profile") || "HOME_FOOD";
  return forwardJson(`/v1/admin/store-ranking/history?profile=${encodeURIComponent(profile)}`, {
    method: "GET",
  });
}
