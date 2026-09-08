/**
 * Super Admin — onboarding requirement simulator proxy (§40).
 *
 * Forwards to the backend POST /v1/rider-eligibility/simulate-onboarding so the dashboard
 * preview uses the SAME engine + onboarding-decision resolver as production — no onboarding
 * logic is duplicated in the dashboard.
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
    const { response, data } = await fetchBackendInternal(
      "/v1/rider-eligibility/simulate-onboarding",
      {
        method: "POST",
        actorRole: "super_admin",
        body: JSON.stringify(body),
      }
    );
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    console.error("[POST super-admin/geo/rider-eligibility/simulate-onboarding proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
