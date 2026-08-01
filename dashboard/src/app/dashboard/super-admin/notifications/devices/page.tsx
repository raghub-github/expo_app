"use client";

import { useState } from "react";
import { Search, Smartphone, Monitor, AlertCircle } from "lucide-react";

type DeviceRow = {
  id: number;
  user_id: string;
  role: string | null;
  device_type: string | null;
  expo_push_token: string;
  created_at: string;
  updated_at: string | null;
};

const ROLE_COLORS: Record<string, string> = {
  customer: "bg-indigo-50 text-indigo-700 border-indigo-200",
  merchant: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rider: "bg-amber-50 text-amber-700 border-amber-200",
  admin: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function DevicesPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DeviceRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>("");

  const doSearch = async () => {
    const uid = query.trim();
    if (!uid) return;
    setLoading(true);
    setError(null);
    setLastQuery(uid);
    try {
      const res = await fetch(
        `/api/super-admin/notifications/devices?user_id=${encodeURIComponent(uid)}`,
        { cache: "no-store" },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setItems(j.items ?? []);
    } catch (e) {
      setError((e as Error).message);
      setItems(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-500">
            Look up the registered push tokens for one user across all three apps.
            Enter a <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">user_id</code>{" "}
            — usually <b>GMC-…</b> for customers, <b>GMM-…</b> for merchants, or <b>GMR-…</b> for riders —
            and hit <b>Search</b>.
          </p>
        </div>

        {/* Search */}
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              placeholder="Enter a user_id, e.g. GMC-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" ? void doSearch() : undefined}
            />
          </div>
          <button
            onClick={doSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div>{error}</div>
          </div>
        ) : null}

        {/* Results */}
        {items ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="mb-2 shrink-0 text-xs text-slate-500">
              <b>{items.length}</b> device{items.length === 1 ? "" : "s"} for{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5">{lastQuery}</code>
            </div>
            {items.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100">
                  <Smartphone className="h-5 w-5 text-slate-400" />
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  No registered devices for this user.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  The user needs to be logged in on the app for a token to be registered.
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Platform</th>
                      <th className="px-4 py-3">Token</th>
                      <th className="px-4 py-3">Registered</th>
                      <th className="px-4 py-3">Last update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((d) => {
                      const platform = (d.device_type ?? "?").toLowerCase();
                      const Icon = platform === "web" ? Monitor : Smartphone;
                      const stale = d.updated_at
                        ? Date.now() - new Date(d.updated_at).getTime() > 30 * 24 * 60 * 60 * 1000
                        : false;
                      return (
                        <tr key={d.id} className="transition hover:bg-teal-50/40">
                          <td className="px-4 py-3">
                            <span className={"inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium " + (ROLE_COLORS[d.role ?? ""] ?? "bg-slate-100 text-slate-700 border-slate-200")}>
                              {d.role ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              <Icon className="h-3.5 w-3.5 text-slate-400" />
                              {d.device_type ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                            {d.expo_push_token.slice(0, 20)}…{d.expo_push_token.slice(-8)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {new Date(d.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {d.updated_at ? (
                              <span className={stale ? "text-rose-600" : "text-slate-600"}>
                                {new Date(d.updated_at).toLocaleString()}
                                {stale ? <span className="ml-1 rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-700">stale</span> : null}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100">
              <Smartphone className="h-5 w-5 text-slate-500" />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Enter a <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">user_id</code> above
              to see all their registered devices.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              One user can have several devices — a customer app on their phone, a merchant app on
              their store tablet, and so on.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
