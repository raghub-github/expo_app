/**
 * GET /api/riders/[id]/ledger – wallet transaction history with filters (entry type, credit/debit, date)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders, walletLedger, systemUsers } from "@/lib/db/schema";
import { eq, and, or, desc, gte, lte, inArray, ilike, sql } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

const CREDIT_TYPES = ["earning", "bonus", "refund", "referral_bonus", "penalty_reversal"];
const DEBIT_TYPES = ["penalty", "onboarding_fee", "adjustment"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const db = getDb();
    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10) || 30));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const flow = searchParams.get("flow"); // "credit" | "debit" | omit = all
    const entryType = searchParams.get("entryType"); // earning, penalty, etc. or "all"
    const serviceType = searchParams.get("serviceType"); // food, parcel, person_ride or "all"
    const q = (searchParams.get("q") || "").trim();

    const conditions: any[] = [eq(walletLedger.riderId, riderId)];
    if (flow === "credit") {
      conditions.push(inArray(walletLedger.entryType, CREDIT_TYPES as any));
    } else if (flow === "debit") {
      conditions.push(inArray(walletLedger.entryType, DEBIT_TYPES as any));
    }
    if (entryType && entryType !== "all") {
      conditions.push(eq(walletLedger.entryType, entryType as any));
    }
    if (serviceType && serviceType !== "all") {
      conditions.push(eq(walletLedger.serviceType, serviceType));
    }
    if (from) conditions.push(gte(walletLedger.createdAt, new Date(from + "T00:00:00.000Z")));
    if (to) conditions.push(lte(walletLedger.createdAt, new Date(to + "T23:59:59.999Z")));
    if (q) {
      const term = `%${q.replace(/%/g, "\\%")}%`;
      const textMatch = or(
        ilike(walletLedger.ref, term),
        ilike(walletLedger.description, term)
      ) as any;
      const num = parseFloat(q);
      const isNumeric = !Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(q.trim());
      if (isNumeric) {
        conditions.push(or(eq(walletLedger.amount, q), textMatch) as any);
      } else {
        conditions.push(textMatch);
      }
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(walletLedger)
      .where(whereClause);
    const rows = await db
      .select({
        id: walletLedger.id,
        riderId: walletLedger.riderId,
        entryType: walletLedger.entryType,
        amount: walletLedger.amount,
        balance: walletLedger.balance,
        serviceType: walletLedger.serviceType,
        ref: walletLedger.ref,
        refType: walletLedger.refType,
        description: walletLedger.description,
        metadata: walletLedger.metadata,
        performedByType: walletLedger.performedByType,
        performedById: walletLedger.performedById,
        createdAt: walletLedger.createdAt,
        performedByEmail: systemUsers.email,
        performedByName: systemUsers.fullName,
      })
      .from(walletLedger)
      .leftJoin(systemUsers, eq(walletLedger.performedById, systemUsers.id))
      .where(whereClause)
      .orderBy(desc(walletLedger.createdAt))
      .limit(Number.isNaN(limit) ? 30 : limit)
      .offset(offset);

    const ledger = rows.map((r) => {
      const meta = r.metadata as { orderId?: number } | null | undefined;
      const orderIdFromMeta = meta?.orderId != null ? String(meta.orderId) : null;
      const orderId =
        r.refType === "order" && r.ref
          ? r.ref
          : (r.refType === "penalty" || r.refType === "penalty_revert")
            ? orderIdFromMeta
            : null;
      return {
        id: r.id,
        riderId: r.riderId,
        entryType: r.entryType,
        amount: r.amount,
        balance: r.balance,
        serviceType: r.serviceType,
        ref: r.ref,
        refType: r.refType,
        description: r.description,
        orderId,
        performedByType: r.performedByType ?? "system",
        performedById: r.performedById,
        performedByEmail: r.performedByEmail ?? null,
        performedByName: r.performedByName ?? null,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({ success: true, data: { ledger, total: Number(total) ?? 0 } });
  } catch (error) {
    console.error("[GET /api/riders/[id]/ledger] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
