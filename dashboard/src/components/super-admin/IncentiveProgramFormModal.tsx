"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  buildIncentiveProgramPayload,
  DEFAULTS_BY_SERVICE,
  emptyIncentiveForm,
  generateIncentiveCodeFromName,
  incentiveDetailToForm,
  type CalendarBadgeRow,
  type IncentiveFormState,
  type SlotWindowRow,
  type TierRow,
} from "@/lib/incentive/incentive-program-form";
import {
  DAY_OF_WEEK_OPTIONS,
  resolveActiveDays,
  slotDayModeLabel,
  type SlotDayMode,
} from "@/lib/incentive/incentive-slot-schedule";

const controlCls =
  "w-full min-h-[42px] rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20";

const selectCls = cn(controlCls, "cursor-pointer");
const checkboxCls = "h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30";

const SERVICE_OPTIONS = [
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "ride_2w", label: "Ride — 2W" },
  { value: "ride_3w", label: "Ride — 3W" },
  { value: "ride_4w_ac", label: "Ride — 4W AC" },
  { value: "ride_4w_non_ac", label: "Ride — 4W Non-AC" },
  { value: "all_ride", label: "All ride" },
] as const;

function FormField({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium leading-none text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 border-b border-slate-100 pb-6 last:border-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

const SLOT_DAY_MODES: SlotDayMode[] = ["full_week", "weekdays", "weekends", "specific_days"];

type GeoState = { id: string; name: string };

export type IncentiveProgramFormModalProps = {
  open: boolean;
  editingProgramId: string | null;
  states: GeoState[];
  migrationRequired: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function IncentiveProgramFormModal({
  open,
  editingProgramId,
  states,
  migrationRequired,
  onClose,
  onSaved,
}: IncentiveProgramFormModalProps) {
  const isEdit = editingProgramId != null;
  const [busy, setBusy] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stateSearch, setStateSearch] = useState("");
  const [selectedStateIds, setSelectedStateIds] = useState<Set<string>>(new Set());
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [form, setForm] = useState<IncentiveFormState>(() => emptyIncentiveForm());
  const loadSeqRef = useRef(0);

  const resetForm = useCallback(() => {
    setForm(emptyIncentiveForm());
    setSelectedStateIds(new Set());
    setCodeManuallyEdited(false);
    setStateSearch("");
    setErr(null);
  }, []);

  const loadProgramForEdit = useCallback(async (id: string) => {
    const seq = ++loadSeqRef.current;
    setFormLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/super-admin/incentive-programs/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error ?? "Failed to load program"));
      if (!data?.program) throw new Error("Invalid program response from server");
      if (seq !== loadSeqRef.current) return;

      const mapped = incentiveDetailToForm(data);
      setForm(mapped.form);
      setSelectedStateIds(new Set(mapped.stateIds));
      setCodeManuallyEdited(true);
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setErr(e instanceof Error ? e.message : "Failed to load program");
    } finally {
      if (seq === loadSeqRef.current) setFormLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      loadSeqRef.current += 1;
      resetForm();
      setFormLoading(false);
      return;
    }
    if (editingProgramId) {
      setFormLoading(true);
      void loadProgramForEdit(editingProgramId);
    } else {
      resetForm();
      setFormLoading(false);
    }
  }, [open, editingProgramId, loadProgramForEdit, resetForm]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filteredStates = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return states;
    return states.filter((s) => s.name.toLowerCase().includes(q));
  }, [states, stateSearch]);

  const selectedStateChips = useMemo(
    () => states.filter((s) => selectedStateIds.has(s.id)),
    [states, selectedStateIds],
  );

  const applyServiceDefaults = (service: string) => {
    const d = DEFAULTS_BY_SERVICE[service] ?? DEFAULTS_BY_SERVICE.food!;
    setForm((f) => ({
      ...f,
      service,
      min_completed_orders: String(d.minOrders),
      min_acceptance_rate: String(d.acceptance),
      max_cancellation_rate: String(d.cancellation),
      min_active_minutes: String(d.activeMinutes),
      tiers: [
        { tier_no: 1, min_orders: String(d.minOrders), reward_amount: "80" },
        { tier_no: 2, min_orders: String(d.minOrders + 4), reward_amount: "140" },
        { tier_no: 3, min_orders: String(d.minOrders + 10), reward_amount: "220" },
      ],
    }));
  };

  const toggleState = (id: string) => {
    setSelectedStateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllStates = () => setSelectedStateIds(new Set(states.map((s) => s.id)));
  const clearAllStates = () => setSelectedStateIds(new Set());

  const saveProgram = async () => {
    setErr(null);
    const { payload, error } = buildIncentiveProgramPayload(form, Array.from(selectedStateIds));
    if (error || !payload) {
      setErr(error ?? "Invalid form");
      return;
    }

    setBusy(true);
    try {
      const url = isEdit
        ? `/api/super-admin/incentive-programs/${editingProgramId}`
        : "/api/super-admin/incentive-programs";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error ?? "Save failed"));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const addTier = () => {
    setForm((f) => ({
      ...f,
      tiers: [...f.tiers, { tier_no: f.tiers.length + 1, min_orders: "", reward_amount: "" }],
    }));
  };

  const updateTier = (idx: number, patch: Partial<TierRow>) => {
    setForm((f) => ({
      ...f,
      tiers: f.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }));
  };

  const removeTier = (idx: number) => {
    setForm((f) => ({
      ...f,
      tiers: f.tiers.filter((_, i) => i !== idx).map((t, i) => ({ ...t, tier_no: i + 1 })),
    }));
  };

  const toggleSpecificDay = (day: number) => {
    setForm((f) => {
      const set = new Set(f.specific_days);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...f, specific_days: Array.from(set).sort((a, b) => a - b) };
    });
  };

  const addSlotWindow = () => {
    setForm((f) => ({
      ...f,
      slot_windows: [...f.slot_windows, { start_time: "", end_time: "", label: "" }],
    }));
  };

  const updateSlotWindow = (idx: number, patch: Partial<SlotWindowRow>) => {
    setForm((f) => ({
      ...f,
      slot_windows: f.slot_windows.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const removeSlotWindow = (idx: number) => {
    setForm((f) => ({
      ...f,
      slot_windows: f.slot_windows.filter((_, i) => i !== idx),
    }));
  };

  const addCalendarBadge = () => {
    setForm((f) => ({
      ...f,
      calendar_badges: [...f.calendar_badges, { date: "", label: "Special" }],
    }));
  };

  const updateCalendarBadge = (idx: number, patch: Partial<CalendarBadgeRow>) => {
    setForm((f) => ({
      ...f,
      calendar_badges: f.calendar_badges.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const removeCalendarBadge = (idx: number) => {
    setForm((f) => ({
      ...f,
      calendar_badges: f.calendar_badges.filter((_, i) => i !== idx),
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incentive-form-modal-title"
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 id="incentive-form-modal-title" className="text-lg font-semibold tracking-tight text-slate-900">
              {isEdit ? "Edit incentive program" : "Create incentive program"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              State-scoped rider incentives with GMitra Max gate, slot windows, and budget-safe payout caps.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {err ? (
            <div className="mb-4 rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm text-red-800" role="alert">
              {err}
            </div>
          ) : null}

          {formLoading ? (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-slate-500">
              <LoadingSpinner variant="inline" size="md" />
              <span className="ml-2">Loading program…</span>
            </div>
          ) : (
        <div className="space-y-8 pb-2">
          <FormSection title="Basic info" description="Program identity and service scope.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Incentive name" htmlFor="inc-name">
                <input
                  id="inc-name"
                  className={controlCls}
                  placeholder="e.g. Bihar Food Daily Incentive"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      code: codeManuallyEdited ? f.code : generateIncentiveCodeFromName(name),
                    }));
                  }}
                />
              </FormField>
              <FormField
                label="Internal code"
                htmlFor="inc-code"
                hint={
                  codeManuallyEdited
                    ? "Custom code — clear field or reset form to re-sync from name."
                    : "Auto-generated from incentive name. Edit to override."
                }
              >
                <input
                  id="inc-code"
                  className={controlCls}
                  placeholder="Auto from name"
                  value={form.code}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase();
                    if (code.trim() === "") {
                      setCodeManuallyEdited(false);
                      setForm((f) => ({ ...f, code: generateIncentiveCodeFromName(f.name) }));
                      return;
                    }
                    setCodeManuallyEdited(true);
                    setForm((f) => ({ ...f, code }));
                  }}
                />
              </FormField>
              <FormField label="Service type" htmlFor="inc-service">
                <select
                  id="inc-service"
                  className={selectCls}
                  value={form.service}
                  onChange={(e) => {
                    const service = e.target.value;
                    if (isEdit) {
                      setForm((f) => ({ ...f, service }));
                      return;
                    }
                    applyServiceDefaults(service);
                  }}
                >
                  {SERVICE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status" htmlFor="inc-status">
                <select
                  id="inc-status"
                  className={selectCls}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))
                  }
                >
                  {["draft", "active", "paused", "archived"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label="Description" htmlFor="inc-desc" className="mt-4">
              <textarea
                id="inc-desc"
                className={cn(controlCls, "min-h-[72px] resize-y py-2")}
                placeholder="Optional admin / rider-facing description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
          </FormSection>

          <FormSection title="Validity" description="Cycle window, timezone, and recurrence.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Start" htmlFor="inc-start">
                <input
                  id="inc-start"
                  type="datetime-local"
                  className={controlCls}
                  value={form.start_at}
                  onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                />
              </FormField>
              <FormField label="End" htmlFor="inc-end">
                <input
                  id="inc-end"
                  type="datetime-local"
                  className={controlCls}
                  value={form.end_at}
                  onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                />
              </FormField>
              <FormField label="Recurrence" htmlFor="inc-recurrence">
                <select
                  id="inc-recurrence"
                  className={selectCls}
                  value={form.recurrence_type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      recurrence_type: e.target.value as typeof f.recurrence_type,
                    }))
                  }
                >
                  {["one_time", "daily", "weekly", "monthly"].map((v) => (
                    <option key={v} value={v}>
                      {v.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Slot mode" htmlFor="inc-slot">
                <select
                  id="inc-slot"
                  className={selectCls}
                  value={form.slot_mode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slot_mode: e.target.value as typeof f.slot_mode }))
                  }
                >
                  <option value="all_day">All day</option>
                  <option value="custom_slots">Custom slot windows</option>
                </select>
              </FormField>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div>
                <p className="text-[13px] font-medium text-slate-700">Active days</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Choose full week, weekdays only, weekends, or pick specific days.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SLOT_DAY_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                      form.slot_day_mode === mode
                        ? "border-teal-300 bg-teal-50 text-teal-800 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                    onClick={() => setForm((f) => ({ ...f, slot_day_mode: mode }))}
                  >
                    {slotDayModeLabel(mode)}
                  </button>
                ))}
              </div>

              {form.slot_day_mode === "specific_days" ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {DAY_OF_WEEK_OPTIONS.map((d) => {
                    const selected = form.specific_days.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        title={d.full}
                        className={cn(
                          "flex h-10 min-w-[2.75rem] items-center justify-center rounded-lg border px-2 text-xs font-semibold transition",
                          selected
                            ? "border-teal-400 bg-teal-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700",
                        )}
                        onClick={() => toggleSpecificDay(d.value)}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Applies on:{" "}
                  <span className="font-medium text-slate-700">
                    {resolveActiveDays(form.slot_day_mode, form.specific_days)
                      .map((d) => DAY_OF_WEEK_OPTIONS.find((o) => o.value === d)?.label)
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
              )}
            </div>

            {form.slot_mode === "custom_slots" ? (
              <div className="mt-5 space-y-3 rounded-xl border border-teal-200/60 bg-teal-50/30 p-4">
                <div>
                  <p className="text-[13px] font-medium text-slate-800">Custom slot windows</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Peak / lunch / dinner slots. Each window repeats on the active days selected above.
                  </p>
                </div>
                {form.slot_windows.map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-white/80 p-3"
                  >
                    <FormField label="Start time" className="min-w-[120px] flex-1">
                      <input
                        type="time"
                        className={controlCls}
                        value={slot.start_time}
                        onChange={(e) => updateSlotWindow(idx, { start_time: e.target.value })}
                      />
                    </FormField>
                    <FormField label="End time" className="min-w-[120px] flex-1">
                      <input
                        type="time"
                        className={controlCls}
                        value={slot.end_time}
                        onChange={(e) => updateSlotWindow(idx, { end_time: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Label (optional)" className="min-w-[140px] flex-[2]">
                      <input
                        className={controlCls}
                        placeholder="e.g. Lunch peak"
                        value={slot.label}
                        onChange={(e) => updateSlotWindow(idx, { label: e.target.value })}
                      />
                    </FormField>
                    {form.slot_windows.length > 1 ? (
                      <button
                        type="button"
                        className="mb-0.5 rounded-md p-2 text-red-600 hover:bg-red-50"
                        onClick={() => removeSlotWindow(idx)}
                        aria-label="Remove slot"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-teal-400 hover:text-teal-700"
                  onClick={addSlotWindow}
                >
                  <Plus className="h-3.5 w-3.5" /> Add slot window
                </button>
              </div>
            ) : null}

            <div className="mt-5 space-y-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
              <div>
                <p className="text-[13px] font-medium text-slate-800">Date strip badges</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Show a label above dates in the rider Offers calendar (e.g. Special, Bonus, 2X).
                </p>
              </div>
              {form.calendar_badges.length === 0 ? (
                <p className="text-xs text-slate-500">No badges configured for this program.</p>
              ) : (
                form.calendar_badges.map((badge, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-white/80 p-3"
                  >
                    <FormField label="Date" className="min-w-[140px] flex-1">
                      <input
                        type="date"
                        className={controlCls}
                        value={badge.date}
                        onChange={(e) => updateCalendarBadge(idx, { date: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Badge label" className="min-w-[140px] flex-[2]">
                      <input
                        className={controlCls}
                        placeholder="Special"
                        maxLength={24}
                        value={badge.label}
                        onChange={(e) => updateCalendarBadge(idx, { label: e.target.value })}
                      />
                    </FormField>
                    <button
                      type="button"
                      className="mb-0.5 rounded-md p-2 text-red-600 hover:bg-red-50"
                      onClick={() => removeCalendarBadge(idx)}
                      aria-label="Remove badge"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-violet-300 px-3 py-2 text-xs font-medium text-violet-700 hover:border-violet-400 hover:bg-violet-50/80"
                onClick={addCalendarBadge}
              >
                <Plus className="h-3.5 w-3.5" /> Add date badge
              </button>
            </div>
          </FormSection>

          <FormSection
            title="Geo scope — States / UTs"
            description="Mandatory multi-select. Riders see incentives only when their operating state matches."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <FormField label="Geo scope mode" htmlFor="inc-geo-mode">
                <select
                  id="inc-geo-mode"
                  className={selectCls}
                  value={form.geo_scope_mode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      geo_scope_mode: e.target.value as typeof f.geo_scope_mode,
                    }))
                  }
                >
                  <option value="selected_states">Selected states / UTs</option>
                  <option value="all_india">All India</option>
                  <option value="selected_cities" disabled>
                    Selected cities (coming soon)
                  </option>
                  <option value="selected_zones" disabled>
                    Selected zones (coming soon)
                  </option>
                </select>
              </FormField>
            </div>

            {form.geo_scope_mode === "selected_states" ? (
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={cn(controlCls, "max-w-xs flex-1")}
                    placeholder="Search state / UT…"
                    value={stateSearch}
                    onChange={(e) => setStateSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={selectAllStates}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={clearAllStates}
                  >
                    Clear all
                  </button>
                </div>
                {selectedStateChips.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedStateChips.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800"
                      >
                        <MapPin className="h-3 w-3" aria-hidden />
                        {s.name}
                        <button
                          type="button"
                          className="ml-0.5 text-teal-600 hover:text-teal-900"
                          onClick={() => toggleState(s.id)}
                          aria-label={`Remove ${s.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {filteredStates.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-slate-500">No states found.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {filteredStates.map((s) => (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                            <input
                              type="checkbox"
                              className={checkboxCls}
                              checked={selectedStateIds.has(s.id)}
                              onChange={() => toggleState(s.id)}
                            />
                            {s.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Rider scope & visibility" description="GMitra Max gate and card visibility rules.">
            <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm text-slate-700">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={form.requires_gmitra_max}
                  onChange={(e) => setForm((f) => ({ ...f, requires_gmitra_max: e.target.checked }))}
                />
                GMitra Max required for payout
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={form.show_to_non_subscribers}
                  onChange={(e) => setForm((f) => ({ ...f, show_to_non_subscribers: e.target.checked }))}
                />
                Show card to non-subscribers (locked state)
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={form.show_before_eligible}
                  onChange={(e) => setForm((f) => ({ ...f, show_before_eligible: e.target.checked }))}
                />
                Show before eligibility (default ON)
              </label>
            </div>
          </FormSection>

          <FormSection title="Qualification rules" description="Strong thresholds to keep ~10–12% qualification rate.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Min completed orders" htmlFor="inc-min-orders">
                <input
                  id="inc-min-orders"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.min_completed_orders}
                  onChange={(e) => setForm((f) => ({ ...f, min_completed_orders: e.target.value }))}
                />
              </FormField>
              <FormField label="Min acceptance %" htmlFor="inc-acceptance">
                <input
                  id="inc-acceptance"
                  className={controlCls}
                  inputMode="decimal"
                  value={form.min_acceptance_rate}
                  onChange={(e) => setForm((f) => ({ ...f, min_acceptance_rate: e.target.value }))}
                />
              </FormField>
              <FormField label="Max cancellation %" htmlFor="inc-cancel">
                <input
                  id="inc-cancel"
                  className={controlCls}
                  inputMode="decimal"
                  value={form.max_cancellation_rate}
                  onChange={(e) => setForm((f) => ({ ...f, max_cancellation_rate: e.target.value }))}
                />
              </FormField>
              <FormField label="Min active minutes" htmlFor="inc-active" hint="480 = 8 hours">
                <input
                  id="inc-active"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.min_active_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, min_active_minutes: e.target.value }))}
                />
              </FormField>
              <FormField label="Min customer rating" htmlFor="inc-rating">
                <input
                  id="inc-rating"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Optional"
                  value={form.min_customer_rating}
                  onChange={(e) => setForm((f) => ({ ...f, min_customer_rating: e.target.value }))}
                />
              </FormField>
              <FormField label="Min login days" htmlFor="inc-login" hint="For weekly / monthly cycles">
                <input
                  id="inc-login"
                  className={controlCls}
                  inputMode="numeric"
                  placeholder="Optional"
                  value={form.min_login_days}
                  onChange={(e) => setForm((f) => ({ ...f, min_login_days: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-700">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={form.exclude_suspended_riders}
                  onChange={(e) => setForm((f) => ({ ...f, exclude_suspended_riders: e.target.checked }))}
                />
                Exclude suspended riders
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={form.exclude_low_rating_riders}
                  onChange={(e) => setForm((f) => ({ ...f, exclude_low_rating_riders: e.target.checked }))}
                />
                Exclude low-rating riders
              </label>
            </div>
          </FormSection>

          <FormSection title="Reward tiers" description="Flat, tier, or rank-based payout structure.">
            <div className="mb-4 grid gap-5 sm:grid-cols-3">
              <FormField label="Reward type" htmlFor="inc-reward-type">
                <select
                  id="inc-reward-type"
                  className={selectCls}
                  value={form.reward_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reward_type: e.target.value as typeof f.reward_type }))
                  }
                >
                  {["flat", "tier", "rank", "pool", "streak"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Payout mode" htmlFor="inc-payout-mode">
                <select
                  id="inc-payout-mode"
                  className={selectCls}
                  value={form.payout_mode}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, payout_mode: e.target.value as typeof f.payout_mode }))
                  }
                >
                  {["instant", "next_settlement", "manual_approve"].map((v) => (
                    <option key={v} value={v}>
                      {v.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="space-y-2">
              {form.tiers.map((tier, idx) => (
                <div key={tier.tier_no} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                  <FormField label={`Tier ${tier.tier_no} — min orders`} className="min-w-[140px] flex-1">
                    <input
                      className={controlCls}
                      inputMode="numeric"
                      value={tier.min_orders}
                      onChange={(e) => updateTier(idx, { min_orders: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Reward ₹" className="min-w-[120px] flex-1">
                    <input
                      className={controlCls}
                      inputMode="decimal"
                      value={tier.reward_amount}
                      onChange={(e) => updateTier(idx, { reward_amount: e.target.value })}
                    />
                  </FormField>
                  {form.tiers.length > 1 ? (
                    <button
                      type="button"
                      className="mb-0.5 rounded-md p-2 text-red-600 hover:bg-red-50"
                      onClick={() => removeTier(idx)}
                      aria-label="Remove tier"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-teal-400 hover:text-teal-700"
                onClick={addTier}
              >
                <Plus className="h-3.5 w-3.5" /> Add tier
              </button>
            </div>
          </FormSection>

          <FormSection title="Winner / ranking & budget" description="Cap winners and protect payout budget.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Payout cap mode" htmlFor="inc-cap-mode">
                <select
                  id="inc-cap-mode"
                  className={selectCls}
                  value={form.payout_cap_mode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      payout_cap_mode: e.target.value as typeof f.payout_cap_mode,
                    }))
                  }
                >
                  {["all_eligible", "top_n", "top_percent", "first_n", "pool_limit"].map((v) => (
                    <option key={v} value={v}>
                      {v.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Max winners (top N)" htmlFor="inc-max-winners">
                <input
                  id="inc-max-winners"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.max_winners}
                  onChange={(e) => setForm((f) => ({ ...f, max_winners: e.target.value }))}
                />
              </FormField>
              <FormField label="Max total payout ₹" htmlFor="inc-budget">
                <input
                  id="inc-budget"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Optional"
                  value={form.max_total_payout}
                  onChange={(e) => setForm((f) => ({ ...f, max_total_payout: e.target.value }))}
                />
              </FormField>
              <FormField label="Max per rider ₹" htmlFor="inc-max-rider">
                <input
                  id="inc-max-rider"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Optional"
                  value={form.max_payout_per_rider}
                  onChange={(e) => setForm((f) => ({ ...f, max_payout_per_rider: e.target.value }))}
                />
              </FormField>
              <FormField label="Sort basis" htmlFor="inc-sort">
                <select
                  id="inc-sort"
                  className={selectCls}
                  value={form.sort_basis}
                  onChange={(e) => setForm((f) => ({ ...f, sort_basis: e.target.value }))}
                >
                  <option value="completed_orders_desc">Completed orders ↓</option>
                  <option value="acceptance_desc">Acceptance rate ↓</option>
                  <option value="earnings_desc">Earnings ↓</option>
                </select>
              </FormField>
              <FormField label="Tie-breaker" htmlFor="inc-tie">
                <select
                  id="inc-tie"
                  className={selectCls}
                  value={form.tie_breaker}
                  onChange={(e) => setForm((f) => ({ ...f, tie_breaker: e.target.value }))}
                >
                  <option value="lower_cancellations">Lower cancellations</option>
                  <option value="higher_active_hours">Higher active hours</option>
                  <option value="earlier_threshold">Earlier threshold completion</option>
                </select>
              </FormField>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={form.stop_on_budget_exhaust}
                onChange={(e) => setForm((f) => ({ ...f, stop_on_budget_exhaust: e.target.checked }))}
              />
              Stop program when budget is exhausted
            </label>
          </FormSection>
        </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4 shadow-[0_-4px_12px_-4px_rgba(15,23,42,0.08)]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void saveProgram()}
            disabled={busy || migrationRequired || formLoading}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-6 text-sm font-semibold text-white shadow-md shadow-teal-500/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:pointer-events-none disabled:opacity-55"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner variant="button" size="sm" /> Saving…
              </span>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create incentive"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}