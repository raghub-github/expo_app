"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  fetchRiderSurgeCatalog,
  getRiderSurgeCatalogCache,
  subscribeRiderSurgeCatalog,
} from "@/lib/geo/riderSurgeCatalogCache";

type SurgeKind = "peak_hour" | "rain" | "festival" | "custom";

type SurgeRow = {
  id: number;
  name: string;
  description: string | null;
  kind: SurgeKind;
  fixedAmount: number;
  priority: number;
  isEnabled: boolean;
  gmitraMaxOnly: boolean;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  vehicle2Wheeler: boolean;
  vehicle3Wheeler: boolean;
  vehicle4WheelerAc: boolean;
  vehicle4WheelerNonAc: boolean;
  manualActive: boolean;
};

type TimeSlotRow = {
  id: number;
  surgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

type SettingsRow = {
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
};

const KIND_LABELS: Record<SurgeKind, string> = {
  peak_hour: "Peak hour",
  rain: "Rain",
  festival: "Festival",
  custom: "Custom",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inputCls =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toTimeInputValue(value: string): string {
  const parts = value.split(":");
  if (parts.length >= 2) return `${parts[0]!.padStart(2, "0")}:${parts[1]!.padStart(2, "0")}`;
  return value;
}

function mapApiTimeSlot(raw: Record<string, unknown>): TimeSlotRow {
  const days = raw.daysOfWeek ?? raw.days_of_week;
  return {
    id: Number(raw.id),
    surgeId: Number(raw.surgeId ?? raw.surge_id),
    startTime: toTimeInputValue(String(raw.startTime ?? raw.start_time)),
    endTime: toTimeInputValue(String(raw.endTime ?? raw.end_time)),
    daysOfWeek: Array.isArray(days) ? days.map((d) => Number(d)) : [0, 1, 2, 3, 4, 5, 6],
    isEnabled: raw.isEnabled === true || raw.is_enabled === true,
  };
}

type SlotDraft = {
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

function PeakHourTimeSlots(props: {
  surgeId: number;
  slots: TimeSlotRow[];
  slotBusyId: number | null;
  editingSlotId: number | null;
  slotDraft: SlotDraft | null;
  onStartEdit: (slot: TimeSlotRow) => void;
  onCancelEdit: () => void;
  onDraftChange: (patch: Partial<SlotDraft>) => void;
  onSaveEdit: () => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  const {
    surgeId,
    slots,
    slotBusyId,
    editingSlotId,
    slotDraft,
    onStartEdit,
    onCancelEdit,
    onDraftChange,
    onSaveEdit,
    onAdd,
    onRemove,
  } = props;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-slate-600">Peak hour time slots</p>
        <button
          type="button"
          disabled={slotBusyId != null}
          onClick={onAdd}
          className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50"
        >
          + Add slot
        </button>
      </div>
      {slots.length === 0 ? (
        <p className="text-xs text-slate-500">No slots — surge won&apos;t auto-activate.</p>
      ) : (
        <ul className="space-y-3">
          {slots.map((slot) => {
            const isEditing = editingSlotId === slot.id;
            const busy = slotBusyId === slot.id;
            const draft = isEditing && slotDraft ? slotDraft : null;

            return (
              <li key={slot.id} className="rounded-lg border border-slate-200 bg-white p-3">
                {isEditing && draft ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-700">
                        Start
                        <input
                          type="time"
                          className={`${inputCls} mt-1 font-mono`}
                          value={draft.startTime}
                          onChange={(e) => onDraftChange({ startTime: e.target.value })}
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700">
                        End
                        <input
                          type="time"
                          className={`${inputCls} mt-1 font-mono`}
                          value={draft.endTime}
                          onChange={(e) => onDraftChange({ endTime: e.target.value })}
                        />
                      </label>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700">Days</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {DAY_LABELS.map((label, day) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              const has = draft.daysOfWeek.includes(day);
                              const next = has
                                ? draft.daysOfWeek.filter((d) => d !== day)
                                : [...draft.daysOfWeek, day].sort((a, b) => a - b);
                              onDraftChange({ daysOfWeek: next });
                            }}
                            className={
                              "rounded-md px-2 py-1 text-[11px] font-semibold " +
                              (draft.daysOfWeek.includes(day)
                                ? "bg-teal-700 text-white"
                                : "border border-slate-200 bg-slate-50 text-slate-600")
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={draft.isEnabled}
                        onChange={(e) => onDraftChange({ isEnabled: e.target.checked })}
                      />
                      Slot enabled
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || draft.daysOfWeek.length === 0}
                        onClick={onSaveEdit}
                        className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save slot"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={onCancelEdit}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-slate-900">
                        {slot.startTime} → {slot.endTime}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {slot.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}
                        {!slot.isEnabled ? " · disabled" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={slotBusyId != null}
                        onClick={() => onStartEdit(slot)}
                        className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={slotBusyId != null}
                        onClick={() => onRemove(slot.id)}
                        className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                      >
                        {busy ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {slotBusyId === -surgeId ? (
        <p className="mt-2 text-xs text-slate-500">Adding slot…</p>
      ) : null}
    </div>
  );
}

export type RiderSurgeManagementPanelProps = {
  variant?: "page" | "embedded";
  onCatalogChange?: () => void;
};

export function RiderSurgeManagementPanel({
  variant = "page",
  onCatalogChange,
}: RiderSurgeManagementPanelProps) {
  const cached = getRiderSurgeCatalogCache();
  const [refreshing, setRefreshing] = useState(!cached);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [surges, setSurges] = useState<SurgeRow[]>(() => (cached?.definitions ?? []) as SurgeRow[]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>(() =>
    (cached?.timeSlots ?? []).map((s) => mapApiTimeSlot(s))
  );
  const [settings, setSettings] = useState<SettingsRow>(
    () => cached?.settings ?? { maxTotalSurgeAmount: 50, surgeWaitMaxOnly: false }
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [slotBusyId, setSlotBusyId] = useState<number | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null);

  const notifyChange = useCallback(() => {
    onCatalogChange?.();
  }, [onCatalogChange]);

  const applyCatalog = useCallback((json: { definitions?: unknown[]; timeSlots?: unknown[]; settings?: SettingsRow }) => {
    setSurges((json.definitions ?? []) as SurgeRow[]);
    setTimeSlots((json.timeSlots ?? []).map((s) => mapApiTimeSlot(s as Record<string, unknown>)));
    if (json.settings) setSettings(json.settings);
  }, []);

  const load = useCallback(async (opts?: { force?: boolean; silent?: boolean }) => {
    const hasCache = getRiderSurgeCatalogCache() != null;
    if (!hasCache || opts?.force) setRefreshing(true);
    try {
      const catalog = await fetchRiderSurgeCatalog({ force: opts?.force });
      applyCatalog(catalog);
    } catch (e) {
      if (!hasCache) toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setRefreshing(false);
    }
  }, [applyCatalog]);

  useEffect(() => {
    void load();
    return subscribeRiderSurgeCatalog(() => {
      const hit = getRiderSurgeCatalogCache();
      if (hit) applyCatalog(hit);
    });
  }, [load, applyCatalog]);

  const slotsBySurge = useMemo(() => {
    const map = new Map<number, TimeSlotRow[]>();
    for (const s of timeSlots) {
      const list = map.get(s.surgeId) ?? [];
      list.push(s);
      map.set(s.surgeId, list);
    }
    return map;
  }, [timeSlots]);

  const saveSettings = async () => {
    try {
      const res = await fetch("/api/super-admin/geo/rider-surges/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSettings(json.settings);
      notifyChange();
      toast.success("Global settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const patchSurge = async (id: number, patch: Partial<SurgeRow>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-surges/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSurges((prev) => prev.map((s) => (s.id === id ? { ...s, ...json.surge } : s)));
      notifyChange();
      toast.success("Surge saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const addSurge = async () => {
    try {
      const res = await fetch("/api/super-admin/geo/rider-surges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Custom Surge",
          kind: "custom",
          fixedAmount: 10,
          appliesFood: true,
          appliesParcel: true,
          appliesRide: true,
          vehicle2Wheeler: true,
          isEnabled: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      await load({ silent: true });
      setExpandedId(json.surge?.id ?? null);
      notifyChange();
      toast.success("Surge created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const deleteSurge = async (id: number) => {
    if (!confirm("Delete this surge?")) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-surges/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      await load({ silent: true });
      notifyChange();
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  };

  const addTimeSlot = async (surgeId: number) => {
    setSlotBusyId(-surgeId);
    try {
      const res = await fetch("/api/super-admin/geo/rider-surges/time-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surgeId, startTime: "07:00", endTime: "10:00" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const slot = mapApiTimeSlot(json.slot as Record<string, unknown>);
      setTimeSlots((prev) => [...prev, slot]);
      setEditingSlotId(slot.id);
      setSlotDraft({
        startTime: slot.startTime,
        endTime: slot.endTime,
        daysOfWeek: [...slot.daysOfWeek],
        isEnabled: slot.isEnabled,
      });
      notifyChange();
      toast.success("Slot added — edit times and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add slot failed");
    } finally {
      setSlotBusyId(null);
    }
  };

  const deleteTimeSlot = async (id: number) => {
    setSlotBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-surges/time-slots?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      setTimeSlots((prev) => prev.filter((s) => s.id !== id));
      if (editingSlotId === id) {
        setEditingSlotId(null);
        setSlotDraft(null);
      }
      notifyChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete slot failed");
    } finally {
      setSlotBusyId(null);
    }
  };

  const startEditTimeSlot = (slot: TimeSlotRow) => {
    setEditingSlotId(slot.id);
    setSlotDraft({
      startTime: slot.startTime,
      endTime: slot.endTime,
      daysOfWeek: [...slot.daysOfWeek],
      isEnabled: slot.isEnabled,
    });
  };

  const cancelEditTimeSlot = () => {
    setEditingSlotId(null);
    setSlotDraft(null);
  };

  const saveTimeSlot = async () => {
    if (editingSlotId == null || !slotDraft) return;
    if (slotDraft.daysOfWeek.length === 0) {
      toast.error("Select at least one day");
      return;
    }
    setSlotBusyId(editingSlotId);
    try {
      const res = await fetch("/api/super-admin/geo/rider-surges/time-slots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingSlotId,
          startTime: slotDraft.startTime,
          endTime: slotDraft.endTime,
          daysOfWeek: slotDraft.daysOfWeek,
          isEnabled: slotDraft.isEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      const slot = mapApiTimeSlot(json.slot as Record<string, unknown>);
      setTimeSlots((prev) => prev.map((s) => (s.id === slot.id ? slot : s)));
      setEditingSlotId(null);
      setSlotDraft(null);
      notifyChange();
      toast.success("Time slot saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save slot failed");
    } finally {
      setSlotBusyId(null);
    }
  };

  const updateLocal = (id: number, patch: Partial<SurgeRow>) => {
    setSurges((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className={variant === "page" ? "mx-auto max-w-6xl space-y-6 p-4 pb-12 lg:p-6" : "space-y-4"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {variant === "page" ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Geo &amp; Pricing</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Rider Surge Management</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Configure unlimited dynamic surges with fixed ₹ amounts. Peak-hour slots auto-activate; rain and festival use manual toggles.
            </p>
            <Link href="/dashboard/super-admin/geo" className="mt-2 inline-block text-sm font-medium text-teal-700 hover:underline">
              ← Back to Geo &amp; coverage
            </Link>
          </div>
        ) : (
          <p className="max-w-2xl text-sm text-slate-600">
            Configure fixed-amount surges for riders. Changes apply instantly across Food, Parcel, and Ride.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void addSurge()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            Add surge
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Global protection</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="text-sm font-semibold text-slate-700">
            Max total surge per order ₹
            <input
              className={`${inputCls} mt-1 w-32 font-mono`}
              value={settings.maxTotalSurgeAmount == null ? "" : String(settings.maxTotalSurgeAmount)}
              onChange={(e) => setSettings((s) => ({ ...s, maxTotalSurgeAmount: num(e.target.value) }))}
              placeholder="No cap"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.surgeWaitMaxOnly}
              onChange={(e) => setSettings((s) => ({ ...s, surgeWaitMaxOnly: e.target.checked }))}
            />
            Only GMitra Max riders receive waiting &amp; surge benefits
          </label>
          <button
            type="button"
            onClick={() => void saveSettings()}
            className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-100"
          >
            Save settings
          </button>
        </div>
      </section>

      {refreshing && surges.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
          Loading surges…
        </div>
      ) : surges.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">
          No surges yet. Click &quot;Add surge&quot; to create your first one.
        </p>
      ) : (
        <div className="space-y-4">
          {surges.map((s) => (
            <article key={s.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Zap className={`h-5 w-5 ${s.isEnabled ? "text-amber-500" : "text-slate-300"}`} />
                  <input
                    className="rounded-md border border-transparent bg-transparent px-1 text-lg font-bold text-slate-900 hover:border-slate-200 focus:border-teal-400 focus:outline-none"
                    value={s.name}
                    onChange={(e) => updateLocal(s.id, { name: e.target.value })}
                  />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600">
                    {KIND_LABELS[s.kind]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={s.isEnabled}
                      onChange={(e) => updateLocal(s.id, { isEnabled: e.target.checked })}
                    />
                    ON
                  </label>
                  <button
                    type="button"
                    disabled={savingId === s.id}
                    onClick={() => void patchSurge(s.id, s)}
                    className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    {savingId === s.id ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    {expandedId === s.id ? "Collapse" : "Edit"}
                  </button>
                  <button type="button" onClick={() => void deleteSurge(s.id)} className="text-rose-600 hover:text-rose-800">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-4">
                <div>
                  Amount: <span className="font-mono font-bold text-teal-800">₹{s.fixedAmount}</span>
                </div>
                <div>
                  Priority: <span className="font-mono">{s.priority}</span>
                </div>
                <div>
                  Services:{" "}
                  {[s.appliesFood && "Food", s.appliesParcel && "Parcel", s.appliesRide && "Ride"].filter(Boolean).join(", ") || "—"}
                </div>
                <div>{s.gmitraMaxOnly ? "GMitra Max only" : "All riders"}</div>
              </div>

              {expandedId === s.id ? (
                <div className="space-y-4 border-t border-slate-100 px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs font-semibold text-slate-700">
                      Description
                      <input
                        className={`${inputCls} mt-1`}
                        value={s.description ?? ""}
                        onChange={(e) => updateLocal(s.id, { description: e.target.value || null })}
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Fixed amount ₹
                      <input
                        className={`${inputCls} mt-1 font-mono`}
                        value={String(s.fixedAmount)}
                        onChange={(e) => updateLocal(s.id, { fixedAmount: num(e.target.value) ?? s.fixedAmount })}
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Kind
                      <select
                        className={`${inputCls} mt-1`}
                        value={s.kind}
                        onChange={(e) => updateLocal(s.id, { kind: e.target.value as SurgeKind })}
                      >
                        {Object.entries(KIND_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Priority
                      <input
                        className={`${inputCls} mt-1 font-mono`}
                        value={String(s.priority)}
                        onChange={(e) => updateLocal(s.id, { priority: Math.floor(num(e.target.value) ?? s.priority) })}
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700">
                    <span>Apply to:</span>
                    {(
                      [
                        ["appliesFood", "Food"],
                        ["appliesParcel", "Parcel"],
                        ["appliesRide", "Ride"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={s[key]}
                          onChange={(e) => updateLocal(s.id, { [key]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700">
                    <span>Vehicles:</span>
                    {(
                      [
                        ["vehicle2Wheeler", "2 Wheeler"],
                        ["vehicle3Wheeler", "3 Wheeler"],
                        ["vehicle4WheelerAc", "4W AC"],
                        ["vehicle4WheelerNonAc", "4W Non AC"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={s[key]}
                          onChange={(e) => updateLocal(s.id, { [key]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={s.gmitraMaxOnly}
                      onChange={(e) => updateLocal(s.id, { gmitraMaxOnly: e.target.checked })}
                    />
                    Only GMitra Max riders get this surge
                  </label>

                  {s.kind === "rain" || s.kind === "festival" ? (
                    <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={s.manualActive}
                        onChange={(e) => updateLocal(s.id, { manualActive: e.target.checked })}
                      />
                      Manual toggle — surge active now
                    </label>
                  ) : null}

                  {s.kind === "peak_hour" ? (
                    <PeakHourTimeSlots
                      surgeId={s.id}
                      slots={slotsBySurge.get(s.id) ?? []}
                      slotBusyId={slotBusyId}
                      editingSlotId={editingSlotId}
                      slotDraft={slotDraft}
                      onStartEdit={startEditTimeSlot}
                      onCancelEdit={cancelEditTimeSlot}
                      onDraftChange={(patch) => setSlotDraft((d) => (d ? { ...d, ...patch } : d))}
                      onSaveEdit={() => void saveTimeSlot()}
                      onAdd={() => void addTimeSlot(s.id)}
                      onRemove={(id) => void deleteTimeSlot(id)}
                    />
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
