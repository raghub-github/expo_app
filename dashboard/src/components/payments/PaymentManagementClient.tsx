"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  RefreshCw,
  Check,
  X,
  Store,
  Bike,
  Gauge,
  ArrowRight,
  MoreVertical,
  PauseCircle,
  Calendar,
  Download,
  ChevronLeft,
  ChevronRight,
  Scale,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { readApiJson } from "@/lib/payment/read-api-json";
import { formatInr } from "@/lib/format-inr";
import { merchantStoreApi } from "@/store/api/merchantStoreApi";
import { PaymentThresholdPanel } from "@/components/payments/PaymentThresholdPanel";
import { WalletAdjustmentsPanel } from "@/components/payments/WalletAdjustmentsPanel";
import { usePaymentPayoutsLiveSync } from "@/hooks/usePaymentPayoutsLiveSync";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";

type PaymentParty = "merchant" | "rider" | "threshold" | "adjustment";

const PAYMENT_PARTIES: readonly PaymentParty[] = [
  "merchant",
  "rider",
  "threshold",
  "adjustment",
] as const;

function parsePaymentParty(raw: string | null): PaymentParty {
  const t = (raw ?? "").trim().toLowerCase();
  return (PAYMENT_PARTIES as readonly string[]).includes(t)
    ? (t as PaymentParty)
    : "merchant";
}

type MerchantPayoutRow = {
  id: number;
  store_name?: string;
  store_code?: string;
  rider_id?: number;
  rider_name?: string;
  rider_mobile?: string;
  amount?: number;
  net_payout_amount?: number;
  status?: string;
  pg_transaction_id?: string | null;
  utr_reference?: string | null;
  rejection_reason?: string | null;
  hold_reason?: string | null;
  requested_at?: string;
  approved_at?: string;
  completed_at?: string;
};

type StatusFilter = "ALL" | "PENDING" | "COMPLETED" | "REJECTED" | "HOLD";

type EditField = "pg" | "utr";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 500] as const;
const rowBorder = "border-b-[0.5px] border-[#121212]/10";
const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";
const controlClass =
  "h-9 rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212] outline-none focus:border-[#121212]/35";

function displayStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s === "APPROVED" || s === "PROCESSING") return "HOLD";
  if (s === "CANCELLED" || s === "FAILED") return "REJECTED";
  return s;
}

