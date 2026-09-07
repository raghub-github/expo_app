import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const { status, body } = await backendFetch(`/v1/notifications/campaigns/${id}`);
  if (status >= 400) {
    return NextResponse.json(body ?? { error: "fetch_failed" }, { status });
  }
  const payload =
    body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
  // Campaign drawer used to call /api/.../notifications/logs, but Docker
  // `**/logs` ignores dropped that Next route from the image (404). Attach
  // rows here so the panel loads with the campaign detail request.
  if (!Array.isArray(payload.dispatch_logs)) {
    const logs = await backendFetch(
      `/v1/notifications/logs?campaign=${encodeURIComponent(id)}&limit=100`,
    );
    const items =
      logs.status < 400 &&
      logs.body &&
      typeof logs.body === "object" &&
      Array.isArray((logs.body as { items?: unknown }).items)
        ? (logs.body as { items: unknown[] }).items
        : [];
    payload.dispatch_logs = items;
  }
  return NextResponse.json(payload, { status: 200 });
}

/** Hard-delete campaign + its dispatch log rows from the database. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const { status, body } = await backendFetch(`/v1/notifications/campaigns/${id}`, {
    method: "DELETE",
  });
  if (status >= 400) {
    return NextResponse.json(body ?? { error: "delete_failed" }, { status });
  }
  return NextResponse.json(body ?? { ok: true }, { status: 200 });
}
