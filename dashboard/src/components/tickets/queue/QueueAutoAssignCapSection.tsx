"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { usePermission } from "@/hooks/usePermission";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/**
 * Max concurrent open tickets per agent (queue auto-assign + round-robin).
 * PUT allowed for any ticket-dashboard user (same as notification automation PATCH).
 */
export function QueueAutoAssignCapSection({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { isSuperAdmin, hasDashboardAccess, loading: permLoading } = usePermission();
  const canUse = isSuperAdmin || hasDashboardAccess("TICKET");

  const [value, setValue] = useState(6);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", { credentials: "include" });
      const json = (await res.json()) as { success?: boolean; data?: { maxOpenTicketsPerAgent?: number }; error?: string };
      if (!res.ok || !json.success) {
        setLoadError(json.error ?? `Could not load (${res.status})`);
        return;
      }
      const n = Number(json.data?.maxOpenTicketsPerAgent);
      if (Number.isFinite(n) && n >= 1) setValue(Math.min(500, n));
    } catch {
      setLoadError("Network error while loading settings.");
    } finally {
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (permLoading || !canUse) return;
    setDataLoaded(false);
    void load();
  }, [permLoading, canUse, load]);

  const save = async () => {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      toast("Enter a number between 1 and 500", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ maxOpenTicketsPerAgent: n }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { maxOpenTicketsPerAgent?: number } };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      if (json.data?.maxOpenTicketsPerAgent != null && Number.isFinite(Number(json.data.maxOpenTicketsPerAgent))) {
        setValue(Number(json.data.maxOpenTicketsPerAgent));
      }
      toast("Assignment cap saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (permLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!canUse) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        You do not have access to ticket queue settings.
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      {!embedded ? (
        <>
          <h2 className="text-base font-semibold text-gray-900">Max open tickets per agent</h2>
          <p className="mt-1 text-sm text-gray-600">
            Limits how many non-closed tickets an agent can hold while queue auto-assign and round-robin run. Higher priority
            tickets are assigned first.
          </p>
        </>
      ) : null}
      {loadError ? (
        <p className="mt-3 text-sm text-red-600">
          {loadError}{" "}
          <button type="button" onClick={() => void load()} className="font-medium text-red-700 underline">
            Retry
          </button>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5 text-sm text-gray-700">
          <span className="font-medium text-gray-800">Concurrent open tickets</span>
          <input
            type="number"
            min={1}
            max={500}
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setValue(1);
                return;
              }
              const num = Number(v);
              if (Number.isFinite(num)) setValue(Math.max(1, Math.min(500, num)));
            }}
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-500">Queue auto-assign and round-robin respect this cap (1–500).</span>
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !!loadError}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save cap"}
        </button>
      </div>
    </div>
  );
}
