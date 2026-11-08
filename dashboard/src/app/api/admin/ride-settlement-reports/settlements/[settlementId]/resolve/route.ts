/**
 * POST /api/admin/ride-settlement-reports/settlements/:settlementId/resolve
 *
 * Super admin closes a reconciliation item with a note. Records the decision
 * only — money corrections go through the audited wallet adjustment tools.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ settlementId: string }> }
) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json({ error: "backend_not_configured" }, { status: 503 });
  }

  const { settlementId } = await params;
  const body = await req.json().catch(() => ({}));
  const auth = await getAuthenticatedApiUser(req);
  const actorEmail = auth.ok ? auth.user?.email ?? "" : "";

  try {
    const upstream = await fetch(
      `${base}/v1/admin/ride-settlement-reports/settlements/${encodeURIComponent(settlementId)}/resolve`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "X-Internal-Secret": secret,
          "X-Actor-Role": "super_admin",
          ...(actorEmail ? { "X-Actor-Email": actorEmail } : {}),
        },
        body: JSON.stringify({ note: typeof body?.note === "string" ? body.note : "" }),
      }
    );
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[POST ride-settlement-reports/settlements/resolve proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
