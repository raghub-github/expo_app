/**
 * Same-origin WS ticket mint for Control Dashboard.
 * Dashboard auth is cookie/Supabase; ticket mint uses backend X-Internal-Secret
 * (same pattern as other admin proxies). Do not forward the admin access JWT —
 * those tokens often fail backend HS256 verify (asymmetric Supabase signing).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedApiUser,
  authFailureResponse,
} from "@/lib/auth/api-session";
import { fetchBackendInternal } from "@/lib/backend-internal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketBody = {
  orderIds?: string[];
  riderId?: string;
  zoneKeys?: string[];
};

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) return authFailureResponse(auth);

  let body: TicketBody = {};
  try {
    body = (await request.json()) as TicketBody;
  } catch {
    body = {};
  }

  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds
        .map((id) => String(id ?? "").trim().toUpperCase())
        .filter((id) => /^[A-Z0-9-]{4,32}$/.test(id))
        .slice(0, 20)
    : [];

  try {
    const { response, data } = await fetchBackendInternal("/v1/auth/ws-ticket", {
      method: "POST",
      actorRole: "admin",
      headers: {
        "X-Actor-Sub": auth.user.id,
      },
      body: JSON.stringify({
        orderIds: orderIds.length > 0 ? orderIds : undefined,
        riderId: body.riderId,
        zoneKeys: body.zoneKeys,
      }),
      timeoutMs: 15_000,
    });

    const json =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};

    if (!response.ok) {
      // Soft failure: map falls back to HTTP polling. Never surface as a hard
      // session-death 401 — auth fetch guard must not treat this as logout.
      const status = response.status === 401 || response.status === 403 ? 503 : response.status;
      return NextResponse.json(
        {
          ok: false,
          error: (json.error as string) ?? "ws_ticket_proxy_failed",
          code: "SERVICE_UNAVAILABLE",
        },
        { status: status >= 500 || status === 503 ? status : 503 }
      );
    }

    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "ws_ticket_proxy_error",
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503 }
    );
  }
}
