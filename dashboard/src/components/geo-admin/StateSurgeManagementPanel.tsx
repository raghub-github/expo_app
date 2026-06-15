"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  isDefaultStateSurgeName,
  surgeUsesTimeSlots,
  type StateSurgeRow,
  type StateSurgeSettings,
  type StateSurgeTimeSlotRow,
} from "@/lib/geo/ride-state-config-shared";

const VEHICLE_OPTIONS = [
  { value: "all", label: "All vehicles" },
  { value: "2_wheeler", label: "2 Wheeler" },
  { value: "3_wheeler", label: "3 Wheeler" },
  { value: "4_wheeler_non_ac", label: "4 Wheeler Non AC" },
  { value: "4_wheeler_ac", label: "4 Wheeler AC" },
];

const SURGE_TYPE_OPTIONS = [
  { value: "fixed", label: "Fixed (₹)" },
  { value: "percentage", label: "Percentage (%)" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400";

function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

type Props = {
  stateId: string;
  stateLabel: string;
  onChange?: () => void;
  variant?: "card" | "embedded";
};

type TimeSlotRow = {
  id: number;
  stateSurgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

type SlotDraft = {
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

function toTimeInputValue(value: string): string {
  const parts = value.split(":");
  if (parts.length >= 2) return `${parts[0]!.padStart(2, "0")}:${parts[1]!.padStart(2, "0")}`;
  return value;
}

function mapApiTimeSlot(raw: StateSurgeTimeSlotRow | Record<string, unknown>): TimeSlotRow {
  const days = (raw as StateSurgeTimeSlotRow).daysOfWeek ?? (raw as Record<string, unknown>).days_of_week;
  return {
    id: Number((raw as StateSurgeTimeSlotRow).id ?? (raw as Record<string, unknown>).id),
    stateSurgeId: Number(
      (raw as StateSurgeTimeSlotRow).stateSurgeId ?? (raw as Record<string, unknown>).state_surge_id
    ),
    startTime: toTimeInputValue(String((raw as StateSurgeTimeSlotRow).startTime ?? (raw as Record<string, unknown>).start_time)),
    endTime: toTimeInputValue(String((raw as StateSurgeTimeSlotRow).endTime ?? (raw as Record<string, unknown>).end_time)),
    daysOfWeek: Array.isArray(days) ? days.map((d) => Number(d)) : [0, 1, 2, 3, 4, 5, 6],
    isEnabled: (raw as StateSurgeTimeSlotRow).isEnabled === true || (raw as Record<string, unknown>).is_enabled === true,
  };
}

function isPeakHourSurge(name: string): boolean {
  return name.toLowerCase().includes("peak");
}

function isNightSurge(name: string): boolean {
  return name.toLowerCase().includes("night");
}

function defaultSlotForSurge(name: string): { startTime: string; endTime: string } {
  if (isNightSurge(name)) return { startTime: "23:00", endTime: "03:00" };
  return { startTime: "11:00", endTime: "15:00" };
}

function isManualSurge(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("rain") || n.includes("festival");
}

function serviceLabel(row: StateSurgeRow): string {
  const parts = [
    row.appliesFood ? "Food" : null,
    row.appliesParcel ? "Parcel" : null,
    row.appliesRide ? "Ride" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "None";
}

function SurgeForCheckboxes({
  row,
  onChange,
}: {
  row: StateSurgeRow;
  onChange: (patch: Partial<StateSurgeRow>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["appliesFood", "Food"],
          ["appliesParcel", "Parcel"],
          ["appliesRide", "Ride"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange({ [key]: !row[key] })}
          className={
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
            (row[key]
              ? "bg-amber-600 text-white"
              : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-200")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SurgeTimeSlotsEditor(props: {
  surgeId: number;
  surgeName: string;
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
    surgeName,
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
    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
            {isNightSurge(surgeName) ? "Night time window" : "Peak hour windows"}
          </p>
          <p className="mt-0.5 text-[11px] text-amber-800/80">
            Stored per state in the database. Edit times and active days below.
          </p>
        </div>
        <button
          type="button"
          disabled={slotBusyId != null}
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add slot
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="text-xs text-slate-500">No slots — peak surge won&apos;t auto-activate.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map((slot) => {
            const isEditing = editingSlotId === slot.id;
            const busy = slotBusyId === slot.id;
            const draft = isEditing && slotDraft ? slotDraft : null;

            return (
              <li key={slot.id} className="rounded-lg border border-white bg-white p-3 shadow-sm">
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
                                ? "bg-amber-600 text-white"
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
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save slot"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={onCancelEdit}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-900">
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
                        className="text-xs font-semibold text-amber-800 hover:underline disabled:opacity-50"
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
    </div>
  );
}

export function StateSurgeManagementPanel({
  stateId,
  stateLabel,
  onChange,
  variant = "card",
}: Props) {
  const [rows, setRows] = useState<StateSurgeRow[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [settings, setSettings] = useState<StateSurgeSettings>({
    stateId,
    maxTotalSurgeAmount: null,
  });
  const [maxSurgeInput, setMaxSurgeInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [slotBusyId, setSlotBusyId] = useState<number | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slotsBySurge = useMemo(() => {
    const map = new Map<number, TimeSlotRow[]>();
    for (const s of timeSlots) {
      const list = map.get(s.stateSurgeId) ?? [];
      list.push(s);
      map.set(s.stateSurgeId, list);
    }
    return map;
  }, [timeSlots]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/super-admin/geo/state-surge-configs?stateId=${encodeURIComponent(stateId)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load state surges");
      setRows(json.surges ?? []);
      setTimeSlots((json.timeSlots ?? []).map((s: StateSurgeTimeSlotRow) => mapApiTimeSlot(s)));
      const loadedSettings = (json.settings ?? { stateId, maxTotalSurgeAmount: null }) as StateSurgeSettings;
      setSettings(loadedSettings);
      setMaxSurgeInput(
        loadedSettings.maxTotalSurgeAmount == null ? "" : String(loadedSettings.maxTotalSurgeAmount)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [stateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const notifyChange = () => onChange?.();

  const saveMaxSurgeSettings = async () => {
    const maxTotalSurgeAmount = numOrNull(maxSurgeInput);
    setSavingSettings(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/geo/state-surge-configs/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stateId, maxTotalSurgeAmount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setSettings(json.settings);
      notifyChange();
      toast.success(
        maxTotalSurgeAmount == null
          ? "Max surge cap removed (unlimited stacking)"
          : `Max surge per order set to ₹${maxTotalSurgeAmount}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingSettings(false);
    }
  };

  const validateRow = (row: StateSurgeRow): string | null => {
    if (!row.appliesFood && !row.appliesParcel && !row.appliesRide) {
      return "Select at least one service (Food, Parcel, or Ride)";
    }
    if (row.enabled && row.amount <= 0) {
      return "Set an amount before enabling this surge";
    }
    if (row.surgeType === "percentage" && row.amount > 100) {
      return "Percentage surge cannot exceed 100";
    }
    return null;
  };

  const payloadFromRow = (row: StateSurgeRow) => ({
    name: row.name,
    enabled: row.enabled,
    surgeType: row.surgeType,
    amount: row.amount,
    vehicleType: row.vehicleType,
    appliesFood: row.appliesFood,
    appliesParcel: row.appliesParcel,
    appliesRide: row.appliesRide,
    maxRidersOnly: row.maxRidersOnly,
    priority: row.priority,
    manualActive: row.manualActive,
  });

  const saveRow = async (row: StateSurgeRow) => {
    const validationError = validateRow(row);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }
    setSavingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/geo/state-surge-configs/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromRow(row)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      setRows((prev) => prev.map((r) => (r.id === row.id ? json.surge : r)));
      notifyChange();
      toast.success(`${row.name} saved`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  };

  const addSurge = async () => {
    try {
      const minPriority = rows.length > 0 ? Math.min(...rows.map((r) => r.priority)) : 100;
      const nextPriority = Math.max(0, minPriority - 10);
      const res = await fetch("/api/super-admin/geo/state-surge-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateId,
          name: "Custom Surge",
          enabled: false,
          surgeType: "fixed",
          amount: 0,
          appliesFood: true,
          appliesParcel: true,
          appliesRide: true,
          vehicleType: "all",
          priority: nextPriority,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Create failed");
      setRows((prev) => [...prev, json.surge]);
      setExpandedId(json.surge.id);
      notifyChange();
      toast.success("Custom surge added — edit and save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    }
  };

  const deleteRow = async (row: StateSurgeRow) => {
    if (isDefaultStateSurgeName(row.name)) {
      toast.error("Built-in surges cannot be deleted");
      return;
    }
    if (!confirm(`Delete "${row.name}"?`)) return;
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/super-admin/geo/state-surge-configs/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (expandedId === row.id) setExpandedId(null);
      notifyChange();
      toast.success("Surge deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingId(null);
    }
  };

  const addTimeSlot = async (stateSurgeId: number, surgeName: string) => {
    const defaults = defaultSlotForSurge(surgeName);
    setSlotBusyId(-stateSurgeId);
    try {
      const res = await fetch("/api/super-admin/geo/state-surge-configs/time-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateSurgeId,
          startTime: defaults.startTime,
          endTime: defaults.endTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      const slot = mapApiTimeSlot(json.slot);
      setTimeSlots((prev) => [...prev, slot]);
      setEditingSlotId(slot.id);
      setSlotDraft({
        startTime: slot.startTime,
        endTime: slot.endTime,
        daysOfWeek: [...slot.daysOfWeek],
        isEnabled: slot.isEnabled,
      });
      notifyChange();
      toast.success("Time slot added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add slot failed");
    } finally {
      setSlotBusyId(null);
    }
  };

  const deleteTimeSlot = async (id: number) => {
    setSlotBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/state-surge-configs/time-slots?id=${id}`, {
        method: "DELETE",
      });
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

  const saveTimeSlot = async () => {
    if (editingSlotId == null || !slotDraft) return;
    if (slotDraft.daysOfWeek.length === 0) {
      toast.error("Select at least one day");
      return;
    }
    setSlotBusyId(editingSlotId);
    try {
      const res = await fetch("/api/super-admin/geo/state-surge-configs/time-slots", {
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
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      const slot = mapApiTimeSlot(json.slot);
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

  const updateLocal = (id: number, patch: Partial<StateSurgeRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const shellCls =
    variant === "card"
      ? "rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4"
      : "space-y-4";

  return (
    <div className={shellCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {variant === "card" ? (
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Rider surge rules</h3>
            <p className="text-xs text-slate-500">
              {stateLabel} — configure rider payout surges. Built-in rules start disabled at ₹0.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Built-in surges are pre-seeded per state. Add custom surges anytime.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void addSurge()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add surge
          </button>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

      <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
        <h4 className="text-sm font-bold text-slate-900">Max surge per order</h4>
        <p className="mt-1 text-xs text-slate-600">
          When multiple surges apply together (e.g. ₹12 + ₹18 + ₹25 + ₹30 = ₹85), the rider receives only up to
          this cap for <span className="font-semibold">{stateLabel}</span>. Leave blank for no cap.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-700">
            Max total surge ₹
            <input
              type="number"
              min={0}
              className={`${inputCls} mt-1 w-36 font-mono`}
              placeholder="e.g. 40"
              value={maxSurgeInput}
              onChange={(e) => setMaxSurgeInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={savingSettings}
            onClick={() => void saveMaxSurgeSettings()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {savingSettings ? "Saving…" : "Save cap"}
          </button>
        </div>
        {settings.maxTotalSurgeAmount != null ? (
          <p className="mt-2 text-[11px] font-medium text-amber-800">
            Active cap: ₹{settings.maxTotalSurgeAmount} per order — rider never gets more than this from surges.
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">No cap set — all active surges add up fully.</p>
        )}
      </section>

      {loading && rows.length === 0 && !error ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          Loading surges…
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
          {error ? "Could not load surges. Click Refresh to retry." : "No surges yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const expanded = expandedId === row.id;
            const builtIn = isDefaultStateSurgeName(row.name);
            const slots = slotsBySurge.get(row.id) ?? [];

            return (
              <article
                key={row.id}
                className={
                  "overflow-hidden rounded-xl border bg-white shadow-sm transition " +
                  (row.enabled ? "border-amber-200" : "border-slate-200")
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Zap className={`h-5 w-5 shrink-0 ${row.enabled ? "text-amber-500" : "text-slate-300"}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-base font-bold text-slate-900">{row.name}</h4>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                            (builtIn ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800")
                          }
                        >
                          {builtIn ? "Built-in" : "Custom"}
                        </span>
                      </div>
                      {row.description ? (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.description}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={row.enabled}
                        onChange={(e) => updateLocal(row.id, { enabled: e.target.checked })}
                      />
                      ON
                    </label>
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void saveRow(row)}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {savingId === row.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {expanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          Edit
                        </>
                      )}
                    </button>
                    {!builtIn ? (
                      <button
                        type="button"
                        onClick={() => void deleteRow(row)}
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                        title="Delete surge"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-slate-500">Amount</span>
                    <p className="font-mono font-bold text-slate-900">
                      {row.surgeType === "percentage" ? `${row.amount}%` : `₹${row.amount || "—"}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Surge for</span>
                    <p className="font-semibold text-slate-800">{serviceLabel(row)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Vehicle</span>
                    <p className="font-semibold text-slate-800">
                      {VEHICLE_OPTIONS.find((v) => v.value === row.vehicleType)?.label ?? row.vehicleType}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Priority</span>
                    <p className="font-mono font-semibold text-slate-800">{row.priority}</p>
                  </div>
                </div>

                {expanded ? (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50/40 px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {!builtIn ? (
                        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                          Name
                          <input
                            className={`${inputCls} mt-1`}
                            value={row.name}
                            onChange={(e) => updateLocal(row.id, { name: e.target.value })}
                          />
                        </label>
                      ) : null}

                      <label className="text-xs font-semibold text-slate-700">
                        Type
                        <select
                          className={`${inputCls} mt-1`}
                          value={row.surgeType}
                          onChange={(e) =>
                            updateLocal(row.id, { surgeType: e.target.value as StateSurgeRow["surgeType"] })
                          }
                        >
                          {SURGE_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs font-semibold text-slate-700">
                        Amount
                        <input
                          type="number"
                          min={0}
                          className={`${inputCls} mt-1 font-mono`}
                          placeholder="0"
                          value={row.amount === 0 ? "" : row.amount}
                          onChange={(e) => {
                            const t = e.target.value.trim();
                            updateLocal(row.id, { amount: t === "" ? 0 : Number(t) });
                          }}
                        />
                      </label>

                      <label className="text-xs font-semibold text-slate-700">
                        Vehicle scope
                        <select
                          className={`${inputCls} mt-1`}
                          value={row.vehicleType}
                          onChange={(e) =>
                            updateLocal(row.id, {
                              vehicleType: e.target.value as StateSurgeRow["vehicleType"],
                            })
                          }
                        >
                          {VEHICLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-xs font-semibold text-slate-700">
                        Priority
                        <input
                          type="number"
                          className={`${inputCls} mt-1 font-mono`}
                          value={row.priority}
                          onChange={(e) => updateLocal(row.id, { priority: Number(e.target.value) })}
                        />
                      </label>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700">Surge for</p>
                      <div className="mt-2">
                        <SurgeForCheckboxes row={row} onChange={(p) => updateLocal(row.id, p)} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={row.maxRidersOnly}
                          onChange={(e) => updateLocal(row.id, { maxRidersOnly: e.target.checked })}
                        />
                        GMitra Max riders only
                      </label>
                      {isManualSurge(row.name) ? (
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={row.manualActive}
                            onChange={(e) => updateLocal(row.id, { manualActive: e.target.checked })}
                          />
                          Manual active (turn on when needed)
                        </label>
                      ) : null}
                    </div>

                    {surgeUsesTimeSlots(row.name) ? (
                      <SurgeTimeSlotsEditor
                        surgeId={row.id}
                        surgeName={row.name}
                        slots={slots}
                        slotBusyId={slotBusyId}
                        editingSlotId={editingSlotId}
                        slotDraft={slotDraft}
                        onStartEdit={(slot) => {
                          setEditingSlotId(slot.id);
                          setSlotDraft({
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            daysOfWeek: [...slot.daysOfWeek],
                            isEnabled: slot.isEnabled,
                          });
                        }}
                        onCancelEdit={() => {
                          setEditingSlotId(null);
                          setSlotDraft(null);
                        }}
                        onDraftChange={(patch) =>
                          setSlotDraft((d) => (d ? { ...d, ...patch } : d))
                        }
                        onSaveEdit={() => void saveTimeSlot()}
                        onAdd={() => void addTimeSlot(row.id, row.name)}
                        onRemove={(id) => void deleteTimeSlot(id)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
