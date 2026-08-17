/**
 * Same-origin WS ticket mint for Control Dashboard.
 * Proxies to backend POST /v1/auth/ws-ticket with the admin's Supabase access JWT
 * so the browser never needs cross-origin cookies against the REST API.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import {
  readCookieAccessSession,
  isCookieAccessTokenUsable,
} from "@/lib/auth/read-cookie-access-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function backendBase(): string {
  return (
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");
}

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

  const cookieSession = readCookieAccessSession(request.cookies);
  const accessToken =
    cookieSession && isCookieAccessTokenUsable(cookieSession)
      ? cookieSession.accessToken
      : null;

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "access_token_unavailable" },
      { status: 401 }
    );
  }

  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds
        .map((id) => String(id ?? "").trim().toUpperCase())
        .filter((id) => /^[A-Z0-9-]{4,32}$/.test(id))
        .slice(0, 20)
    : [];

  try {
    const res = await fetch(`${backendBase()}/v1/auth/ws-ticket`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        orderIds: orderIds.length > 0 ? orderIds : undefined,
        riderId: body.riderId,
        zoneKeys: body.zoneKeys,
      }),
      cache: "no-store",
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: (json.error as string) ?? "ws_ticket_proxy_failed",
        },
        { status: res.status }
      );
    }

    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "ws_ticket_proxy_error",
      },
      { status: 502 }
    );
  }
}
