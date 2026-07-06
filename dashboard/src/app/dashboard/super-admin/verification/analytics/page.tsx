"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { BarChart3, ShieldCheck, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

type Totals = {
  total: number;
  verified: number;
  rejected: number;
  pending: number;
  fallback_manual: number;
  timeout: number;
  provider_down: number;
  avg_duration_ms: number | null;
  avg_confidence: number | null;
};
type BreakdownRow = {
  document_kind: string;
  subject_type: string;
  total: number;
  verified: number;
  rejected: number;
  fallback_manual: number;
  success_rate: number;
};
type DailyRow = {
  day: string;
  total: number;
  verified: number;
  rejected: number;
  fallback_manual: number;
};

const DOC_KINDS = [
  "pan", "aadhaar_digilocker", "driving_licence", "vehicle_rc", "passport",
  "ifsc", "bank_account", "reverse_penny_drop", "upi_penny_drop", "gstin",
  "cin", "face_liveness", "face_match", "name_match", "pan_360",
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatCard({
  Icon, label, value, tone, hint,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; tone: "slate" | "emerald" | "rose" | "amber" | "indigo" | "sky"; hint?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
    sky: "bg-sky-50 text-sky-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={"inline-grid h-9 w-9 place-items-center rounded-lg " + tones[tone]}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

/** Tiny inline sparkline — SVG, no chart library needed. */
function Sparkline({ points, color = "#059669" }: { points: number[]; color?: string }) {
  if (points.length === 0) return null;
  const max = Math.max(1, ...points);
  const w = 120;
  const h = 32;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function VerificationAnalyticsPage() {
  const [subjectType, setSubjectType] = useState<"rider" | "merchant_store" | "">("");
  const [documentKind, setDocumentKind] = useState<string>("");
  const [provider, setProvider] = useState<"cashfree" | "razorpay" | "">("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (subjectType) p.set("subjectType", subjectType);
    if (documentKind) p.set("documentKind", documentKind);
    if (provider) p.set("provider", provider);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [subjectType, documentKind, provider, from, to]);

  const { data, isLoading } = useSWR<{ totals: Totals; breakdown: BreakdownRow[]; daily: DailyRow[] }>(
    `/api/super-admin/verification/analytics${qs ? `?${qs}` : ""}`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const t = data?.totals;
  const successRate = t && t.total > 0 ? ((t.verified / t.total) * 100).toFixed(1) + "%" : "—";
  const dailyTotals = data?.daily?.map((d) => d.total) ?? [];
  const dailyVerified = data?.daily?.map((d) => d.verified) ?? [];

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700">
        <BarChart3 className="h-3.5 w-3.5" /> Verification analytics
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Report</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Cashfree + manual verification counts across riders and merchants. Use the filters to
        drill into a subject, doc kind, or provider. Each row of the breakdown table is one
        (subject, doc) pair — click through to Policy Center to flip its mode.
      </p>

      {/* Filter bar */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Subject</label>
            <select
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value as "rider" | "merchant_store" | "")}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="rider">Rider</option>
              <option value="merchant_store">Merchant</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Document</label>
            <select
              value={documentKind}
              onChange={(e) => setDocumentKind(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "cashfree" | "razorpay" | "")}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="cashfree">Cashfree</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Totals row */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard Icon={ShieldCheck} tone="slate" label="Total requests" value={isLoading ? "…" : (t?.total ?? 0).toLocaleString()}
          hint={`Success ${successRate}`} />
        <StatCard Icon={CheckCircle2} tone="emerald" label="Verified" value={isLoading ? "…" : (t?.verified ?? 0).toLocaleString()} />
        <StatCard Icon={XCircle} tone="rose" label="Rejected" value={isLoading ? "…" : (t?.rejected ?? 0).toLocaleString()} />
        <StatCard Icon={Clock} tone="amber" label="Pending" value={isLoading ? "…" : (t?.pending ?? 0).toLocaleString()} />
        <StatCard Icon={AlertTriangle} tone="indigo" label="Fell back to manual"
          value={isLoading ? "…" : (t?.fallback_manual ?? 0).toLocaleString()} hint="Cashfree failed → agent" />
        <StatCard Icon={AlertTriangle} tone="sky" label="Provider issues"
          value={isLoading ? "…" : ((t?.timeout ?? 0) + (t?.provider_down ?? 0)).toLocaleString()}
          hint={`timeout ${t?.timeout ?? 0} · down ${t?.provider_down ?? 0}`} />
      </div>

      {/* 14-day sparkline */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Last 14 days</h2>
          <div className="text-xs text-slate-500">Sparkline of daily totals (all activity) and verified count.</div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Total requests</div>
            <Sparkline points={dailyTotals} color="#0f766e" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Verified</div>
            <Sparkline points={dailyVerified} color="#059669" />
          </div>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Per-document breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Document</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Verified</th>
                <th className="px-4 py-2 text-right">Rejected</th>
                <th className="px-4 py-2 text-right">→ Manual</th>
                <th className="px-4 py-2 text-right">Success</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.breakdown ?? []).map((r, i) => (
                <tr key={`${r.subject_type}-${r.document_kind}-${i}`}>
                  <td className="px-4 py-2 text-slate-700">{r.subject_type}</td>
                  <td className="px-4 py-2 font-mono text-slate-800">{r.document_kind}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.total.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{r.verified.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-700">{r.rejected.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-700">{r.fallback_manual.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{r.success_rate.toFixed(1)}%</td>
                </tr>
              ))}
              {!isLoading && (data?.breakdown ?? []).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">No verification requests match these filters yet.</td></tr>
              ) : null}
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">Loading…</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Latency avg: <span className="tabular-nums text-slate-700">{t?.avg_duration_ms?.toLocaleString() ?? "—"} ms</span>
        {" · "}avg confidence: <span className="tabular-nums text-slate-700">{t?.avg_confidence?.toFixed(3) ?? "—"}</span>
      </div>
    </div>
  );
}
