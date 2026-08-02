/**
 * POST /api/merchant/stores/[id]/sync-acceptance-timeout
 * Cancels unaccepted orders past the acceptance window when the dashboard portal opens.
 *
 * Prefer the Fastify backend (same path as partnersite) so cancel + auto-refund
 * run in one place. Fall back to local sync + HTTP auto-refund hop if backend
 * is unreachable.
 */
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { syncOrderAcceptanceTimeoutForStore } from "@/lib/order-acceptance-timeout-sync";

export const runtime = "nodejs";

async function syncViaBackend(storeInternalId: number): Promise<{
  ok: boolean;
  cancelled: number;
  status?: number;
  error?: string;
}> {
  const backendUrl = (
    process.env.BACKEND_INTERNAL_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL ??
    ""
  ).replace(/\/$/, "");
  // Store sync endpoint auth is BACKEND_SCHEDULE_TICK_SECRET only (same as partnersite).
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
  if (!backendUrl || !secret) {
    return { ok: false, cancelled: 0, error: "backend_not_configured" };
  }

  try {
    const res = await fetch(
      `${backendUrl}/v1/internal/stores/${storeInternalId}/sync-acceptance-timeout`,
      {
        method: "POST",
        headers: { "X-Internal-Secret": secret },
      }
    );
    const body = (await res.json().catch(() => ({}))) as {
      cancelled?: number;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        cancelled: 0,
        status: res.status,
        error: body.error ?? "sync_failed",
      };
    }
    return {
      ok: true,
      cancelled: typeof body.cancelled === "number" ? body.cancelled : 0,
    };
  } catch (err) {
    return {
      ok: false,
      cancelled: 0,
      error: err instanceof Error ? err.message : "backend_unreachable",
    };
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
    }
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const viaBackend = await syncViaBackend(access.store.id);
    if (viaBackend.ok) {
      return NextResponse.json({
        cancelled: viaBackend.cancelled,
        store_id: access.store.store_id ?? String(storeId),
        source: "backend",
      });
    }

    console.warn("[sync-acceptance-timeout] backend sync failed; local fallback", viaBackend);

    const sql = getSql();
    const log = {
      info: (o: object) => console.info("[sync-acceptance-timeout]", o),
      error: (o: object) => console.error("[sync-acceptance-timeout]", o),
    };
    const { cancelled } = await syncOrderAcceptanceTimeoutForStore(sql, access.store.id, log);

    return NextResponse.json({
      cancelled,
      store_id: access.store.store_id ?? String(storeId),
      source: "local_fallback",
      backend_error: viaBackend.error ?? null,
    });
  } catch (e) {
    console.error("[POST sync-acceptance-timeout]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
