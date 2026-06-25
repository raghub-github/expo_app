"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Bike, Loader2, X } from "lucide-react";

type DocOption = { code: string; label: string };

export type DocRequirementMode = "off" | "required" | "optional";

type FormState = {
  code: string;
  categoryCode: string;
  label: string;
  hint: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
  docModes: Record<string, DocRequirementMode>;
  hasOwnVehicle: boolean;
  requiresMaxSpeed: boolean;
  infoMessage: string;
  mapsToVehicleType: string;
};

type CategoryOption = { code: string; label: string };

const FLOW_OPTIONS = [
  { value: "dl_rc", label: "DL + RC wizard" },
  { value: "rental_ev", label: "Rental / EV proof" },
  { value: "payment", label: "Skip to payment" },
] as const;

const DOC_MODE_OPTIONS: { value: DocRequirementMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "required", label: "Required" },
  { value: "optional", label: "Optional" },
];

type RiderVehicleTypeFormModalProps = {
  open: boolean;
  editId: number | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  categoryOptions: CategoryOption[];
  assignableDocs: DocOption[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onSetDocMode: (doc: string, mode: DocRequirementMode) => void;
};

export function RiderVehicleTypeFormModal({
  open,
  editId,
  form,
  setForm,
  categoryOptions,
  assignableDocs,
  saving,
  onClose,
  onSave,
  onSetDocMode,
}: RiderVehicleTypeFormModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={editId ? "Edit vehicle type" : "New vehicle type"}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <Bike className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white">
                {editId ? "Edit vehicle type" : "New vehicle type"}
              </h2>
              <p className="text-xs text-emerald-50">Rider onboarding catalog</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/90 hover:bg-white/15"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Code</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="own_bike"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Label</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Category</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.categoryCode}
                onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
              >
                {categoryOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Hint (subtitle)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.hint}
                onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Icon (Ionicons name)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="bicycle-outline"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Sort order</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Onboarding flow</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.onboardingFlow}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    onboardingFlow: e.target.value as FormState["onboardingFlow"],
                  }))
                }
              >
                {FLOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium">Info message (shown when selected)</span>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={2}
                value={form.infoMessage}
                onChange={(e) => setForm((f) => ({ ...f, infoMessage: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Maps to vehicle type</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.mapsToVehicleType}
                onChange={(e) => setForm((f) => ({ ...f, mapsToVehicleType: e.target.value }))}
                placeholder="bike, cycle, ev_bike"
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.hasOwnVehicle}
                  onChange={(e) => setForm((f) => ({ ...f, hasOwnVehicle: e.target.checked }))}
                />
                Has own vehicle
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.requiresMaxSpeed}
                  onChange={(e) => setForm((f) => ({ ...f, requiresMaxSpeed: e.target.checked }))}
                />
                Requires max speed
              </label>
            </div>
            <div className="md:col-span-2">
              <span className="text-sm font-medium">Onboarding documents</span>
              <p className="mt-1 text-xs text-slate-500">
                Required documents must be uploaded. Optional documents can be skipped by riders.
              </p>
              <div className="mt-3 space-y-3">
                {assignableDocs.map((doc) => {
                  const mode = form.docModes[doc.code] ?? "off";
                  return (
                    <div
                      key={doc.code}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="text-sm">
                        <span className="font-medium text-slate-800">{doc.label}</span>
                        <span className="ml-2 font-mono text-xs text-slate-500">({doc.code})</span>
                      </div>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                        {DOC_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => onSetDocMode(doc.code, option.value)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                              mode === option.value
                                ? option.value === "required"
                                  ? "bg-emerald-600 text-white"
                                  : option.value === "optional"
                                    ? "bg-amber-500 text-white"
                                    : "bg-slate-700 text-white"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
