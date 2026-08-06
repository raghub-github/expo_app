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

/** Proxy immutable ETA audit timeline (admin audience). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await ctx.params;
  const id = String(orderId ?? "").trim();
  if (!id) {
    return NextResponse.json({ success: false, error: "orderId required" }, { status: 400 });
  }

  const audience = req.nextUrl.searchParams.get("audience") === "customer" ? "customer" : "admin";
  const order = req.nextUrl.searchParams.get("order") === "asc" ? "asc" : "desc";

  try {
    const url = `${backendBase()}/v1/eta/orders/${encodeURIComponent(id)}/history?audience=${audience}&order=${order}`;
    const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: (body as { error?: string }).error ?? "eta_history_failed" },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true, ...body });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "eta_history_proxy_error" },
      { status: 502 }
    );
  }
}
