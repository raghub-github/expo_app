/**
 * GET /api/merchant/stores/[id]/activity-logs
 * Returns activity logs for this store (chronological, latest first).
 * Resolves agent_id to agent_email (system user or area manager's user email).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId, getAreaManagerById } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getActivityLogsByStoreId } from "@/lib/db/operations/merchant-portal-activity-logs";
import { getSystemUserById } from "@/lib/db/operations/users";

export const runtime = "nodejs";

async function assertAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

/** Resolve agent_id (system_users.id or area_managers.id) to email. */
async function getAgentEmail(agentId: number): Promise<string | null> {
  const systemUser = await getSystemUserById(agentId);
  if (systemUser?.email) return systemUser.email;
  const am = await getAreaManagerById(agentId);
  if (am) {
    const user = await getSystemUserById(am.userId);
    return user?.email ?? null;
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const logs = await getActivityLogsByStoreId(storeId, 200);
    const agentIds = [...new Set(logs.map((r) => r.agent_id).filter((id): id is number => id != null))];
    const agentEmailMap: Record<number, string | null> = {};
    await Promise.all(
      agentIds.map(async (aid) => {
        agentEmailMap[aid] = await getAgentEmail(aid);
      })
    );
    return NextResponse.json({
      success: true,
      logs: logs.map((row) => ({
        id: row.id,
        store_id: row.store_id,
        agent_id: row.agent_id,
        agent_email: row.agent_id != null ? agentEmailMap[row.agent_id] ?? null : null,
        changed_section: row.changed_section,
        field_name: row.field_name,
        old_value: row.old_value,
        new_value: row.new_value,
        change_reason: row.change_reason,
        action_type: row.action_type,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/activity-logs]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
