"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { ExportTransactionsSheet } from "@/components/transactions/ExportTransactionsSheet";
import { TablePagination } from "@/components/riders/TablePagination";
import { usePermissions } from "@/hooks/usePermissions";

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
    { value: "person_ride", label: "Person Ride" },
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
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  created: "bg-gray-100 text-gray-600 ring-gray-500/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  captured_unfinalized: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  reconciliation_required: "bg-orange-50 text-orange-700 ring-orange-600/20",
  failed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  refund_pending: "bg-sky-50 text-sky-700 ring-sky-600/20",
  refunded: "bg-violet-50 text-violet-700 ring-violet-600/20",
  refund_failed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  cancelled: "bg-gray-100 text-gray-500 ring-gray-400/20",
  unknown: "bg-gray-50 text-gray-500 ring-gray-400/20",
};

const INPUT_CLS = "h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200";

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
    queryFn: async (): Promise<ListResp> => {
      const sp = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
      sp.set("page", String(page));
      sp.set("limit", String(pageSize));
      const res = await fetch(`/api/transactions?${sp.toString()}`, { credentials: "include" });
      const json = (await res.json()) as ListResp;
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load transactions");
      return json;
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? rows.length;

  const resetFilters = () => {
    setService(""); setStatus(""); setMode(""); setDateFrom(""); setDateTo("");
    setAmountMin(""); setAmountMax(""); setSearchInput("");
    setPage(1);
  };

  const exportSeed = useMemo(() => ({
    app, service, status, mode, dateFrom, dateTo,
  }), [app, service, status, mode, dateFrom, dateTo]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex w-fit gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
            {APP_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setApp(t.key)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  app === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={resetFilters} className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Reset</button>
            {isSuperAdmin ? (
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Export
              </button>
            ) : null}
            <button type="button" onClick={() => query.refetch()} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">Refresh</button>
          </div>
        </div>

        <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-0.5">
          <div className="flex w-[200px] shrink-0 flex-col gap-1">
            <label className="text-xs text-gray-500">Search</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="GMF… / payment id"
              className={INPUT_CLS}
              title="Search formatted order id, Razorpay id, ref, entity id"
            />
          </div>
          {(SERVICE_OPTIONS[app] ?? []).length > 0 && (
            <Select label="Service" value={service} onChange={setService} options={SERVICE_OPTIONS[app]} placeholder="All services" />
          )}
          <Select label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} placeholder="All statuses" />
          <Select label="Mode" value={mode} onChange={setMode} options={[
            { value: "razorpay", label: "Razorpay" }, { value: "wallet", label: "Wallet" },
            { value: "gati_cash", label: "GatiCash" }, { value: "cash", label: "Cash" }, { value: "online", label: "Online" },
          ]} placeholder="All modes" />
          <Field label="From"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${INPUT_CLS} w-[9.5rem] shrink-0`} /></Field>
          <Field label="To"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${INPUT_CLS} w-[9.5rem] shrink-0`} /></Field>
          <Field label="Min ₹"><input type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className={`${INPUT_CLS} w-20 shrink-0`} /></Field>
          <Field label="Max ₹"><input type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className={`${INPUT_CLS} w-20 shrink-0`} /></Field>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">When</th>
              <th className="px-3 py-2.5 font-medium">App</th>
              <th className="px-3 py-2.5 font-medium">Service</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 text-right font-medium">Paid</th>
              <th className="px-3 py-2.5 font-medium">Mode</th>
              <th className="px-3 py-2.5 font-medium">Order ID</th>
              <th className="px-3 py-2.5 font-medium">Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {query.isLoading ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : query.isError ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-rose-500">{(query.error as Error)?.message ?? "Error loading transactions"}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-gray-400">No transactions match these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.uid} onClick={() => setSelectedUid(r.uid)} className="cursor-pointer hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{fmtTime(r.createdAt)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-800">{r.app}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-800">{r.service.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.normStatus} raw={r.status} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-gray-900">{inr(r.grossPaise)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-600">{inr(r.paidPaise)}</td>
                  <td className="px-3 py-2.5 capitalize text-gray-500">{(r.paymentMode ?? "—").replace(/_/g, " ")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-800">
                    {displayOrderId(r.businessOrderId) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-gray-800">{r.entityName ?? "—"}</div>
                    <div className="text-xs text-gray-400">{r.entityDisplayId ?? `${r.entityType} #${r.entityId ?? "—"}`}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-600">
          <span>Rows</span>
          <select
            value={pageSize}
            disabled={query.isFetching}
            onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
            className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 disabled:opacity-50"
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          disabled={query.isFetching}
          ariaLabel="Transactions"
        />
      </div>

      {selectedUid && <DetailDrawer uid={selectedUid} onClose={() => setSelectedUid(null)} />}
      {isSuperAdmin ? (
        <ExportTransactionsSheet isOpen={exportOpen} onClose={() => setExportOpen(false)} seed={exportSeed} />
      ) : null}
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex shrink-0 flex-col gap-1"><label className="text-xs text-gray-500">{label}</label>{children}</div>;
}
function Select({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT_CLS} capitalize`}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}
function StatusBadge({ status, raw }: { status: string; raw: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  return <span title={raw} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${style}`}>{status.replace(/_/g, " ")}</span>;
}

function DetailDrawer({ uid, onClose }: { uid: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["transaction-detail", uid],
    queryFn: async (): Promise<DetailResp> => {
      const res = await fetch(`/api/transactions/detail?uid=${encodeURIComponent(uid)}`, { credentials: "include" });
      const json = (await res.json()) as DetailResp;
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load detail");
      return json;
    },
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
