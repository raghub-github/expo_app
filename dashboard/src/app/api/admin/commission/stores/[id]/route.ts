/**
 * GET    /api/admin/commission/stores/:id   — store details + current effective rate + trace + rules + audit.
 * POST   /api/admin/commission/stores/:id   — create a per-store override or promotional rule.
 *
 * `:id` accepts either the numeric primary key OR the public store_id text
 * (e.g. `GMMC1015`). The route normalises through lookupStore() before doing
 * anything else so the UI doesn't have to know which form the user typed.
 *
 * Super-admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin } from "@/lib/permissions/engine";
import {
  getActiveCommissionForStore,
  listStoreCommissionRules,
  listAuditForStore,
  createStoreRule,
  lookupStore,
} from "@/lib/db/operations/commission";

export const runtime = "nodejs";

async function gate() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { res: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  const ok = await isSuperAdmin(user.id, user.email!);
  if (!ok) return { res: NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 }) };
  const sys = await getSystemUserByEmail(user.email!);
  return { actorId: sys?.id ?? null };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("res" in g) return g.res;
  const { id: idStr } = await ctx.params;
  if (!idStr || !idStr.trim()) {
    return NextResponse.json({ success: false, error: "Missing store id" }, { status: 400 });
  }
  try {
    const store = await lookupStore(idStr.trim());
    if (!store) {
      return NextResponse.json(
        { success: false, error: `No store found for "${idStr}". Try the numeric id or the GMMC… code.` },
        { status: 404 },
      );
    }
    const [active, rules, audit] = await Promise.all([
      getActiveCommissionForStore(store.id),
      listStoreCommissionRules(store.id),
      listAuditForStore(store.id, 50),
    ]);
    return NextResponse.json({
      success: true,
      store,
      storeId: store.id,
      active,
      rules,
      audit,
    });
  } catch (e) {
    console.error("[GET /api/admin/commission/stores/:id]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("res" in g) return g.res;
  const { id: idStr } = await ctx.params;
  if (!idStr || !idStr.trim()) {
    return NextResponse.json({ success: false, error: "Missing store id" }, { status: 400 });
  }
  try {
    const store = await lookupStore(idStr.trim());
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const percent = Number(body.commissionPercent);
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      return NextResponse.json({ success: false, error: "commissionPercent must be in [0,100)" }, { status: 400 });
    }
    // service_type enum: 'FOOD' | 'PARCEL' | 'RIDE' (see migration 0010).
    const serviceTypeRaw = String(body.serviceType ?? "FOOD").toUpperCase();
    const serviceType = ["FOOD", "PARCEL", "RIDE"].includes(serviceTypeRaw)
      ? serviceTypeRaw
      : "FOOD";
    const effectiveFrom = String(body.effectiveFrom ?? new Date().toISOString());
    const effectiveToRaw = body.effectiveTo == null ? null : String(body.effectiveTo);
    const sourceKind = body.sourceKind === "PROMOTIONAL" ? "PROMOTIONAL" : "MANUAL_OVERRIDE";
    const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100;
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    const rule = await createStoreRule({
      storeId: store.id,
      serviceType,
      commissionPercent: percent,
      effectiveFrom,
      effectiveTo: effectiveToRaw,
      sourceKind,
      priority,
      reason,
      actorId: g.actorId,
    });
    return NextResponse.json({ success: true, rule });
  } catch (e) {
    console.error("[POST /api/admin/commission/stores/:id]", e);
    return NextResponse.json({ success: false, error: (e as Error).message || "Internal error" }, { status: 500 });
  }
}
