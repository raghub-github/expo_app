"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Play, Copy, Shield, Plus, FileBarChart, CheckCircle, Pencil, Archive } from "lucide-react";
import { readApiJson } from "@/lib/payment/read-api-json";
import {
  resolveGmRuleEngineInitial,
  writeGmRuleEngineCache,
  type GmRuleEngineCachedCatalogs,
} from "@/components/rules/gm-rule-engine-cache";

type Catalogs = GmRuleEngineCachedCatalogs;

export type GmRuleEngineInitialPayload = {
  migrationRequired: boolean;
  rows: Record<string, unknown>[];
  catalogs: Catalogs | null;
  loadError: string | null;
};

function initialMessage(payload: GmRuleEngineInitialPayload): { type: "ok" | "err"; text: string } | null {
  if (payload.loadError) return { type: "err", text: payload.loadError };
  if (payload.migrationRequired) {
    return { type: "err", text: "Run migration 0246 on Supabase SQL editor." };
  }
  return null;
}

export function GmRuleEngineClient({ initialPayload }: { initialPayload: GmRuleEngineInitialPayload }) {
  const hydrated = useMemo(() => resolveGmRuleEngineInitial(initialPayload), [initialPayload]);

  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(hydrated.rows.length === 0);
  const [migrationRequired, setMigrationRequired] = useState(hydrated.migrationRequired);
  const [rows, setRows] = useState<Record<string, unknown>[]>(hydrated.rows);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(hydrated.catalogs);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(() =>
    initialMessage(hydrated)
  );
  const [simResult, setSimResult] = useState<Record<string, unknown> | null>(null);
  const [simulating, setSimulating] = useState(false);

  const [tab, setTab] = useState<"rules" | "simulator" | "approvals" | "reports">("rules");
  const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);

  const loadApprovals = useCallback(async () => {
    const res = await fetch("/api/super-admin/gm-rules/approvals", { cache: "no-store" });
    const data = await readApiJson(res);
    if (res.ok && data.success) setApprovals((data.rows as Record<string, unknown>[]) ?? []);
  }, []);

  const loadReports = useCallback(async () => {
    const res = await fetch("/api/super-admin/gm-rules/reports", { cache: "no-store" });
    const data = await readApiJson(res);
    if (res.ok && data.success) setReports((data.rows as Record<string, unknown>[]) ?? []);
  }, []);

  const [sim, setSim] = useState({
    scenario_type: "CANCELLATION",
    service_type: "FOOD",
    order_stage: "PRE_PICKUP_CANCELLED",
    triggered_by: "MERCHANT",
    order_gross: 500,
  });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setRefreshing(true);
    if (!silent && rows.length === 0) setInitialLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/super-admin/gm-rules", { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        if (!silent || rows.length === 0) {
          setMsg({ type: "err", text: String(data.error ?? "Load failed") });
        }
        return;
      }
      setMigrationRequired(Boolean(data.migrationRequired));
      const nextRows = (data.rows as Record<string, unknown>[]) ?? [];
      const nextCatalogs = (data.catalogs as Catalogs) ?? null;
      setRows(nextRows);
      setCatalogs(nextCatalogs);
      if (!data.migrationRequired) {
        writeGmRuleEngineCache(nextRows, nextCatalogs);
      }
      if (data.migrationRequired) {
        setMsg({
          type: "err",
          text: String(data.message ?? "Run migration 0246 on Supabase SQL editor."),
        });
      }
    } catch (e) {
      if (!silent || rows.length === 0) {
        setMsg({ type: "err", text: e instanceof Error ? e.message : "Load failed" });
      }
    } finally {
      setInitialLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [rows.length]);

  useEffect(() => {
    void load({ silent: hydrated.rows.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + stale-while-revalidate only
  }, []);

  const runSimulation = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/super-admin/gm-rules/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sim),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: String(data.error ?? "Simulation failed") });
        return;
      }
      setSimResult((data.result as Record<string, unknown>) ?? null);
      setMsg({ type: "ok", text: "Simulation complete" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Simulation failed" });
    } finally {
      setSimulating(false);
    }
  };

  const bulkAction = async (action: "enable" | "disable" | "archive", ids: number[]) => {
    const res = await fetch("/api/super-admin/gm-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    const data = await readApiJson(res);
    if (res.ok && data.success) {
      setRows((data.rows as Record<string, unknown>[]) ?? []);
      setMsg({ type: "ok", text: `Bulk ${action} applied` });
    } else {
      setMsg({ type: "err", text: String(data.error ?? "Bulk action failed") });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Shield className="h-7 w-7 text-indigo-600" />
            Financial Rule Engine
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Centralized cancellation, refund, penalty & settlement rules. Catalogs load dynamically from DB enums.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {migrationRequired && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Apply <code className="font-mono">backend/drizzle/0246_gm_financial_rule_engine.sql</code> on Supabase
          (after 0239 payment engine). Legacy rules auto-migrate from{" "}
          <code className="font-mono">payment_cancellation_rules</code>.
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(["rules", "simulator", "approvals", "reports"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              if (t === "approvals") void loadApprovals();
              if (t === "reports") void loadReports();
            }}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              tab === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
        <Link
          href="/dashboard/super-admin/rule-engine/new"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" /> New rule
        </Link>
      </div>

      {tab === "simulator" && (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Rule simulator</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            Scenario
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={sim.scenario_type}
              onChange={(e) => setSim((s) => ({ ...s, scenario_type: e.target.value }))}
            >
              {(catalogs?.scenarioTypes ?? ["CANCELLATION"]).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Service type
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={sim.service_type}
              onChange={(e) => setSim((s) => ({ ...s, service_type: e.target.value }))}
            >
              {(catalogs?.serviceTypes ?? [{ code: "FOOD", label: "Food" }]).map((v) => (
                <option key={v.code} value={v.code}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Order stage
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={sim.order_stage}
              onChange={(e) => setSim((s) => ({ ...s, order_stage: e.target.value }))}
            >
              {(catalogs?.orderStages ?? []).map((v) => (
                <option key={v.code} value={v.code}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Triggered by
            <select
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={sim.triggered_by}
              onChange={(e) => setSim((s) => ({ ...s, triggered_by: e.target.value }))}
            >
              {(catalogs?.triggeredBy ?? []).map((v) => (
                <option key={v.code} value={v.code}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Order gross (₹)
            <input
              type="number"
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={sim.order_gross}
              onChange={(e) => setSim((s) => ({ ...s, order_gross: Number(e.target.value) }))}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={simulating || migrationRequired}
          onClick={() => void runSimulation()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Simulate
        </button>
        {simResult && (
          <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(simResult, null, 2)}
          </pre>
        )}
      </section>
      )}

      {tab === "rules" && (
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-medium">Active rules ({rows.length})</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() =>
                void bulkAction(
                  "enable",
                  rows.map((r) => Number(r.id)).filter(Boolean)
                )
              }
            >
              Bulk enable
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() =>
                void bulkAction(
                  "disable",
                  rows.map((r) => Number(r.id)).filter(Boolean)
                )
              }
            >
              Bulk disable
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Scenario</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">By</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {initialLoading && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-slate-200/80" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No rules yet. Create your first rule to get started.
                  </td>
                </tr>
              ) : (
              rows.map((r) => (
                <tr key={String(r.id)} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{String(r.rule_code)}</td>
                  <td className="px-4 py-2">{String(r.scenario_type)}</td>
                  <td className="px-4 py-2">{String(r.order_stage ?? "—")}</td>
                  <td className="px-4 py-2">{String(r.triggered_by ?? "—")}</td>
                  <td className="px-4 py-2">{String(r.priority)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        r.active_status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {String(r.active_status)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                    <Link
                      href={`/dashboard/super-admin/rule-engine/${r.id}/edit`}
                      title="Edit"
                      className="text-slate-600 hover:text-indigo-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      title="Clone"
                      className="text-indigo-600"
                      onClick={async () => {
                        const code = `${String(r.rule_code)}_COPY_${Date.now()}`;
                        const res = await fetch(`/api/super-admin/gm-rules/${r.id}?action=clone`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ new_rule_code: code }),
                        });
                        const data = await readApiJson(res);
                        if (res.ok && data.success) void load();
                        else setMsg({ type: "err", text: String(data.error ?? "Clone failed") });
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={r.active_status === "ACTIVE" ? "Deactivate" : "Activate"}
                      className="text-emerald-600"
                      onClick={async () => {
                        const next = r.active_status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                        const res = await fetch(`/api/super-admin/gm-rules/${r.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ active_status: next, change_reason: `Set ${next}` }),
                        });
                        const data = await readApiJson(res);
                        if (res.ok && data.success) void load();
                        else setMsg({ type: "err", text: String(data.error ?? "Status update failed") });
                      }}
                    >
                      {r.active_status === "ACTIVE" ? "Off" : "On"}
                    </button>
                    <button
                      type="button"
                      title="Archive"
                      className="text-amber-700"
                      onClick={async () => {
                        const res = await fetch(`/api/super-admin/gm-rules/${r.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ active_status: "ARCHIVED", change_reason: "Archived" }),
                        });
                        const data = await readApiJson(res);
                        if (res.ok && data.success) void load();
                        else setMsg({ type: "err", text: String(data.error ?? "Archive failed") });
                      }}
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {tab === "approvals" && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-medium"><CheckCircle className="h-5 w-5" /> Pending approvals ({approvals.length})</h2>
          <ul className="space-y-2 text-sm">
            {approvals.map((a) => (
              <li key={String(a.id)} className="flex items-center justify-between rounded border p-3">
                <span>{String(a.rule_code)} — ₹{String(a.amount)} — order {String(a.core_order_id ?? a.order_id)}</span>
                <button type="button" className="rounded bg-emerald-600 px-2 py-1 text-xs text-white" onClick={async () => {
                  await fetch("/api/super-admin/gm-rules/approvals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalId: a.id, action: "approve" }) });
                  void loadApprovals();
                }}>Approve</button>
              </li>
            ))}
            {approvals.length === 0 && <li className="text-slate-500">No pending approvals.</li>}
          </ul>
        </section>
      )}

      {tab === "reports" && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-medium"><FileBarChart className="h-5 w-5" /> Execution report</h2>
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="p-2">Time</th><th className="p-2">Rule</th><th className="p-2">Order</th><th className="p-2">Refund</th><th className="p-2">Status</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={String(r.id)} className="border-t">
                    <td className="p-2">{String(r.executed_at ?? "").slice(0, 19)}</td>
                    <td className="p-2 font-mono">{String(r.rule_code)}</td>
                    <td className="p-2">{String(r.core_order_id ?? r.order_id)}</td>
                    <td className="p-2">₹{String(r.applied_refund)}</td>
                    <td className="p-2">{String(r.execution_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Legacy <code>payment_cancellation_rules</code> tab is deprecated — manage all rules here.
      </p>
    </div>
  );
}
