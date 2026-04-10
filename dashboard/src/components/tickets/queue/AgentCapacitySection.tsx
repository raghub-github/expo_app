"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { usePermission } from "@/hooks/usePermission";

type AgentRow = {
  userId: number;
  name: string;
  email: string;
  openCount: number;
  globalCap: number;
  maxOpenTicketsOverride: number | null;
  effectiveCap: number;
  atCapacity: boolean;
  isOnline: boolean;
  currentStatus: string | null;
};

export function AgentCapacitySection({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { isSuperAdmin, hasDashboardAccess, loading: permLoading } = usePermission();
  const canUse = isSuperAdmin || hasDashboardAccess("TICKET");
  const [globalCap, setGlobalCap] = useState(6);
  const [globalDraft, setGlobalDraft] = useState("6");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/tickets/agents/capacity", { credentials: "include" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { globalCap?: number; agents?: AgentRow[] };
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? `Could not load (${res.status})`);
        setAgents([]);
        return;
      }
      const gc = Number(json.data?.globalCap) || 6;
      setGlobalCap(gc);
      setGlobalDraft(String(gc));
      const list = json.data?.agents ?? [];
      setAgents(list);
      const d: Record<number, string> = {};
      for (const a of list) {
        d[a.userId] = a.maxOpenTicketsOverride != null ? String(a.maxOpenTicketsOverride) : "";
      }
      setDrafts(d);
    } catch {
      setError("Network error");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !canUse) return;
    void load();
  }, [load, permLoading, canUse]);

  const saveGlobalCap = async () => {
    const n = parseInt(globalDraft, 10);
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      toast("Global max must be between 1 and 500", "error");
      return;
    }
    setSavingGlobal(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ maxOpenTicketsPerAgent: n }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Save failed");
      toast("Global limit saved — auto-assignment uses it on the next eligibility check.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveOverride = async (userId: number) => {
    const raw = drafts[userId]?.trim() ?? "";
    const body =
      raw === ""
        ? { userId, maxOpenTicketsOverride: null }
        : { userId, maxOpenTicketsOverride: parseInt(raw, 10) };

    if (raw !== "" && (!Number.isFinite(body.maxOpenTicketsOverride as number) || (body.maxOpenTicketsOverride as number) < 1)) {
      toast("Override must be 1–500 or empty for global default", "error");
      return;
    }

    setSavingId(userId);
    try {
      const res = await fetch("/api/tickets/agents/capacity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Save failed");
      toast("Capacity updated", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSavingId(null);
    }
  };

  if (permLoading) return null;
  if (!canUse) {
    return <p className="text-sm text-amber-800">You do not have access to agent capacity settings.</p>;
  }

  return (
    <div className="w-full">
      {embedded ? (
        <header className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">Agent assignment capacity</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Global default is the max open tickets from{" "}
            <strong className="font-medium text-gray-800">Queue settings</strong>. Set a personal override to cap an
            agent lower; effective limit is the lower of global and override. Auto-assignment skips agents who are full.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-4">
            <label className="text-sm">
              <span className="font-medium text-gray-900">Global max open tickets per agent</span>
              <input
                type="number"
                min={1}
                max={500}
                value={globalDraft}
                onChange={(e) => setGlobalDraft(e.target.value)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
              />
            </label>
            <button
              type="button"
              disabled={
                savingGlobal ||
                !Number.isFinite(parseInt(globalDraft, 10)) ||
                Math.floor(parseInt(globalDraft, 10)) === globalCap
              }
              onClick={() => void saveGlobalCap()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingGlobal ? "Saving…" : "Save global limit"}
            </button>
            <p className="min-w-[12rem] text-xs text-gray-600">
              Lower personal overrides (below) cannot exceed this ceiling. Changes apply immediately for new assignments.
            </p>
          </div>
        </header>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}{" "}
          <button type="button" className="font-medium underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500">Loading agents…</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-gray-600">No agents with queue group mappings found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Presence</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Active / max allowed</th>
                <th className="px-4 py-3">Personal max (optional)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agents.map((a) => (
                <tr key={a.userId} className={a.atCapacity ? "bg-amber-50/50" : ""}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{a.name}</div>
                    <div className="text-xs text-gray-500">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {a.isOnline && String(a.currentStatus ?? "").toLowerCase() === "online" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">Online</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium capitalize text-gray-700">
                        {a.currentStatus ?? "offline"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.atCapacity ? (
                      <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-950">
                        At capacity
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="tabular-nums font-medium text-gray-900">
                      {a.openCount} / {a.effectiveCap}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-gray-500">Global cap {a.globalCap}</span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      placeholder={`≤ ${globalCap} (empty = global)`}
                      value={drafts[a.userId] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [a.userId]: e.target.value }))}
                      className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={savingId === a.userId}
                      onClick={() => void saveOverride(a.userId)}
                      className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingId === a.userId ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
