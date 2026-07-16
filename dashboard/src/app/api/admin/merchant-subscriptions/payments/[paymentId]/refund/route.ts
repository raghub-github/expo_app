/**
 * POST /api/admin/merchant-subscriptions/payments/:paymentId/refund
 * Body: { reason?: string }
 *
 * Proxies the refund action to the backend admin route. The 7-day refund
 * window is enforced ON THE BACKEND — this proxy does not re-check it,
 * so a stale frontend cannot bypass the rule by hitting the API directly.
 *
 * Auth: dashboard super-admin only (Supabase). Actor identity forwarded so
 * the backend records the audit trail (who refunded what and when).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";

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
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { paymentId } = await params;
  const pid = Number(paymentId);
  if (!Number.isInteger(pid) || pid < 1) {
    return NextResponse.json({ success: false, error: "invalid_payment_id" }, { status: 400 });
  }

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { success: false, error: "backend_not_configured" },
      { status: 503 }
    );
  }

  // Body is passed through as-is (only `reason` is meaningful; backend zod-parses).
  const body = await request.json().catch(() => ({}));

  try {
    const upstream = await fetch(
      `${base}/v1/admin/merchant-subscriptions/payments/${pid}/refund`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": secret,
          "X-Actor-Subject-Id": String(gate.systemUserId ?? ""),
          "X-Actor-Role": "admin",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[POST refund proxy]", e);
    return NextResponse.json(
      { success: false, error: "backend_unreachable" },
      { status: 502 }
    );
  }
}
