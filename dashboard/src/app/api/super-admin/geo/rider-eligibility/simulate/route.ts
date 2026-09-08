/**
 * Super Admin — rider eligibility simulator proxy.
 *
 * Forwards to the backend production engine POST /v1/rider-eligibility/simulate so the
 * dashboard preview uses the SAME deterministic eligibility engine + geo policy resolver
 * as order-accept enforcement — no eligibility logic is duplicated in the dashboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { fetchBackendInternal } from "@/lib/backend-internal";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const { response, data } = await fetchBackendInternal("/v1/rider-eligibility/simulate", {
      method: "POST",
      actorRole: "super_admin",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error("[POST super-admin/geo/rider-eligibility/simulate proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
