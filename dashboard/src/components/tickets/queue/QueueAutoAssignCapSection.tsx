"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { usePermission } from "@/hooks/usePermission";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";

const CYCLE_MIN = 1;
const CYCLE_MAX = 50;

const PRIMARY_UPDATE_BTN_CLASS =
  "rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

function clampCycle(n: number): number {
  return Math.min(CYCLE_MAX, Math.max(CYCLE_MIN, Math.floor(n)));
}

type SettingsResponseData = {
  maxOpenTicketsPerAgent?: number;
  primaryPerCycle?: number;
  secondaryPerCycle?: number;
  distributionAvailable?: boolean;
  releaseAssignmentsWhenAgentOffline?: boolean;
  offlineReleaseMaxTickets?: number;
  offlineReleaseSettingsAvailable?: boolean;
  defaultRoutingGroupId?: number | null;
  defaultRoutingGroupAvailable?: boolean;
};

function applySettingsJson(
  json: { data?: SettingsResponseData },
  setters: {
    setValue: (n: number) => void;
    setPrimaryCycle: (n: number) => void;
    setSecondaryCycle: (n: number) => void;
    setDistributionMissing: (v: boolean) => void;
    setReleaseOffline?: (v: boolean) => void;
    setOfflineMax?: (n: number) => void;
    setOfflineSettingsMissing?: (v: boolean) => void;
  }
) {
  const d = json.data;
  if (d?.maxOpenTicketsPerAgent != null && Number.isFinite(Number(d.maxOpenTicketsPerAgent))) {
    setters.setValue(Number(d.maxOpenTicketsPerAgent));
  }
  if (d?.primaryPerCycle != null && Number.isFinite(Number(d.primaryPerCycle))) {
    setters.setPrimaryCycle(Number(d.primaryPerCycle));
  }
  if (d?.secondaryPerCycle != null && Number.isFinite(Number(d.secondaryPerCycle))) {
    setters.setSecondaryCycle(Number(d.secondaryPerCycle));
  }
  if (d?.distributionAvailable === false) setters.setDistributionMissing(true);
  else if (d?.distributionAvailable === true) setters.setDistributionMissing(false);

  if (setters.setReleaseOffline && d?.releaseAssignmentsWhenAgentOffline !== undefined) {
    setters.setReleaseOffline(Boolean(d.releaseAssignmentsWhenAgentOffline));
  }
  if (
    setters.setOfflineMax &&
    d?.offlineReleaseMaxTickets != null &&
    Number.isFinite(Number(d.offlineReleaseMaxTickets))
  ) {
    setters.setOfflineMax(Number(d.offlineReleaseMaxTickets));
  }
  if (setters.setOfflineSettingsMissing) {
    if (d?.offlineReleaseSettingsAvailable === false) setters.setOfflineSettingsMissing(true);
    else if (d?.offlineReleaseSettingsAvailable === true) setters.setOfflineSettingsMissing(false);
  }
}

/**
 * Max concurrent open tickets per agent (queue auto-assign + round-robin).
 * PUT allowed for any ticket-dashboard user (same as notification automation PATCH).
 */