function formatRequestedAt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Local calendar date (IST / browser TZ) for date-range filtering. */
function toLocalYmd(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchesPayoutFilters(
  p: MerchantPayoutRow,
  opts: {
    party: PaymentParty;
    storeFilter: string;
    riderFilter: string;
    statusFilter: StatusFilter;
    dateFrom: string;
    dateTo: string;
  }
): boolean {
  const rawStatus = String(p.status ?? "PENDING");
  const disp = displayStatus(rawStatus);

  if (opts.party === "merchant") {
    if (opts.storeFilter !== "ALL" && String(p.store_code ?? "") !== opts.storeFilter) return false;
  } else if (opts.party === "rider") {
    if (opts.riderFilter !== "ALL" && String(p.rider_id ?? "") !== opts.riderFilter) return false;
  }

  if (opts.statusFilter === "PENDING" && disp !== "PENDING") return false;
  if (opts.statusFilter === "COMPLETED" && disp !== "COMPLETED") return false;
  if (opts.statusFilter === "REJECTED" && disp !== "REJECTED") return false;
  if (opts.statusFilter === "HOLD" && disp !== "HOLD") return false;

  if (opts.dateFrom && opts.dateTo) {
    const d = toLocalYmd(p.requested_at);
    if (!d) return false;
    if (d < opts.dateFrom || d > opts.dateTo) return false;
  }

  return true;
}

export function PaymentManagementClient() {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const urlParty = parsePaymentParty(searchParams.get("tab"));
  /** Local party updates instantly; URL syncs in the background. */
  const [party, setPartyState] = useState<PaymentParty>(urlParty);

  useEffect(() => {
    setPartyState(urlParty);
  }, [urlParty]);

  const setParty = useCallback(
    (next: PaymentParty) => {
      setPartyState(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [migrationRequired, setMigrationRequired] = useState(false);
  const [payouts, setPayouts] = useState<MerchantPayoutRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pgInputs, setPgInputs] = useState<Record<number, string>>({});
  const [utrInputs, setUtrInputs] = useState<Record<number, string>>({});
  const [storeFilter, setStoreFilter] = useState("ALL");
  const [riderFilter, setRiderFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [editModal, setEditModal] = useState<{ row: MerchantPayoutRow; field: EditField } | null>(null);
  const [rejectModal, setRejectModal] = useState<MerchantPayoutRow | null>(null);
  const [holdModal, setHoldModal] = useState<MerchantPayoutRow | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/payment-config", { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        toast.error(String(data.error ?? "Failed to load config"));
        return;
      }
      setMigrationRequired(Boolean(data.migrationRequired));
      if (data.migrationRequired) {
        toast.error(String(data.message ?? "Run payment migrations on Supabase SQL editor, then refresh."));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    if (party === "threshold" || party === "adjustment") {
      setPayouts([]);
      return;
    }
    try {
      const query = party === "rider" ? "?party=rider" : "";
      const res = await fetch(`/api/super-admin/payment-payouts${query}`, { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        toast.error(String(data.error ?? "Failed to load withdrawals"));
        return;
      }
      const rows = (data.payouts as MerchantPayoutRow[]) ?? [];
      setPayouts(rows);
      setPgInputs((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (row.id != null && next[row.id] === undefined) {
            next[row.id] = row.pg_transaction_id ?? "";
          }
        }
        return next;
      });
      setUtrInputs((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (row.id != null && next[row.id] === undefined) {
            next[row.id] = row.utr_reference ?? "";
          }
        }
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load withdrawals");
    }
  }, [party]);

  useEffect(() => {
    void loadConfig();
    void loadPayouts();
  }, [loadConfig, loadPayouts]);

  usePaymentPayoutsLiveSync(() => {
    if (party === "threshold" || party === "adjustment") return;
    return loadPayouts();
  });

  const payoutAction = async (
    payoutId: number,
    action: "approve" | "reject" | "complete" | "updateRefs",
    extras?: { reason?: string; pgTransactionId?: string; utrReference?: string; field?: EditField; value?: string }
  ) => {
    setSavingId(`payout-${payoutId}`);
    try {
      const res = await fetch("/api/super-admin/payment-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payoutId, party, ...extras }),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        toast.error(String(data.error ?? "Action failed"));
        return false;
      }
      if (action === "complete") {
        toast.success("Withdrawal transferred to the bank successfully.");
      } else if (action === "approve") {
        toast.success("Withdrawal put on hold");
      } else if (action === "reject") {
        toast.success("Withdrawal rejected");
      } else if (action === "updateRefs") {
        toast.success(extras?.field === "pg" ? "PG TNX ID updated" : "UTR updated");
      }
      // Refresh merchant portal wallet / ledger CTAs immediately when this dashboard has them open.
      dispatch(merchantStoreApi.util.invalidateTags([{ type: "Payment" }]));
      await loadPayouts();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const refreshAll = () => {
    void loadConfig();
    void loadPayouts();
  };

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payouts) {
      const code = String(p.store_code ?? "");
      const name = String(p.store_name ?? p.store_code ?? "Store");
      if (code) map.set(code, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [payouts]);

  const riderOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of payouts) {
      const id = String(p.rider_id ?? "");
      const name = String(p.rider_name ?? `Rider #${id}`);
      if (id) map.set(id, name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [payouts]);

  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) =>
      matchesPayoutFilters(p, { party, storeFilter, riderFilter, statusFilter, dateFrom, dateTo })
    );
  }, [payouts, party, storeFilter, riderFilter, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const sum = (rows: MerchantPayoutRow[]) =>
      rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0);

    const pending = filteredPayouts.filter((p) => displayStatus(String(p.status ?? "")) === "PENDING");
    const completed = filteredPayouts.filter((p) => displayStatus(String(p.status ?? "")) === "COMPLETED");
    const rejected = filteredPayouts.filter((p) => displayStatus(String(p.status ?? "")) === "REJECTED");
    const hold = filteredPayouts.filter((p) => displayStatus(String(p.status ?? "")) === "HOLD");

    return {
      total: sum(filteredPayouts),
      pending: sum(pending),
      completed: sum(completed),
      rejected: sum(rejected),
      hold: sum(hold),
      pendingCount: pending.length,
      completedCount: completed.length,
      rejectedCount: rejected.length,
      holdCount: hold.length,
    };
  }, [filteredPayouts]);

  const totalPages = Math.max(1, Math.ceil(filteredPayouts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredPayouts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredPayouts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredPayouts.length);

  useEffect(() => {
    setPage(1);
  }, [party, storeFilter, riderFilter, statusFilter, dateFrom, dateTo, pageSize]);

  const clearFilters = () => {
    setStoreFilter("ALL");
    setRiderFilter("ALL");
    setStatusFilter("PENDING");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasActiveFilters =
    (party === "merchant" && storeFilter !== "ALL") ||
    (party === "rider" && riderFilter !== "ALL") ||
    statusFilter !== "PENDING" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const exportCsv = () => {
    const header = ["Store", "Store ID", "Amount", "Status", "PG TNX ID", "UTR", "Requested On"];
    const lines = filteredPayouts.map((p) => [
      String(p.store_name ?? ""),
      String(p.store_code ?? ""),
      String(p.amount ?? 0),
      displayStatus(String(p.status ?? "")),
      String(p.pg_transaction_id ?? pgInputs[p.id] ?? ""),
      String(p.utr_reference ?? utrInputs[p.id] ?? ""),
      p.requested_at ?? "",
    ]);
    const csv = [header, ...lines].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${party}-withdrawals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-30 shrink-0 border-b-[0.5px] border-[#121212]/10 bg-white py-2">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-md border-[0.5px] border-[#121212]/15 bg-white px-2.5 py-2 [scrollbar-width:thin]">
          <PaymentPartyTabs party={party} onChange={setParty} />

          {party === "merchant" || party === "rider" ? (
            <>
              {party === "merchant" ? (
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className={`${controlClass} w-[8.5rem] shrink-0 sm:w-44`}
                >
                  <option value="ALL">All Stores</option>
                  {storeOptions.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={riderFilter}
                  onChange={(e) => setRiderFilter(e.target.value)}
                  className={`${controlClass} w-[8.5rem] shrink-0 sm:w-44`}
                >
                  <option value="ALL">All Riders</option>
                  {riderOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className={`${controlClass} w-[7.5rem] shrink-0`}
              >
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED">Rejected</option>
                <option value="HOLD">Hold</option>
              </select>

              <div className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#121212]/12 bg-white px-2 text-xs text-[#121212]/70">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-[#121212]/35" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[108px] border-0 bg-transparent p-0 text-xs outline-none"
                />
                <span className="text-[#121212]/35">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[108px] border-0 bg-transparent p-0 text-xs outline-none"
                />
              </div>

              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs font-medium text-[#121212]/65 hover:bg-[#F7F7F7]"
                >
                  Clear
                </button>
              ) : null}
            </>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#121212]/12 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-[#F7F7F7]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            {party === "merchant" || party === "rider" ? (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#121212]/12 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-[#F7F7F7]"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            ) : null}
          </div>
        </div>

        {party === "merchant" || party === "rider" ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-[#121212]/55">
            <span>
              Total <span className="font-semibold tabular-nums text-[#121212]">{formatInr(stats.total)}</span>
            </span>
            <span>
              Pending{" "}
              <span className="font-semibold tabular-nums text-amber-700">{formatInr(stats.pending)}</span>
              {stats.pendingCount > 0 ? (
                <span className="ml-1 text-amber-700/80">({stats.pendingCount})</span>
              ) : null}
            </span>
            <span>
              Completed{" "}
              <span className="font-semibold tabular-nums text-emerald-700">{formatInr(stats.completed)}</span>
              {stats.completedCount > 0 ? (
                <span className="ml-1 text-emerald-700/80">({stats.completedCount})</span>
              ) : null}
            </span>
            <span>
              Rejected{" "}
              <span className="font-semibold tabular-nums text-red-700">{formatInr(stats.rejected)}</span>
              {stats.rejectedCount > 0 ? (
                <span className="ml-1 text-red-700/80">({stats.rejectedCount})</span>
              ) : null}
            </span>
            <span>
              Hold{" "}
              <span className="font-semibold tabular-nums text-violet-700">{formatInr(stats.hold)}</span>
              {stats.holdCount > 0 ? (
                <span className="ml-1 text-violet-700/80">({stats.holdCount})</span>
              ) : null}
            </span>
            <Link
              href="/dashboard/super-admin/rule-engine"
              className="ml-auto inline-flex items-center gap-1 font-medium text-[#121212]/65 hover:text-[#121212]"
            >
              Cancellation / refund rules
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </div>

      {migrationRequired && (
        <div className="mt-2 shrink-0 rounded-md border-[0.5px] border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Database migration required.</strong> Run{" "}
          <code className="rounded bg-amber-100 px-1">0239_super_admin_payment_management_system.sql</code>
          {" "}and{" "}
          <code className="rounded bg-amber-100 px-1">0270_merchant_payout_pg_transaction_id.sql</code>
          {" "}in Supabase, then refresh.
        </div>
      )}

      {/* Keep panels mounted so tab switches stay instant after first load. */}
      <div
        className={
          party === "merchant" || party === "rider"
            ? "mt-3 flex min-h-0 flex-1 flex-col overflow-hidden"
            : "hidden"
        }
      >
        <div className={`min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
          <PayoutsTable
            party={party === "rider" ? "rider" : "merchant"}
            rows={pageRows}
            savingId={savingId}
            pgInputs={pgInputs}
            utrInputs={utrInputs}
            onPgChange={(id, v) => setPgInputs((prev) => ({ ...prev, [id]: v }))}
            onUtrChange={(id, v) => setUtrInputs((prev) => ({ ...prev, [id]: v }))}
            onAction={payoutAction}
            onRejectClick={(row) => setRejectModal(row)}
            onHoldClick={(row) => setHoldModal(row)}
            onEditField={(row, field) => setEditModal({ row, field })}
          />
        </div>

        <div className="sticky bottom-0 z-30 mt-1 shrink-0 border-t-[0.5px] border-[#121212]/10 bg-white px-3 py-1 sm:px-4">
          <div className="flex flex-col items-center justify-between gap-1.5 sm:flex-row sm:gap-3">
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
              <div className="text-center text-[11px] leading-none text-[#121212]/70 sm:text-left">
                Showing{" "}
                <span className="font-semibold text-[#121212]">{rangeStart}</span> to{" "}
                <span className="font-semibold text-[#121212]">{rangeEnd}</span> of{" "}
                <span className="font-semibold text-[#121212]">{filteredPayouts.length}</span>{" "}
                entries
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] leading-none text-[#121212]/70">
                <span className="whitespace-nowrap">Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-7 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-1.5 text-[11px] font-medium text-[#121212] focus:border-[#121212]/40 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 5)
                .map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold ${
                      n === safePage
                        ? "bg-[#121212] text-white"
                        : "border-[0.5px] border-[#121212]/20 bg-white text-[#121212] hover:bg-[#F7F7F7]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={
          party === "threshold" ? "mt-3 min-h-0 flex-1 overflow-auto" : "hidden"
        }
      >
        <PaymentThresholdPanel />
      </div>

      <div
        className={
          party === "adjustment"
            ? "mt-3 flex min-h-0 flex-1 flex-col overflow-hidden"
            : "hidden"
        }
      >
        <WalletAdjustmentsPanel />
      </div>

      {editModal ? (
        <EditPayoutFieldModal
          row={editModal.row}
          field={editModal.field}
          pgInputs={pgInputs}
          utrInputs={utrInputs}
          saving={savingId === `payout-${editModal.row.id}`}
          onClose={() => setEditModal(null)}
          onSave={async (value) => {
            const ok = await payoutAction(Number(editModal.row.id), "updateRefs", {
              field: editModal.field,
              value,
            });
            if (ok) setEditModal(null);
          }}
        />
      ) : null}

      {rejectModal ? (
        <PayoutReasonModal
          mode="reject"
          row={rejectModal}
          party={party}
          saving={savingId === `payout-${rejectModal.id}`}
          onClose={() => setRejectModal(null)}
          onConfirm={async (reason) => {
            const ok = await payoutAction(Number(rejectModal.id), "reject", { reason });
            if (ok) setRejectModal(null);
          }}
        />
      ) : null}

      {holdModal ? (
        <PayoutReasonModal
          mode="hold"
          row={holdModal}
          party={party}
          saving={savingId === `payout-${holdModal.id}`}
          onClose={() => setHoldModal(null)}
          onConfirm={async (reason) => {
            const ok = await payoutAction(Number(holdModal.id), "approve", { reason });
            if (ok) setHoldModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PaymentPartyTabs({
  party,
  onChange,
}: {
  party: PaymentParty;
  onChange: (p: PaymentParty) => void;
}) {
  const items: { id: PaymentParty; label: string; icon: ReactNode }[] = [
    { id: "merchant", label: "Merchant", icon: <Store className="h-3.5 w-3.5" /> },
    { id: "rider", label: "Rider", icon: <Bike className="h-3.5 w-3.5" /> },
    { id: "threshold", label: "Threshold", icon: <Gauge className="h-3.5 w-3.5" /> },
    { id: "adjustment", label: "Adjustment", icon: <Scale className="h-3.5 w-3.5" /> },
  ];

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-[#121212]/12 bg-[#F7F7F7] p-0.5"
      role="tablist"
      aria-label="Payment party"
    >
      {items.map((item) => {
        const active = party === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-[#121212] text-white"
                : "text-[#121212]/65 hover:bg-white hover:text-[#121212]"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function statusBadge(rawStatus: string) {
  const status = displayStatus(rawStatus);
  const map: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-800",
    HOLD: "bg-violet-50 text-violet-800",
    COMPLETED: "bg-emerald-50 text-emerald-800",
    REJECTED: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[status] ?? "bg-[#F4F4F4] text-[#121212]/60"
      }`}
    >
      {status}
    </span>
  );
}

function PayoutsTable({
  party,
  rows,
  savingId,
  pgInputs,
  utrInputs,
  onPgChange,
  onUtrChange,
  onAction,
  onRejectClick,
  onHoldClick,
  onEditField,
}: {
  party: PaymentParty;
  rows: MerchantPayoutRow[];
  savingId: string | null;
  pgInputs: Record<number, string>;
  utrInputs: Record<number, string>;
  onPgChange: (id: number, value: string) => void;
  onUtrChange: (id: number, value: string) => void;
  onAction: (
    id: number,
    action: "approve" | "reject" | "complete" | "updateRefs",
    extras?: { reason?: string; pgTransactionId?: string; utrReference?: string; field?: EditField; value?: string }
  ) => Promise<boolean>;
  onRejectClick: (row: MerchantPayoutRow) => void;
  onHoldClick: (row: MerchantPayoutRow) => void;
  onEditField: (row: MerchantPayoutRow, field: EditField) => void;
}) {
  return (
    <table className="w-full min-w-[920px] border-collapse text-left text-sm">
      <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
        <tr>
          <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
            {party === "rider" ? "Rider" : "Store"}
          </th>
          <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Amount</th>
          <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Status</th>
          <th className={`sticky top-0 z-20 min-w-[150px] bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
            PG TNX ID
          </th>
          <th className={`sticky top-0 z-20 min-w-[120px] bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
            UTR
          </th>
          <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
            Requested On
          </th>
          <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-3 py-12 text-center text-sm text-[#121212]/45">
              No withdrawal requests
            </td>
          </tr>
        ) : (
          rows.map((p, rowIndex) => {
            const id = Number(p.id);
            const busy = savingId === `payout-${id}`;
            const pg = pgInputs[id] ?? p.pg_transaction_id ?? "";
            const utr = utrInputs[id] ?? p.utr_reference ?? "";
            const rawStatus = String(p.status ?? "PENDING");
            const disp = displayStatus(rawStatus);
            const isPending = disp === "PENDING";
            const isHold = disp === "HOLD";
            const showPgInput = isPending || isHold;
            const showUtrInput = isPending || isHold;

            return (
              <tr key={id} className="hover:bg-[#F7F7F7]/70">
                <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                  {party === "rider" ? (
                    <>
                      <div className="text-sm font-semibold leading-snug text-[#121212]">
                        {String(p.rider_name ?? "—")}
                      </div>
                      <div className="font-mono text-[10px] text-[#121212]/40">
                        GMR{String(p.rider_id ?? "")} · {String(p.rider_mobile ?? "")}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold leading-snug text-[#121212]">
                        {String(p.store_name ?? "—")}
                      </div>
                      <div className="font-mono text-[10px] text-[#121212]/40">
                        {String(p.store_code ?? "")}
                      </div>
                    </>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 align-middle text-sm font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                >
                  {formatInr(Number(p.amount ?? 0))}
                </td>
                <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                  <div className="flex flex-col gap-0.5">
                    {statusBadge(rawStatus)}
                    {disp === "REJECTED" && p.rejection_reason ? (
                      <span
                        className="max-w-[180px] truncate text-[10px] text-red-600"
                        title={String(p.rejection_reason)}
                      >
                        {String(p.rejection_reason)}
                      </span>
                    ) : null}
                    {disp === "HOLD" && p.hold_reason ? (
                      <span
                        className="max-w-[180px] truncate text-[10px] text-violet-700"
                        title={String(p.hold_reason)}
                      >
                        {String(p.hold_reason)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                  {showPgInput ? (
                    <input
                      type="text"
                      value={pg}
                      onChange={(e) => onPgChange(id, e.target.value)}
                      placeholder="pay_xxx / txn id"
                      disabled={busy}
                      className="w-full min-w-[130px] rounded-md border border-[#121212]/12 px-2 py-1 font-mono text-xs outline-none focus:border-[#121212]/35 disabled:opacity-50"
                    />
                  ) : (
                    <span className="font-mono text-xs text-[#121212]/70">{pg.trim() || "—"}</span>
                  )}
                </td>
                <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                  {showUtrInput ? (
                    <input
                      type="text"
                      value={utr}
                      onChange={(e) => onUtrChange(id, e.target.value)}
                      placeholder="Bank UTR"
                      disabled={busy}
                      className="w-full min-w-[100px] rounded-md border border-[#121212]/12 px-2 py-1 font-mono text-xs outline-none focus:border-[#121212]/35 disabled:opacity-50"
                    />
                  ) : (
                    <span className="text-xs text-[#121212]/50">{utr.trim() || "—"}</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 align-middle text-xs text-[#121212]/60 ${rowBorder}`}
                >
                  {formatRequestedAt(p.requested_at)}
                </td>
                <td className={`px-3 py-2.5 align-middle ${rowBorder}`}>
                  <div className="flex items-center justify-end gap-1">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          disabled={busy || (!pg.trim() && !utr.trim())}
                          title={
                            !pg.trim() && !utr.trim()
                              ? "Enter PG TNX ID or UTR to approve (marks Completed)"
                              : "Mark paid — completes withdrawal"
                          }
                          onClick={() =>
                            void onAction(id, "complete", {
                              pgTransactionId: pg.trim(),
                              utrReference: utr.trim(),
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-[#121212] px-2.5 py-1 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          title="Put withdrawal on hold for later release"
                          onClick={() => onHoldClick(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                        >
                          <PauseCircle className="h-3 w-3" />
                          Hold
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRejectClick(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          Reject
                        </button>
                      </>
                    )}

                    {isHold && (
                      <>
                        <button
                          type="button"
                          disabled={busy || (!pg.trim() && !utr.trim())}
                          title={
                            !pg.trim() && !utr.trim()
                              ? "Enter PG TNX ID or UTR to release"
                              : "Release funds to bank (Completed)"
                          }
                          onClick={() =>
                            void onAction(id, "complete", {
                              pgTransactionId: pg.trim(),
                              utrReference: utr.trim(),
                            })
                          }
                          className="inline-flex items-center rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-200 disabled:text-violet-500"
                        >
                          Release
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          title="Reject this held withdrawal and return funds"
                          onClick={() => onRejectClick(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          Reject
                        </button>
                      </>
                    )}

                    <RowActionsMenu
                      disabled={busy}
                      preferDropUp={rowIndex >= rows.length - 2}
                      onEditPg={() => onEditField(p, "pg")}
                      onEditUtr={() => onEditField(p, "utr")}
                    />
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function RowActionsMenu({
  disabled,
  preferDropUp,
  onEditPg,
  onEditUtr,
}: {
  disabled?: boolean;
  preferDropUp?: boolean;
  onEditPg: () => void;
  onEditUtr: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const openMenu = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 88;
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropUp = preferDropUp || spaceBelow < menuHeight + 12;
    setMenuPos({
      top: dropUp ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left: Math.max(8, rect.right - 168),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  const menu =
    open && menuPos ? (
      <div
        ref={menuRef}
        style={{ top: menuPos.top, left: menuPos.left }}
        className="fixed z-[9999] min-w-[168px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
      >
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => {
            close();
            onEditPg();
          }}
        >
          Edit PG TNX ID
        </button>
        <button
          type="button"
          className="block w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => {
            close();
            onEditUtr();
          }}
        >
          Edit UTR
        </button>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        title="More actions"
        onClick={() => (open ? close() : openMenu())}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function EditPayoutFieldModal({
  row,
  field,
  pgInputs,
  utrInputs,
  saving,
  onClose,
  onSave,
}: {
  row: MerchantPayoutRow;
  field: EditField;
  pgInputs: Record<number, string>;
  utrInputs: Record<number, string>;
  saving: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const id = Number(row.id);
  const initial =
    field === "pg"
      ? pgInputs[id] ?? row.pg_transaction_id ?? ""
      : utrInputs[id] ?? row.utr_reference ?? "";
  const [value, setValue] = useState(initial);

  const title = field === "pg" ? "Edit PG TNX ID" : "Edit UTR";
  const placeholder = field === "pg" ? "pay_xxx / txn id" : "Bank UTR";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">
              {partyLabelName(row)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {field === "pg" ? "PG TNX ID" : "UTR (optional)"}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || (field === "pg" && !value.trim())}
            onClick={() => void onSave(value.trim())}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function partyLabelName(row: MerchantPayoutRow): string {
  return String(row.store_name ?? row.rider_name ?? "—");
}

function PayoutReasonModal({
  mode,
  row,
  party,
  saving,
  onClose,
  onConfirm,
}: {
  mode: "reject" | "hold";
  row: MerchantPayoutRow;
  party: PaymentParty;
  saving: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && !saving;
  const isHold = mode === "hold";
  const subject =
    party === "rider"
      ? String(row.rider_name ?? `Rider #${row.rider_id ?? ""}`)
      : String(row.store_name ?? row.store_code ?? "Store");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isHold ? "Hold withdrawal" : "Reject withdrawal"}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {subject} · {formatInr(Number(row.amount ?? 0))}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            {isHold ? "Hold reason" : "Reject reason"} <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={500}
            placeholder={
              isHold
                ? "Explain why this withdrawal is being put on hold…"
                : "Explain why this withdrawal is being rejected…"
            }
            className={`w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ${
              isHold
                ? "focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
                : "focus:border-red-400 focus:ring-1 focus:ring-red-200"
            }`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Required (min 3 characters). Saved with the payout for audit.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onConfirm(trimmed)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              isHold ? "bg-violet-600 hover:bg-violet-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {saving
              ? isHold
                ? "Holding…"
                : "Rejecting…"
              : isHold
                ? "Confirm hold"
                : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
