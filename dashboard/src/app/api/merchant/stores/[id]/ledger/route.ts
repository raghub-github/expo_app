/**
 * GET /api/merchant/stores/[id]/ledger
 * Query: limit, offset, from, to, direction, category
 * Returns { success, entries: LedgerEntry[], total }.
 * Merchant-facing parity with partnersite wallet ledger (visibility + enrichment).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import {
  queryLedger,
  getPayoutStatusesForLedger,
  getPayoutLinksByHoldLedgerIds,
  getLedgerBucketSnapshotsForWallet,
  getPgTransactionIdsForPayoutRequests,
  enrichLedgerFormattedOrderIds,
} from "@/lib/db/operations/merchant-wallet";
import {
  enrichLedgerEntriesWithHoldPayoutLinks,
  enrichLedgerEntriesWithPayoutStatus,
  isMerchantVisibleLedgerEntry,
} from "@/lib/merchant-ledger-visibility";
import {
  applyWithdrawableBalanceToLedgerEntries,
  buildWithdrawableBalanceByLedgerId,
} from "@/lib/merchant-wallet-ledger-display";
import { mergeCancellationLedgerEntries } from "@/lib/merge-cancellation-ledger-entries";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const store = access.store as { id: number };
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const directionRaw = searchParams.get("direction");
    const direction =
      directionRaw === "CREDIT" || directionRaw === "DEBIT" ? directionRaw : undefined;
    const category = searchParams.get("category") ?? undefined;

    const result = await queryLedger(store.id, { limit, offset, from, to, direction, category });

    const withOrderIds = await enrichLedgerFormattedOrderIds(result.entries);

    const holdIds = withOrderIds
      .filter((e) => String(e.category ?? "").toUpperCase() === "HOLD_LOCK")
      .map((e) => Number(e.id));
    const holdLinks = await getPayoutLinksByHoldLedgerIds(store.id, holdIds);
    const withHoldLinks = enrichLedgerEntriesWithHoldPayoutLinks(withOrderIds, holdLinks);

    const requestIds = withHoldLinks
      .map((e) => Number(e.reference_id))
      .filter((rid) => Number.isFinite(rid) && rid > 0);
    const statusMap = await getPayoutStatusesForLedger(store.id, requestIds);
    const enriched = enrichLedgerEntriesWithPayoutStatus(withHoldLinks, statusMap);

    const withdrawalIds = enriched
      .filter((e) => String(e.category ?? "").toUpperCase() === "WITHDRAWAL")
      .map((e) => Number(e.reference_id))
      .filter((rid) => Number.isFinite(rid) && rid > 0);
    const pgByRequestId = await getPgTransactionIdsForPayoutRequests(store.id, withdrawalIds);
    const withPg = enriched.map((entry) => {
      if (String(entry.category ?? "").toUpperCase() !== "WITHDRAWAL") return entry;
      const rid = Number(entry.reference_id);
      const pg = pgByRequestId.get(rid);
      return pg ? { ...entry, pg_transaction_id: pg } : entry;
    });

    const bucketRows = await getLedgerBucketSnapshotsForWallet(store.id);
    const withdrawableById = buildWithdrawableBalanceByLedgerId(bucketRows);
    const withBalance = applyWithdrawableBalanceToLedgerEntries(withPg, withdrawableById);

    const visible = withBalance.filter(isMerchantVisibleLedgerEntry);
    const { entries } = mergeCancellationLedgerEntries(visible);

    return NextResponse.json({
      success: true,
      entries,
      total: Math.max(0, result.total - (result.entries.length - entries.length)),
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/ledger]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