export function QueueAutoAssignCapSection({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const { isSuperAdmin, hasDashboardAccess, loading: permLoading } = usePermission();
  const canUse = isSuperAdmin || hasDashboardAccess("TICKET");
  const accessReady = !permLoading;
  const { data: refData } = useTicketsReferenceDataQuery();

  const [value, setValue] = useState(6);
  const [primaryCycle, setPrimaryCycle] = useState(2);
  const [secondaryCycle, setSecondaryCycle] = useState(1);
  const [baselineCap, setBaselineCap] = useState<number | null>(null);
  const [baselinePrimary, setBaselinePrimary] = useState<number | null>(null);
  const [baselineSecondary, setBaselineSecondary] = useState<number | null>(null);
  const [settingsFetching, setSettingsFetching] = useState(true);
  const [savingCap, setSavingCap] = useState(false);
  const [savingDistribution, setSavingDistribution] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [distributionMissing, setDistributionMissing] = useState(false);
  const [releaseOffline, setReleaseOffline] = useState(true);
  const [offlineMax, setOfflineMax] = useState(200);
  const [baselineRelease, setBaselineRelease] = useState<boolean | null>(null);
  const [baselineOfflineMax, setBaselineOfflineMax] = useState<number | null>(null);
  const [offlineSettingsMissing, setOfflineSettingsMissing] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [processingJobs, setProcessingJobs] = useState(false);
  const [defaultRoutingGroupId, setDefaultRoutingGroupId] = useState<string>("");
  const [baselineDefaultGroup, setBaselineDefaultGroup] = useState<string>("");
  const [defaultGroupSettingsAvailable, setDefaultGroupSettingsAvailable] = useState(false);
  const [savingDefaultGroup, setSavingDefaultGroup] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setSettingsFetching(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", { credentials: "include" });
      const json = (await res.json()) as {
        success?: boolean;
        data?: SettingsResponseData;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setLoadError(json.error ?? `Could not load (${res.status})`);
        return;
      }
      const n = Number(json.data?.maxOpenTicketsPerAgent);
      const cap = Number.isFinite(n) && n >= 1 ? Math.min(500, n) : 6;
      setValue(cap);
      setBaselineCap(cap);
      const pc = Number(json.data?.primaryPerCycle);
      const sc = Number(json.data?.secondaryPerCycle);
      const p = Number.isFinite(pc) && pc >= CYCLE_MIN && pc <= CYCLE_MAX ? pc : 2;
      const s = Number.isFinite(sc) && sc >= CYCLE_MIN && sc <= CYCLE_MAX ? sc : 1;
      setPrimaryCycle(p);
      setSecondaryCycle(s);
      setBaselinePrimary(p);
      setBaselineSecondary(s);
      setDistributionMissing(json.data?.distributionAvailable === false);

      const ro = json.data?.releaseAssignmentsWhenAgentOffline !== false;
      setReleaseOffline(ro);
      setBaselineRelease(ro);
      const om = Number(json.data?.offlineReleaseMaxTickets);
      const omax = Number.isFinite(om) && om >= 1 && om <= 500 ? Math.floor(om) : 200;
      setOfflineMax(omax);
      setBaselineOfflineMax(omax);
      setOfflineSettingsMissing(json.data?.offlineReleaseSettingsAvailable === false);

      const dg = json.data?.defaultRoutingGroupId;
      const dgStr =
        dg != null && Number.isFinite(Number(dg)) && Number(dg) > 0 ? String(Math.floor(Number(dg))) : "";
      setDefaultRoutingGroupId(dgStr);
      setBaselineDefaultGroup(dgStr);
      setDefaultGroupSettingsAvailable(json.data?.defaultRoutingGroupAvailable === true);
    } catch {
      setLoadError("Network error while loading settings.");
    } finally {
      setSettingsFetching(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mergeResponse = useCallback((json: { data?: SettingsResponseData }) => {
    applySettingsJson(json, {
      setValue,
      setPrimaryCycle,
      setSecondaryCycle,
      setDistributionMissing,
      setReleaseOffline,
      setOfflineMax,
      setOfflineSettingsMissing,
    });
  }, []);

  const capDirty =
    baselineCap !== null && Math.floor(Number(value)) !== baselineCap;
  const defaultGroupDirty = defaultRoutingGroupId !== baselineDefaultGroup;
  const distDirty =
    baselinePrimary !== null &&
    baselineSecondary !== null &&
    (primaryCycle !== baselinePrimary || secondaryCycle !== baselineSecondary);

  const offlineDirty =
    baselineRelease !== null &&
    baselineOfflineMax !== null &&
    (releaseOffline !== baselineRelease ||
      Math.floor(Number(offlineMax)) !== baselineOfflineMax);

  const saveOffline = async () => {
    const mx = Math.floor(Number(offlineMax));
    if (!Number.isFinite(mx) || mx < 1 || mx > 500) {
      toast("Offline batch size must be between 1 and 500", "error");
      return;
    }
    setSavingOffline(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          releaseAssignmentsWhenAgentOffline: releaseOffline,
          offlineReleaseMaxTickets: mx,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SettingsResponseData;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      mergeResponse(json);
      setBaselineRelease(json.data?.releaseAssignmentsWhenAgentOffline !== false);
      const savedM = Number(json.data?.offlineReleaseMaxTickets);
      setBaselineOfflineMax(
        Number.isFinite(savedM) && savedM >= 1 && savedM <= 500 ? savedM : mx
      );
      toast("Offline behavior updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSavingOffline(false);
    }
  };

  const saveDefaultRoutingGroup = async () => {
    setSavingDefaultGroup(true);
    try {
      const raw = defaultRoutingGroupId.trim();
      const payload =
        raw === ""
          ? { defaultRoutingGroupId: null }
          : { defaultRoutingGroupId: Math.floor(Number(raw)) };
      if (raw !== "" && !Number.isFinite(Number(raw))) {
        toast("Choose a valid queue or leave empty", "error");
        return;
      }
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SettingsResponseData;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      const dg = json.data?.defaultRoutingGroupId;
      const dgStr =
        dg != null && Number.isFinite(Number(dg)) && Number(dg) > 0 ? String(Math.floor(Number(dg))) : "";
      setDefaultRoutingGroupId(dgStr);
      setBaselineDefaultGroup(dgStr);
      toast("Default routing queue updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSavingDefaultGroup(false);
    }
  };

  const runProcessJobs = async () => {
    setProcessingJobs(true);
    try {
      const res = await fetch("/api/tickets/automation/process-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit: 30 }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { processed?: number; jobErrors?: string[] };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      const n = Number(json.data?.processed);
      const errs = json.data?.jobErrors?.length ? ` (${json.data?.jobErrors?.length} errors)` : "";
      toast(
        Number.isFinite(n)
          ? `Processed ${n} automation job(s)${errs}`
          : "Automation jobs processed",
        json.data?.jobErrors?.length ? "error" : "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not process jobs", "error");
    } finally {
      setProcessingJobs(false);
    }
  };

  const saveCap = async () => {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      toast("Enter a number between 1 and 500", "error");
      return;
    }
    setSavingCap(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ maxOpenTicketsPerAgent: n }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SettingsResponseData;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      mergeResponse(json);
      const saved = Number(json.data?.maxOpenTicketsPerAgent);
      setBaselineCap(Number.isFinite(saved) && saved >= 1 ? saved : n);
      toast("Max open updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSavingCap(false);
    }
  };

  const saveDistribution = async () => {
    const pc = clampCycle(Number(primaryCycle) || 2);
    const sc = clampCycle(Number(secondaryCycle) || 1);
    setSavingDistribution(true);
    try {
      const res = await fetch("/api/tickets/queue/auto-assign-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          primaryPerCycle: pc,
          secondaryPerCycle: sc,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SettingsResponseData;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      mergeResponse(json);
      const np = Number(json.data?.primaryPerCycle);
      const ns = Number(json.data?.secondaryPerCycle);
      setBaselinePrimary(Number.isFinite(np) && np >= CYCLE_MIN && np <= CYCLE_MAX ? np : pc);
      setBaselineSecondary(Number.isFinite(ns) && ns >= CYCLE_MIN && ns <= CYCLE_MAX ? ns : sc);
      toast("Auto assign count updated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSavingDistribution(false);
    }
  };

  const inputClass =
    "w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

  const fieldsLocked = !accessReady || (accessReady && !canUse);
  const saveLocked = permLoading || !canUse || !!loadError || settingsFetching;

  if (accessReady && !canUse) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        You do not have access to ticket queue settings.
      </div>
    );
  }

  return (
    <div className="w-full">
      {embedded ? (
        <header className="mb-6">
          <h2 className="text-base font-semibold text-gray-900">Queue settings</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Limits for auto-assignment, round-robin counts, and what happens when someone goes{" "}
            <strong className="font-medium text-gray-800">fully offline</strong>.{" "}
            <span className="text-gray-700">Break</span> and <span className="text-gray-700">busy</span> never unassign
            tickets.
          </p>
        </header>
      ) : null}

      {loadError ? (
        <p className="mt-3 text-sm text-red-600">
          {loadError}{" "}
          <button type="button" onClick={() => void load()} className="font-medium text-red-700 underline">
            Retry
          </button>
        </p>
      ) : null}

      {!defaultGroupSettingsAvailable ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Optional: apply{" "}
          <code className="font-mono">0177_ticket_routing_default_group_and_docs.sql</code> to enable a{" "}
          <strong className="font-medium">default queue</strong> when no automation rule sets a group.
        </p>
      ) : (
        <section className={`mt-6 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4 ${settingsFetching ? "opacity-80" : ""}`}>
          <h3 className="text-sm font-semibold text-gray-900">Default routing queue</h3>
          <p className="mt-1 max-w-2xl text-xs text-gray-600">
            If automations finish and the ticket still has no group, it is moved here (e.g. general / unassigned). Specific
            rules for service, source, keywords, etc. should use higher priority in Automations.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-sm text-gray-700">
              <span className="font-medium text-gray-800">Fallback group</span>
              <select
                value={defaultRoutingGroupId}
                onChange={(e) => setDefaultRoutingGroupId(e.target.value)}
                disabled={fieldsLocked}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm disabled:opacity-60"
              >
                <option value="">— None —</option>
                {(refData?.groups ?? []).map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.groupName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void saveDefaultRoutingGroup()}
              disabled={saveLocked || savingDefaultGroup || !defaultGroupDirty}
              className={PRIMARY_UPDATE_BTN_CLASS}
            >
              {savingDefaultGroup ? "Saving…" : "Save fallback queue"}
            </button>
          </div>
        </section>
      )}

      <div
        className={`grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-0 ${!embedded ? "mt-6" : "mt-6"} ${settingsFetching ? "opacity-80" : ""}`}
        aria-busy={settingsFetching}
      >
        <section className="md:pr-8">
          <h3 className="text-sm font-semibold text-gray-900">Max open per agent</h3>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
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
                disabled={fieldsLocked}
                className={`${inputClass} disabled:opacity-60`}
              />
            </label>
            <button
              type="button"
              onClick={() => void saveCap()}
              disabled={saveLocked || savingCap || !capDirty}
              className={PRIMARY_UPDATE_BTN_CLASS}
            >
              {savingCap ? "Updating…" : "Updated"}
            </button>
          </div>
        </section>

        <section className="md:border-l md:border-gray-200 md:pl-8">
          <h3 className="text-sm font-semibold text-gray-900">Auto Assign count (primary / secondary)</h3>
          {distributionMissing ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Database table or columns missing — apply{" "}
              <code className="font-mono">0168_ticket_auto_assign_distribution_cycle_columns.sql</code> (and 0162 / 0167 if
              needed).
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-6">
              <label className="flex flex-col gap-1.5 text-sm text-gray-700">
                <span className="font-medium text-gray-800">Primary</span>
                <input
                  type="number"
                  min={CYCLE_MIN}
                  max={CYCLE_MAX}
                  value={primaryCycle}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setPrimaryCycle(CYCLE_MIN);
                      return;
                    }
                    const num = Number(v);
                    if (Number.isFinite(num)) setPrimaryCycle(clampCycle(num));
                  }}
                  disabled={fieldsLocked || !!loadError}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-gray-700">
                <span className="font-medium text-gray-800">Secondary</span>
                <input
                  type="number"
                  min={CYCLE_MIN}
                  max={CYCLE_MAX}
                  value={secondaryCycle}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setSecondaryCycle(CYCLE_MIN);
                      return;
                    }
                    const num = Number(v);
                    if (Number.isFinite(num)) setSecondaryCycle(clampCycle(num));
                  }}
                  disabled={fieldsLocked || !!loadError}
                  className={`${inputClass} disabled:opacity-50`}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void saveDistribution()}
              disabled={saveLocked || savingDistribution || !distDirty}
              className={`${PRIMARY_UPDATE_BTN_CLASS} w-fit`}
            >
              {savingDistribution ? "Updating…" : "Updated"}
            </button>
          </div>
        </section>
      </div>

      <section
        className={`mt-10 border-t border-gray-200 pt-8 ${settingsFetching ? "opacity-80" : ""}`}
        aria-busy={settingsFetching}
      >
        <h3 className="text-sm font-semibold text-gray-900">Agent fully offline</h3>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          When an agent selects <strong className="font-medium text-gray-800">Offline</strong> (with a reason), open
          tickets assigned to them can be cleared and re-queued immediately so others can pick them up.{" "}
          <strong className="font-medium text-gray-800">Break</strong> and{" "}
          <strong className="font-medium text-gray-800">busy</strong> only pause availability — assignments stay.
        </p>
        {offlineSettingsMissing ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Offline controls require database migration{" "}
            <code className="font-mono">0171_ticket_queue_offline_release_settings.sql</code>.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-800">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-slate-700 focus:ring-slate-500"
              checked={releaseOffline}
              disabled={fieldsLocked || !!loadError || offlineSettingsMissing}
              onChange={(e) => setReleaseOffline(e.target.checked)}
            />
            <span>Release open assignments when an agent goes fully offline</span>
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-col gap-1.5 text-sm text-gray-700">
            <span className="font-medium text-gray-800">Max tickets to release per offline event</span>
            <input
              type="number"
              min={1}
              max={500}
              value={offlineMax}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setOfflineMax(1);
                  return;
                }
                const num = Number(v);
                if (Number.isFinite(num)) setOfflineMax(Math.max(1, Math.min(500, num)));
              }}
              disabled={fieldsLocked || !!loadError || offlineSettingsMissing}
              className={`${inputClass} disabled:opacity-60`}
            />
          </label>
          <button
            type="button"
            onClick={() => void saveOffline()}
            disabled={saveLocked || savingOffline || !offlineDirty || offlineSettingsMissing}
            className={PRIMARY_UPDATE_BTN_CLASS}
          >
            {savingOffline ? "Updating…" : "Updated"}
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Automation queue</h4>
          <p className="mt-1 text-sm text-gray-600">
            Run pending workflow jobs once (offline releases, ticket rules, etc.). Normally the dashboard runs a batch
            when an agent goes offline; use this if something is delayed.
          </p>
          <button
            type="button"
            onClick={() => void runProcessJobs()}
            disabled={saveLocked || processingJobs}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processingJobs ? "Processing…" : "Process automation jobs now"}
          </button>
        </div>
      </section>
    </div>
  );
}
