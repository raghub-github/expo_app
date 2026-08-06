import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function backendBase(): string {
  return (
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
}

/**
 * Proxy to backend GET /v1/eta/orders/:orderIdText — same stageAware payload
 * every client surface uses (customer / merchant / rider / admin).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await ctx.params;
  const id = String(orderId ?? "").trim();
  if (!id) {
    return NextResponse.json({ success: false, error: "orderId required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${backendBase()}/v1/eta/orders/${encodeURIComponent(id)}`,
      { cache: "no-store", headers: { accept: "application/json" } }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: (body as { error?: string }).error ?? "eta_fetch_failed" },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true, ...body });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "eta_proxy_error" },
      { status: 502 }
    );
  }
}
