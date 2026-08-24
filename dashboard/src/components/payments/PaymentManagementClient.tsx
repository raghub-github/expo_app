"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  RefreshCw,
  Check,
  X,
  Store,
  Bike,
  Users,
  ArrowRight,
  MoreVertical,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Calendar,
  Download,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { readApiJson } from "@/lib/payment/read-api-json";
import { formatInr } from "@/lib/format-inr";

type PaymentParty = "merchant" | "rider" | "customer";

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
  requested_at?: string;
  approved_at?: string;
  completed_at?: string;
};

type StatusFilter = "ALL" | "PENDING" | "COMPLETED" | "REJECTED" | "HOLD";

type EditField = "pg" | "utr";

const PAGE_SIZE_OPTIONS = [10, 50, 100, 500] as const;

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
  const [party, setParty] = useState<PaymentParty>("merchant");
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
        toast.success("Withdrawal approved");
      } else if (action === "reject") {
        toast.success("Withdrawal rejected");
      } else if (action === "updateRefs") {
        toast.success(extras?.field === "pg" ? "PG TNX ID updated" : "UTR updated");
      }
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
    <div className="space-y-3">
      {/* Tabs + Refresh */}
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200">
        <PaymentPartyTabs party={party} onChange={setParty} />
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {migrationRequired && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Database migration required.</strong> Run{" "}
          <code className="rounded bg-amber-100 px-1 text-xs">0239_super_admin_payment_management_system.sql</code>
          {" "}and{" "}
          <code className="rounded bg-amber-100 px-1 text-xs">0270_merchant_payout_pg_transaction_id.sql</code>
          {" "}in Supabase, then refresh.
        </div>
      )}

      {party === "customer" ? (
        <PaymentPartyComingSoon party={party} />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {party === "merchant" ? (
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
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
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
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
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
              <option value="HOLD">Hold</option>
            </select>

            <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 h-9 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border-0 bg-transparent p-0 text-sm outline-none w-[118px]"
              />
              <span className="text-gray-400">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border-0 bg-transparent p-0 text-sm outline-none w-[118px]"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            <button
              type="button"
              onClick={() => toast.info("Manual withdrawal creation coming soon")}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New Withdrawal
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Total Withdrawals"
              value={formatInr(stats.total)}
              icon={<Wallet className="h-5 w-5 text-blue-600" />}
              iconWrap="bg-blue-50"
            />
            <SummaryCard
              label="Pending"
              value={formatInr(stats.pending)}
              count={stats.pendingCount}
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              iconWrap="bg-amber-50"
              badgeTone="amber"
            />
            <SummaryCard
              label="Completed"
              value={formatInr(stats.completed)}
              count={stats.completedCount}
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              iconWrap="bg-emerald-50"
              badgeTone="emerald"
            />
            <SummaryCard
              label="Rejected"
              value={formatInr(stats.rejected)}
              count={stats.rejectedCount}
              icon={<XCircle className="h-5 w-5 text-red-600" />}
              iconWrap="bg-red-50"
              badgeTone="red"
            />
            <SummaryCard
              label="Hold"
              value={formatInr(stats.hold)}
              count={stats.holdCount}
              icon={<PauseCircle className="h-5 w-5 text-violet-600" />}
              iconWrap="bg-violet-50"
              badgeTone="violet"
              trailing={<ChevronDown className="h-4 w-4 text-gray-400" />}
            />
          </div>

          {/* Table header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <h2 className="text-sm font-semibold text-gray-900">
              {party === "rider" ? "Rider withdrawals" : "Merchant withdrawals"}{" "}
              <span className="font-normal text-gray-500">
                ({stats.pendingCount} Pending • {stats.completedCount} Completed • {stats.rejectedCount} Rejected • {stats.holdCount} Hold)
              </span>
            </h2>
            <Link
              href="/dashboard/super-admin/rule-engine"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Cancellation / refund rules
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <PayoutsTable
            party={party}
            rows={pageRows}
            savingId={savingId}
            pgInputs={pgInputs}
            utrInputs={utrInputs}
            onPgChange={(id, v) => setPgInputs((prev) => ({ ...prev, [id]: v }))}
            onUtrChange={(id, v) => setUtrInputs((prev) => ({ ...prev, [id]: v }))}
            onAction={payoutAction}
            onRejectClick={(row) => setRejectModal(row)}
            onEditField={(row, field) => setEditModal({ row, field })}
          />

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
            <div className="flex flex-wrap items-center gap-3">
              <p>
                Showing {rangeStart} to {rangeEnd} of {filteredPayouts.length} entries
              </p>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium ${
                    n === safePage
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

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
        <RejectPayoutReasonModal
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
    </div>
  );
}

function SummaryCard({
  label,
  value,
  count,
  icon,
  iconWrap,
  badgeTone,
  trailing,
}: {
  label: string;
  value: string;
  count?: number;
  icon: ReactNode;
  iconWrap: string;
  badgeTone?: "amber" | "emerald" | "red" | "violet";
  trailing?: ReactNode;
}) {
  const badgeClass =
    badgeTone === "amber"
      ? "bg-amber-100 text-amber-700"
      : badgeTone === "emerald"
        ? "bg-emerald-100 text-emerald-700"
        : badgeTone === "red"
          ? "bg-red-100 text-red-700"
          : badgeTone === "violet"
            ? "bg-violet-100 text-violet-700"
            : "";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          {count != null && count > 0 ? (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>{count}</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900">{value}</p>
      </div>
      {trailing}
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
  const items: { id: PaymentParty; label: string; icon: ReactNode; soon?: boolean }[] = [
    { id: "merchant", label: "Merchant", icon: <Store className="h-4 w-4" /> },
    { id: "rider", label: "Rider", icon: <Bike className="h-4 w-4" /> },
    { id: "customer", label: "Customer", icon: <Users className="h-4 w-4" />, soon: true },
  ];

  return (
    <nav className="flex gap-6" role="tablist" aria-label="Payment party">
      {items.map((item) => {
        const active = party === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-2 border-b-2 pb-2 text-sm font-semibold transition-colors ${
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {item.icon}
            {item.label}
            {item.soon ? (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Soon
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function PaymentPartyComingSoon({ party }: { party: PaymentParty }) {
  const label = party === "rider" ? "Rider" : "Customer";
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-gray-900">{label} payment settings</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
        Coming soon. Use <strong>Merchant</strong> for withdrawal approvals.
      </p>
    </div>
  );
}

function statusBadge(rawStatus: string) {
  const status = displayStatus(rawStatus);
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-800 ring-1 ring-amber-200/80",
    HOLD: "bg-violet-100 text-violet-800 ring-1 ring-violet-200/80",
    COMPLETED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80",
    REJECTED: "bg-red-100 text-red-800 ring-1 ring-red-200/80",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[status] ?? "bg-gray-100 text-gray-700"
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
  onEditField: (row: MerchantPayoutRow, field: EditField) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2">{party === "rider" ? "Rider" : "Store"}</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 min-w-[150px]">PG TNX ID</th>
              <th className="px-3 py-2 min-w-[120px]">UTR (Optional)</th>
              <th className="px-3 py-2">Requested On</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
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
                  <tr key={id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2">
                      {party === "rider" ? (
                        <>
                          <div className="text-sm font-semibold leading-snug text-gray-900">
                            {String(p.rider_name ?? "—")}
                          </div>
                          <div className="text-[10px] font-mono text-gray-400">
                            GMR{String(p.rider_id ?? "")} · {String(p.rider_mobile ?? "")}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-sm font-semibold leading-snug text-gray-900">{String(p.store_name ?? "—")}</div>
                          <div className="text-[10px] font-mono text-gray-400">{String(p.store_code ?? "")}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {formatInr(Number(p.amount ?? 0))}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        {statusBadge(rawStatus)}
                        {disp === "REJECTED" && p.rejection_reason ? (
                          <span className="max-w-[180px] truncate text-[10px] text-red-600" title={String(p.rejection_reason)}>
                            {String(p.rejection_reason)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {showPgInput ? (
                        <input
                          type="text"
                          value={pg}
                          onChange={(e) => onPgChange(id, e.target.value)}
                          placeholder="pay_xxx / txn id"
                          disabled={busy}
                          className="w-full min-w-[130px] rounded-md border border-gray-200 px-2 py-1 text-xs font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
                        />
                      ) : (
                        <span className="text-xs font-mono text-gray-700">{pg.trim() || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {showUtrInput ? (
                        <input
                          type="text"
                          value={utr}
                          onChange={(e) => onUtrChange(id, e.target.value)}
                          placeholder="Bank UTR"
                          disabled={busy}
                          className="w-full min-w-[100px] rounded-md border border-gray-200 px-2 py-1 text-xs font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{utr.trim() || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                      {formatRequestedAt(p.requested_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onAction(id, "approve")}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              Approve
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
                          <button
                            type="button"
                            disabled={busy || !pg.trim()}
                            title={!pg.trim() ? "Enter PG TNX ID first" : "Release funds to bank"}
                            onClick={() =>
                              void onAction(id, "complete", {
                                pgTransactionId: pg.trim(),
                                utrReference: utr.trim() || undefined,
                              })
                            }
                            className="inline-flex items-center rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-200 disabled:text-violet-500"
                          >
                            Release
                          </button>
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
      </div>
    </div>
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

function RejectPayoutReasonModal({
  row,
  party,
  saving,
  onClose,
  onConfirm,
}: {
  row: MerchantPayoutRow;
  party: PaymentParty;
  saving: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && !saving;
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
            <h3 className="text-base font-bold text-gray-900">Reject withdrawal</h3>
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
            Reject reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            maxLength={500}
            placeholder="Explain why this withdrawal is being rejected…"
            className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
          />
          <p className="mt-1 text-xs text-gray-500">
            Required (min 3 characters). Saved on the payout and wallet ledger.
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
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Rejecting…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
