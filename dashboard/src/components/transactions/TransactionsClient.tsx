"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { ExportTransactionsSheet } from "@/components/transactions/ExportTransactionsSheet";
import { usePermissions } from "@/hooks/usePermissions";
import { fetchJsonWithTimeout } from "@/lib/fetch-json-with-timeout";

const rowBorder = "border-b-[0.5px] border-[#121212]/10";
const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";
const controlClass =
  "h-9 rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212] outline-none focus:border-[#121212]/35";

/* ----------------------------- types ----------------------------- */
type TxnApp = "customer" | "merchant" | "rider";
interface TransactionRow {
  uid: string;
  source: string;
  app: TxnApp;
  service: string;
  purpose: string;
  status: string;
  normStatus: string;
  paymentMode: string | null;
  grossPaise: number;
  paidPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  internalRef: string | null;
  businessOrderId: string | null;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  entityDisplayId: string | null;
  createdAt: string;
  updatedAt: string | null;
}
interface ListResp {
  success: boolean;
  rows: TransactionRow[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number | null;
  page: number;
  pageSize: number;
  error?: string;
}
interface BreakdownComponent { label: string; amountPaise: number; kind: string }
interface LifecycleEvent { eventType: string; source: string; prevState: string | null; newState: string | null; amountPaise: number | null; failureCode: string | null; failureMessage: string | null; createdAt: string }
interface DetailResp { success: boolean; row: TransactionRow | null; breakdown: BreakdownComponent[]; lifecycle: LifecycleEvent[]; error?: string }

/* ----------------------------- constants ----------------------------- */
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const APP_TABS: { key: TxnApp | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "customer", label: "Customer" },
  { key: "merchant", label: "Merchant" },
  { key: "rider", label: "Rider" },
];

const SERVICE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  all: [],
  customer: [
    { value: "food", label: "Food" },
    { value: "grocery", label: "Grocery" },
    { value: "parcel", label: "Parcel" },
    { value: "person_ride", label: "Ride" },
    { value: "wallet_topup", label: "Wallet Top-up" },
  ],
  merchant: [
    { value: "subscription", label: "Subscription" },
    { value: "wallet_dues", label: "Wallet Dues" },
    { value: "onboarding", label: "Onboarding" },
  ],
  rider: [
    { value: "onboarding", label: "Onboarding Fee" },
    { value: "negative_wallet_recovery", label: "Negative Wallet" },
  ],
};

const STATUS_OPTIONS = [
  "created", "pending", "paid", "captured_unfinalized", "failed",
  "reconciliation_required", "refund_pending", "refunded", "refund_failed", "cancelled",
];

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-800",
  created: "bg-[#F4F4F4] text-[#121212]/60",
  pending: "bg-amber-50 text-amber-800",
  captured_unfinalized: "bg-indigo-50 text-indigo-800",
  reconciliation_required: "bg-orange-50 text-orange-800",
  failed: "bg-rose-50 text-rose-700",
  refund_pending: "bg-sky-50 text-sky-800",
  refunded: "bg-violet-50 text-violet-800",
  refund_failed: "bg-rose-50 text-rose-700",
  cancelled: "bg-[#F4F4F4] text-[#121212]/50",
  unknown: "bg-[#F4F4F4] text-[#121212]/50",
};

const KNOWN_STATUSES = new Set(Object.keys(STATUS_STYLE));

/** Prefer API normStatus; fall back to raw payment status so badges stay accurate. */
function resolveDisplayStatus(normStatus: string, raw: string): string {
  const n = String(normStatus ?? "").trim().toLowerCase();
  if (n && KNOWN_STATUSES.has(n) && n !== "unknown") return n;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (
    s === "paid" ||
    s === "finalized" ||
    s === "captured" ||
    s === "success" ||
    s === "completed" ||
    s === "settled"
  ) {
    return "paid";
  }
  if (s === "pending" || s === "pending_confirmation" || s === "initiated" || s === "processing") {
    return "pending";
  }
  if (s === "created") return "created";
  if (s === "captured_unfinalized") return "captured_unfinalized";
  if (s === "reconciliation_required") return "reconciliation_required";
  if (s === "failed") return "failed";
  if (s === "refund_pending") return "refund_pending";
  if (s === "refunded" || s === "partially_refunded") return "refunded";
  if (s === "refund_failed") return "refund_failed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (n && KNOWN_STATUSES.has(n)) return n;
  return "unknown";
}

