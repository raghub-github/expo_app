"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Copy, Plus, Pencil, Archive } from "lucide-react";
import { readApiJson } from "@/lib/payment/read-api-json";
import { useToast } from "@/context/ToastContext";
import {
  readGmRuleEngineCacheSnapshot,
  resolveGmRuleEngineInitial,
  writeGmRuleEngineCache,
  type GmRuleEngineCachedCatalogs,
} from "@/components/rules/gm-rule-engine-cache";
import {
  PenaltyPartyToggle,
  RiderCancellationPenaltyPanel,
} from "@/components/rules/RiderCancellationPenaltyPanel";
import { re } from "@/components/rules/gm-rule-engine-ui";
import type { PenaltyPartyCode } from "@/lib/rider-cancellation-penalty-engine.types";

type Catalogs = GmRuleEngineCachedCatalogs;

export type GmRuleEngineInitialPayload = {
  migrationRequired: boolean;
  rows: Record<string, unknown>[];
  catalogs: Catalogs | null;
  loadError: string | null;
};

function initialMessage(payload: GmRuleEngineInitialPayload): string | null {
  if (payload.loadError) return payload.loadError;
  if (payload.migrationRequired) {
    return "Run migration 0246 on Supabase SQL editor.";
  }
  return null;
}

export function GmRuleEngineClient({ initialPayload }: { initialPayload: GmRuleEngineInitialPayload }) {
  const { toast } = useToast();
  const hydrated = useMemo(() => resolveGmRuleEngineInitial(initialPayload), [initialPayload]);

  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(hydrated.rows.length === 0);
  const [migrationRequired, setMigrationRequired] = useState(hydrated.migrationRequired);
  const [rows, setRows] = useState<Record<string, unknown>[]>(hydrated.rows);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(hydrated.catalogs);

  const [tab, setTab] = useState<"rules" | "penalties">("penalties");
  const [penaltyParty, setPenaltyParty] = useState<PenaltyPartyCode>("RIDER");
  const [penaltyRefreshKey, setPenaltyRefreshKey] = useState(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setRefreshing(true);
    if (!silent && rows.length === 0) setInitialLoading(true);
    try {
      const res = await fetch("/api/super-admin/gm-rules", { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        if (!silent || rows.length === 0) {
          toast(String(data.error ?? "Load failed"), "error");
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
        toast(String(data.message ?? "Run migration 0246 on Supabase SQL editor."), "error");
      }
    } catch (e) {
      if (!silent || rows.length === 0) {
        toast(e instanceof Error ? e.message : "Load failed", "error");
      }
    } finally {
      setInitialLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [rows.length, toast]);

  useEffect(() => {
    const bootMsg = initialMessage(hydrated);
    if (bootMsg) toast(bootMsg, "error");
  }, [hydrated, toast]);

  useEffect(() => {
    const cached = readGmRuleEngineCacheSnapshot();
    let hasCachedRows = hydrated.rows.length > 0;
    if (!hasCachedRows && cached?.rows.length) {
      setRows(cached.rows);
      if (cached.catalogs) setCatalogs(cached.catalogs);
      hasCachedRows = true;
    }
    if (tab !== "rules") return;
    void load({ silent: hasCachedRows });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rules tab + mount cache only
  }, [tab]);

  const handleRefresh = () => {
    if (tab === "penalties") {
      setPenaltyRefreshKey((k) => k + 1);
      return;
    }
    void load();
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
      toast(`Bulk ${action} applied`);
    } else {
      toast(String(data.error ?? "Bulk action failed"), "error");
    }
  };

  return (
    <div
      className="w-full min-w-0 -m-4 space-y-5 p-4 sm:-m-6 sm:p-6"
      style={{ backgroundColor: re.pageBg, minHeight: "calc(100vh - 4rem)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
          role="tablist"
          aria-label="Rule engine section"
        >
          {(["rules", "penalties"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-[#5D3FD3] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PenaltyPartyToggle
            party={penaltyParty}
            onChange={(p) => {
              setPenaltyParty(p);
              setTab("penalties");
            }}
          />
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={re.btnGhost}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {migrationRequired && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Apply <code className="font-mono">backend/drizzle/0246_gm_financial_rule_engine.sql</code> on Supabase
          (after 0239 payment engine). Legacy rules auto-migrate from{" "}
          <code className="font-mono">payment_cancellation_rules</code>.
        </div>
      )}

      {tab === "rules" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/dashboard/super-admin/rule-engine/new"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> New rule
          </Link>
        </div>
      ) : null}

      {tab === "penalties" && (
        <RiderCancellationPenaltyPanel
          party={penaltyParty}
          onPartyChange={setPenaltyParty}
          refreshKey={penaltyRefreshKey}
        />
      )}

      {tab === "rules" && (
      <section className={re.card}>
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
                        else toast(String(data.error ?? "Clone failed"), "error");
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
                        else toast(String(data.error ?? "Status update failed"), "error");
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
                        else toast(String(data.error ?? "Archive failed"), "error");
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

    </div>
  );
}
