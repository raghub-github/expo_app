"use client";

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

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
  createdAt: string;
  updatedAt: string | null;
}
interface ListResp { success: boolean; rows: TransactionRow[]; nextCursor: string | null; hasMore: boolean; error?: string }
interface BreakdownComponent { label: string; amountPaise: number; kind: string }
interface LifecycleEvent { eventType: string; source: string; prevState: string | null; newState: string | null; amountPaise: number | null; failureCode: string | null; failureMessage: string | null; createdAt: string }
interface DetailResp { success: boolean; row: TransactionRow | null; breakdown: BreakdownComponent[]; lifecycle: LifecycleEvent[]; error?: string }

/* ----------------------------- constants ----------------------------- */
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

  useEffect(() => { setService(""); }, [app]);

  const filters = useMemo(() => ({
    app: app === "all" ? "" : app,
    service, status, mode, dateFrom, dateTo,
    amountMin: amountMin ? String(Math.round(Number(amountMin) * 100)) : "",
    amountMax: amountMax ? String(Math.round(Number(amountMax) * 100)) : "",
    q,
  }), [app, service, status, mode, dateFrom, dateTo, amountMin, amountMax, q]);

  const query = useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: "",
    queryFn: async ({ pageParam }): Promise<ListResp> => {
      const sp = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
      if (pageParam) sp.set("cursor", String(pageParam));
      sp.set("limit", "20");
      const res = await fetch(`/api/transactions?${sp.toString()}`, { credentials: "include" });
      const json = (await res.json()) as ListResp;
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load transactions");
      return json;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
  });

  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.rows) ?? [], [query.data]);
  const total = rows.length;

  const resetFilters = () => {
    setService(""); setStatus(""); setMode(""); setDateFrom(""); setDateTo("");
    setAmountMin(""); setAmountMax(""); setSearchInput("");
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
        <p className="text-sm text-gray-500">
          Every payment across Customer, Merchant and Rider apps — search, filter and trace any transaction end-to-end.
        </p>
      </header>

      {/* App tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-gray-200 bg-gray-100 p-1">
        {APP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setApp(t.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              app === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex min-w-[220px] grow flex-col gap-1">
          <label className="text-xs text-gray-500">Search (Razorpay order/payment id, order id, ref, entity id)</label>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Exact id lookup…"
            className={INPUT_CLS}
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
        <Field label="From"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT_CLS} /></Field>
        <Field label="To"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT_CLS} /></Field>
        <Field label="Min ₹"><input type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className={`${INPUT_CLS} w-20`} /></Field>
        <Field label="Max ₹"><input type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className={`${INPUT_CLS} w-20`} /></Field>
        <button onClick={resetFilters} className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Reset</button>
        <button onClick={() => query.refetch()} className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">Refresh</button>
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
              <th className="px-3 py-2.5 font-medium">Razorpay Order</th>
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
                  <td className="px-3 py-2.5 capitalize text-gray-500">{r.paymentMode ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{r.razorpayOrderId ?? "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500">{r.entityType} #{r.entityId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Showing {total} transaction{total === 1 ? "" : "s"}</span>
        {query.hasNextPage && (
          <button
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {selectedUid && <DetailDrawer uid={selectedUid} onClose={() => setSelectedUid(null)} />}
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><label className="text-xs text-gray-500">{label}</label>{children}</div>;
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

            <Section title="Identifiers">
              <KV k="Internal ref" mono>{row.internalRef ?? "—"}</KV>
              <KV k="Business order" mono>{row.businessOrderId ?? "—"}</KV>
              <KV k="Razorpay order" mono>{row.razorpayOrderId ?? "—"}</KV>
              <KV k="Razorpay payment" mono>{row.razorpayPaymentId ?? "—"}</KV>
              <KV k="Entity" mono>{row.entityType} #{row.entityId ?? "—"}</KV>
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