/* ----------------------------- helpers ----------------------------- */
const inr = (paise: number): string =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Formatted public order id only — never a numeric pk or internal uuid. */
function displayOrderId(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim().replace(/^#/, "");
  if (!t || /^\d+$/.test(t)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  return t;
}
const fmtTime = (iso: string): string => {
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};
function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ----------------------------- component ----------------------------- */
export function TransactionsClient() {
  const { isSuperAdmin } = usePermissions();
  const [app, setApp] = useState<TxnApp | "all">("all");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const q = useDebounced(searchInput);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(20);

  useEffect(() => { setService(""); }, [app]);
  useEffect(() => { setPage(1); }, [app, service, status, mode, dateFrom, dateTo, amountMin, amountMax, q, pageSize]);

  const filters = useMemo(() => ({
    app: app === "all" ? "" : app,
    service, status, mode, dateFrom, dateTo,
    amountMin: amountMin ? String(Math.round(Number(amountMin) * 100)) : "",
    amountMax: amountMax ? String(Math.round(Number(amountMax) * 100)) : "",
    q,
  }), [app, service, status, mode, dateFrom, dateTo, amountMin, amountMax, q]);

  const query = useQuery({
    queryKey: ["transactions", filters, page, pageSize],
    queryFn: ({ signal }): Promise<ListResp> => {
      const sp = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
      sp.set("page", String(page));
      sp.set("limit", String(pageSize));
      return fetchJsonWithTimeout<ListResp>(`/api/transactions?${sp.toString()}`, { signal });
    },
    // Keep the board live: poll while the tab is visible; Refresh still forces an immediate refetch.
    staleTime: 10_000,
    // Stop polling once a fetch fails. Re-polling a server we cannot reach every 15s
    // only piles up doomed requests and fills the console; window focus, the Retry
    // button and Refresh all bring the board back once the connection is good again.
    refetchInterval: (query) => (query.state.status === "error" ? false : 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    placeholderData: (prev) => prev,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const pageNumbers = useMemo(() => {
    const pages: Array<number | "..."> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  const resetFilters = () => {
    setService(""); setStatus(""); setMode(""); setDateFrom(""); setDateTo("");
    setAmountMin(""); setAmountMax(""); setSearchInput("");
    setPage(1);
  };

  const exportSeed = useMemo(() => ({
    app, service, status, mode, dateFrom, dateTo,
  }), [app, service, status, mode, dateFrom, dateTo]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-30 shrink-0 border-b-[0.5px] border-[#121212]/10 bg-white py-2">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-md border-[0.5px] border-[#121212]/15 bg-white px-2.5 py-2 [scrollbar-width:thin]">
          <select
            value={app}
            onChange={(e) => setApp(e.target.value as TxnApp | "all")}
            className={`${controlClass} w-[5.75rem] shrink-0`}
            aria-label="App"
          >
            {APP_TABS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>

          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="GMF… / payment id"
            title="Search formatted order id, Razorpay id, ref, entity id"
            className={`${controlClass} w-[11rem] shrink-0 sm:w-52`}
          />
          {(SERVICE_OPTIONS[app] ?? []).length > 0 ? (
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className={`${controlClass} w-[8rem] shrink-0 capitalize`}
              aria-label="Service"
            >
              <option value="">All services</option>
              {SERVICE_OPTIONS[app].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`${controlClass} w-[8.5rem] shrink-0 capitalize`}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className={`${controlClass} w-[7.5rem] shrink-0`}
            aria-label="Mode"
          >
            <option value="">All modes</option>
            <option value="razorpay">Razorpay</option>
            <option value="wallet">Wallet</option>
            <option value="gati_cash">GatiCash</option>
            <option value="cash">Cash</option>
            <option value="online">Online</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`${controlClass} w-[7.25rem] shrink-0 px-1.5`}
            aria-label="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`${controlClass} w-[7.25rem] shrink-0 px-1.5`}
            aria-label="To date"
          />
          <input
            type="number"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            placeholder="Min ₹"
            className={`${controlClass} w-[5rem] shrink-0`}
            aria-label="Min amount"
          />
          <input
            type="number"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            placeholder="Max ₹"
            className={`${controlClass} w-[5rem] shrink-0`}
            aria-label="Max amount"
          />

          <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 pr-0.5">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs font-semibold text-[#121212]/65 hover:bg-[#F7F7F7]"
            >
              Reset
            </button>
            {isSuperAdmin ? (
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs font-semibold text-[#121212] hover:bg-[#F7F7F7]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Export
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#121212] px-2.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-80"
            >
              {query.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className={`mt-3 min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
            <tr>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>When</th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>App</th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Service</th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Status</th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                Amount
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                Paid
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Mode</th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Order ID</th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Entity</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-sm text-[#121212]/45">
                  Loading…
                </td>
              </tr>
            ) : query.isError ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center">
                  <p className="text-sm text-rose-600">
                    {(query.error as Error)?.message ?? "Error loading transactions"}
                  </p>
                  <p className="mt-1 text-[11px] text-[#121212]/40">
                    Auto-refresh is paused until this succeeds.
                  </p>
                  <button
                    type="button"
                    onClick={() => void query.refetch()}
                    disabled={query.isFetching}
                    className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-md bg-[#121212] px-4 text-xs font-semibold text-white hover:bg-black disabled:opacity-80"
                  >
                    {query.isFetching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    Retry
                  </button>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-sm text-[#121212]/45">
                  No transactions match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.uid}
                  onClick={() => setSelectedUid(r.uid)}
                  className="cursor-pointer hover:bg-[#F7F7F7]/70"
                >
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 text-xs text-[#121212]/60 ${rowBorder}`}
                  >
                    {fmtTime(r.createdAt)}
                  </td>
                  <td className={`px-3 py-2.5 capitalize text-[#121212] ${rowBorder}`}>{r.app}</td>
                  <td className={`px-3 py-2.5 capitalize text-[#121212] ${rowBorder}`}>
                    {r.service === "person_ride" ? "Ride" : r.service.replace(/_/g, " ")}
                  </td>
                  <td className={`px-3 py-2.5 ${rowBorder}`}>
                    <StatusBadge status={r.normStatus} raw={r.status} />
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                  >
                    {inr(r.grossPaise)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#121212]/65 ${rowBorder}`}
                  >
                    {inr(r.paidPaise)}
                  </td>
                  <td className={`px-3 py-2.5 capitalize text-[#121212]/55 ${rowBorder}`}>
                    {(r.paymentMode ?? "—").replace(/_/g, " ")}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 font-mono text-xs text-[#121212] ${rowBorder}`}
                  >
                    {displayOrderId(r.businessOrderId) ?? "—"}
                  </td>
                  <td className={`px-3 py-2.5 ${rowBorder}`}>
                    <div className="font-medium text-[#121212]">{r.entityName ?? "—"}</div>
                    <div className="text-[10px] text-[#121212]/40">
                      {r.entityDisplayId ?? `${r.entityType} #${r.entityId ?? "—"}`}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 z-30 mt-1 shrink-0 border-t-[0.5px] border-[#121212]/10 bg-white px-3 py-1 sm:px-4">
        <div className="flex flex-col items-center justify-between gap-1.5 sm:flex-row sm:gap-3">
          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
            <div className="text-center text-[11px] leading-none text-[#121212]/70 sm:text-left">
              Showing <span className="font-semibold text-[#121212]">{rangeStart}</span> to{" "}
              <span className="font-semibold text-[#121212]">{rangeEnd}</span> of{" "}
              <span className="font-semibold text-[#121212]">{total}</span> entries
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] leading-none text-[#121212]/70">
              <span className="whitespace-nowrap">Rows per page</span>
              <select
                value={pageSize}
                disabled={query.isFetching}
                onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
                className="h-7 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-1.5 text-[11px] font-medium text-[#121212] focus:border-[#121212]/40 focus:outline-none disabled:opacity-50"
                aria-label="Rows per page"
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
              disabled={query.isFetching || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            {pageNumbers.map((p, i) =>
              p === "..." ? (
                <span key={`e-${i}`} className="px-1.5 text-[11px] text-[#121212]/40">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  disabled={query.isFetching}
                  onClick={() => setPage(p)}
                  className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold ${
                    p === page
                      ? "bg-[#121212] text-white"
                      : "border-[0.5px] border-[#121212]/20 bg-white text-[#121212] hover:bg-[#F7F7F7]"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              disabled={query.isFetching || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex h-7 items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {selectedUid && <DetailDrawer uid={selectedUid} onClose={() => setSelectedUid(null)} />}
      {isSuperAdmin ? (
        <ExportTransactionsSheet isOpen={exportOpen} onClose={() => setExportOpen(false)} seed={exportSeed} />
      ) : null}
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */
function StatusBadge({ status, raw }: { status: string; raw: string }) {
  const display = resolveDisplayStatus(status, raw);
  const style = STATUS_STYLE[display] ?? STATUS_STYLE.unknown;
  return (
    <span
      title={raw || display}
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {display.replace(/_/g, " ")}
    </span>
  );
}

function DetailDrawer({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["transaction-detail", uid],
    queryFn: ({ signal }): Promise<DetailResp> =>
      fetchJsonWithTimeout<DetailResp>(`/api/transactions/detail?uid=${encodeURIComponent(uid)}`, { signal }),
  });
  const row = data?.row ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Transaction detail</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        {isLoading ? <p className="text-gray-400">Loading…</p>
        : isError ? <p className="text-rose-500">{(error as Error)?.message}</p>
        : row ? (
          <div className="flex flex-col gap-5">
            <Section title="Summary">
              <KV k="Status"><StatusBadge status={row.normStatus} raw={row.status} /></KV>
              <KV k="App / Service">{row.app} · {row.service.replace(/_/g, " ")}</KV>
              <KV k="Purpose">{row.purpose}</KV>
              <KV k="Amount">{inr(row.grossPaise)} ({row.currency})</KV>
              <KV k="Paid">{inr(row.paidPaise)}</KV>
              <KV k="Mode">{row.paymentMode ?? "—"}</KV>
              <KV k="Created">{fmtTime(row.createdAt)}</KV>
            </Section>

            <Section title={row.app === "customer" ? "Customer" : row.app === "rider" ? "Rider" : "Merchant"}>
              <KV k="Name">{row.entityName ?? "—"}</KV>
              <KV k={row.app === "customer" ? "Mobile" : row.app === "rider" ? "Rider ID" : "Store ID"} mono>{row.entityDisplayId ?? "—"}</KV>
              <KV k="Internal id" mono>{row.entityType} #{row.entityId ?? "—"}</KV>
            </Section>

            <Section title="Identifiers">
              <KV k="Order ID" mono>{displayOrderId(row.businessOrderId) ?? "—"}</KV>
              <KV k="Internal ref" mono>{row.internalRef ?? "—"}</KV>
              <KV k="Razorpay order" mono>{row.razorpayOrderId ?? "—"}</KV>
              <KV k="Razorpay payment" mono>{row.razorpayPaymentId ?? "—"}</KV>
            </Section>

            {data!.breakdown.length > 0 && (
              <Section title="Financial breakdown">
                <div className="flex flex-col gap-1">
                  {data!.breakdown.map((b, i) => (
                    <div key={i} className={`flex justify-between text-sm ${b.kind === "total" ? "border-t border-gray-200 pt-1 font-semibold" : ""}`}>
                      <span className={b.amountPaise < 0 ? "text-emerald-600" : "text-gray-600"}>{b.label}</span>
                      <span className={b.amountPaise < 0 ? "text-emerald-600" : "text-gray-900"}>{inr(b.amountPaise)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Lifecycle">
              {data!.lifecycle.length === 0 ? (
                <p className="text-sm text-gray-400">No lifecycle events recorded.</p>
              ) : (
                <ol className="flex flex-col gap-2 border-l border-gray-200 pl-4">
                  {data!.lifecycle.map((e, i) => (
                    <li key={i} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-gray-400" />
                      <div className="font-medium text-gray-700">{e.eventType}</div>
                      <div className="text-xs text-gray-400">
                        {fmtTime(e.createdAt)} · {e.source}
                        {e.failureCode ? ` · ${e.failureCode}` : ""}
                        {e.amountPaise != null ? ` · ${inr(e.amountPaise)}` : ""}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        ) : <p className="text-gray-400">Not found.</p>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}
function KV({ k, children, mono }: { k: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-500">{k}</span>
      <span className={`text-right text-gray-800 ${mono ? "font-mono text-xs" : "capitalize"}`}>{children}</span>
    </div>
  );
}
