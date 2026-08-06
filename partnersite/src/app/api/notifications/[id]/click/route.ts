import { NextRequest, NextResponse } from "next/server";
import { fetchBackend } from "@/lib/fetch-backend";

export const runtime = "nodejs";

/**
 * Proxy click tracking from firebase-messaging-sw.js → backend
 * POST /v1/notifications/:notificationId/click
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const nid = String(id ?? "").trim();
  if (!nid) {
    return NextResponse.json({ error: "notification_id_required" }, { status: 400 });
  }

  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const res = await fetchBackend(`/v1/notifications/${encodeURIComponent(nid)}/click`, {
      method: "POST",
      headers: { "X-Internal-Secret": secret },
      timeoutMs: 8_000,
    });
    if (!res) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const text = await res.text();
    let json: unknown = { ok: res.ok };
    try {
      json = text ? JSON.parse(text) : json;
    } catch {
      /* ignore */
    }
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }
}
