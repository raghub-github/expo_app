"use client";

import { useCallback, useEffect, useState, type ReactNode, type MouseEvent } from "react";
import { CalendarClock, ChefHat, X } from "lucide-react";
import { toast } from "sonner";
import { SCHEDULE_OFF_REASONS } from "@/lib/merchant-schedule-off-reasons";

const RUSH_DURATION_OPTIONS = [
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1h 30m" },
  { minutes: 120, label: "2 hours" },
] as const;

type ClosureRow = {
  id: number;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

type RushStatus = {
  is_active: boolean;
  duration_minutes: number | null;
  remaining_minutes: number;
};

function combineLocalDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split("-").map((x) => parseInt(x, 10));
  const [hh, mm] = timeStr.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

function defaultScheduleDraft() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const endYmd = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  const endHm = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return { startDate: ymd, startTime: hm, endDate: endYmd, endTime: endHm, reason: "" };
}

export type MerchantStoreScheduleActionsProps = {
  storeId: string;
  onRefresh: () => void | Promise<void>;
};

export function MerchantStoreScheduleActions({
  storeId,
  onRefresh,
}: MerchantStoreScheduleActionsProps) {
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [rushModalOpen, setRushModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [rush, setRush] = useState<RushStatus | null>(null);
  const [draft, setDraft] = useState(defaultScheduleDraft);
  const [rushPick, setRushPick] = useState(60);

  const loadClosures = useCallback(async () => {
    const res = await fetch(`/api/merchant/stores/${storeId}/schedule-off`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.closures)) {
      setClosures(data.closures as ClosureRow[]);
    } else {
      setClosures([]);
    }
  }, [storeId]);

  const loadRush = useCallback(async () => {
    const res = await fetch(`/api/merchant/stores/${storeId}/rush`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setRush({
        is_active: !!data.is_active,
        duration_minutes:
          typeof data.duration_minutes === "number" ? data.duration_minutes : null,
        remaining_minutes: Number(data.remaining_minutes) || 0,
      });
    }
  }, [storeId]);

  useEffect(() => {
    void loadRush();
    const t = setInterval(() => void loadRush(), 60_000);
    return () => clearInterval(t);
  }, [loadRush]);

  useEffect(() => {
    if (scheduleModalOpen) {
      setDraft(defaultScheduleDraft());
      void loadClosures();
    }
  }, [scheduleModalOpen, loadClosures]);

  useEffect(() => {
    if (rushModalOpen) void loadRush();
  }, [rushModalOpen, loadRush]);

  const afterChange = async () => {
    await onRefresh();
    await loadRush();
    await loadClosures();
  };

  const submitScheduleOff = async () => {
    if (!draft.reason.trim()) {
      toast.error("Select a reason for time-off");
      return;
    }
    const startsAt = combineLocalDateTime(draft.startDate, draft.startTime);
    const endsAt = combineLocalDateTime(draft.endDate, draft.endTime);
    if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
      toast.error("Check start and end date/time");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/schedule-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reason: draft.reason,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to save schedule");
        return;
      }
      toast.success("Scheduled time-off saved");
      setScheduleModalOpen(false);
      await afterChange();
    } catch {
      toast.error("Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  const removeClosure = async (closureId: number) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/merchant/stores/${storeId}/schedule-off?closure_id=${closureId}`,
        { method: "DELETE", credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to remove");
        return;
      }
      toast.success("Scheduled time-off removed");
      await afterChange();
    } catch {
      toast.error("Failed to remove");
    } finally {
      setSaving(false);
    }
  };

  const startRush = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/rush`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ duration_minutes: rushPick }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to start rush hour");
        return;
      }
      toast.success("Rush hour started");
      setRushModalOpen(false);
      await afterChange();
    } catch {
      toast.error("Failed to start rush hour");
    } finally {
      setSaving(false);
    }
  };

  const stopRush = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/rush`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to stop rush hour");
        return;
      }
      toast.success("Rush hour ended");
      await afterChange();
    } catch {
      toast.error("Failed to stop rush hour");
    } finally {
      setSaving(false);
    }
  };

  const rushActive = rush?.is_active && (rush?.remaining_minutes ?? 0) > 0;

  return (
    <>
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200/80">
        <button
          type="button"
          onClick={() => setScheduleModalOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950 hover:bg-amber-100"
        >
          <CalendarClock className="h-3 w-3" aria-hidden />
          Schedule time-off
        </button>
        <button
          type="button"
          onClick={() => setRushModalOpen(true)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold ${
            rushActive
              ? "border-orange-300 bg-orange-50 text-orange-900"
              : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
          }`}
        >
          <ChefHat className="h-3 w-3" aria-hidden />
          {rushActive ? `Rush · ~${rush?.remaining_minutes ?? 0}m` : "Rush hour"}
        </button>
      </div>

      {scheduleModalOpen && (
        <ModalShell title="Schedule time-off" onClose={() => !saving && setScheduleModalOpen(false)}>
          {closures.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 space-y-2">
              <p className="text-[10px] font-bold uppercase text-amber-950">Current schedules</p>
              <ul className="space-y-1.5">
                {closures.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-2 text-[11px] text-amber-950">
                    <span className="min-w-0">
                      {c.reason || "Time-off"} ·{" "}
                      {new Date(c.starts_at).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}{" "}
                      – {new Date(c.ends_at).toLocaleString("en-IN", { timeStyle: "short" })}
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      className="shrink-0 text-[10px] font-semibold text-rose-700 underline"
                      onClick={() => void removeClosure(c.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Start date</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">Start time</span>
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">End date</span>
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase text-slate-500">End time</span>
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase text-slate-500">Reason</span>
            <select
              value={draft.reason}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
            >
              <option value="">Select a reason</option>
              {SCHEDULE_OFF_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">You will not receive orders during this period.</p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitScheduleOff()}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Set schedule"}
          </button>
        </ModalShell>
      )}

      {rushModalOpen && (
        <ModalShell title="Rush hour" onClose={() => !saving && setRushModalOpen(false)}>
          {rushActive ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-orange-900">
                Rush mode is active · ~{rush?.remaining_minutes ?? 0} minutes remaining
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void stopRush()}
                className="w-full rounded-xl border border-orange-300 bg-white py-3 text-sm font-semibold text-orange-900 disabled:opacity-50"
              >
                {saving ? "Stopping…" : "End rush hour"}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Extra prep time for new orders. Pick how long rush mode should stay on.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {RUSH_DURATION_OPTIONS.map((o) => (
                  <button
                    key={o.minutes}
                    type="button"
                    onClick={() => setRushPick(o.minutes)}
                    className={`rounded-xl border py-2.5 text-sm font-semibold ${
                      rushPick === o.minutes
                        ? "border-orange-500 bg-orange-50 text-orange-900"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void startRush()}
                className="w-full rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Starting…" : "Start rush hour"}
              </button>
            </>
          )}
        </ModalShell>
      )}
    </>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}
