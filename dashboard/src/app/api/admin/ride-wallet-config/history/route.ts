/**
 * GET /api/admin/ride-wallet-config/history
 *
 * Ride Wallet policy audit trail — every change to ride_wallet_config gets
 * appended to ride_wallet_config_history. Proxies to the backend admin
 * endpoint so the immutable log stays in one place.
 */
import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";

export const runtime = "nodejs";

function backendBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const base = backendBase();
  const secret = process.env.INTERNAL_API_TOKEN;
  if (!base || !secret) {
    return NextResponse.json(
      { error: "backend_not_configured" },
      { status: 503 }
    );
  }

  try {
    const upstream = await fetch(
      `${base}/v1/admin/ride-wallet-config/history`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-Internal-Secret": secret,
          "X-Actor-Role": "super_admin",
        },
      }
    );
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (e) {
    console.error("[GET ride-wallet-config/history proxy]", e);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
