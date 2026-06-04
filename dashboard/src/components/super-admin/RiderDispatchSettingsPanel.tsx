"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Car, Loader2, Package, Save, UtensilsCrossed } from "lucide-react";
import { formatRadiusDisplay, parseRadiusToMeters } from "@/lib/rider-dispatch-radius";
import {
  cloneDispatchForm,
  DISPATCH_SERVICE_TYPES,
  emptyServiceForm,
  fetchDispatchWaveSettings,
  isDispatchFormDirty,
  type DispatchServiceType,
  type ServiceFormState,
} from "@/lib/rider-dispatch-settings-form";

export type RiderDispatchPanelHandle = {
  saveAllDirty: () => Promise<{ ok: boolean; error?: string }>;
  resetAllToSaved: () => void;
  hasDirty: boolean;
};

type Props = {
  initial: {
    forms: Record<string, ServiceFormState>;
    savedForms: Record<string, ServiceFormState>;
  } | null;
  onDirtyChange?: (dirty: boolean) => void;
};

const SERVICE_META: Record<
  DispatchServiceType,
  { label: string; tabLabel: string; icon: React.ElementType; accent: string }
> = {
  food: {
    label: "Food",
    tabLabel: "Food Delivery",
    icon: UtensilsCrossed,
    accent: "from-emerald-500 to-teal-600",
  },
  parcel: {
    label: "Parcel",
    tabLabel: "Parcel Delivery",
    icon: Package,
    accent: "from-sky-500 to-blue-600",
  },
  person_ride: {
    label: "Ride",
    tabLabel: "Person Ride",
    icon: Car,
    accent: "from-violet-500 to-indigo-600",
  },
};

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${
        checked ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export const RiderDispatchSettingsPanel = forwardRef<RiderDispatchPanelHandle, Props>(
  function RiderDispatchSettingsPanel({ initial, onDirtyChange }, ref) {
    const [forms, setForms] = useState<Record<string, ServiceFormState>>({});
    const [savedForms, setSavedForms] = useState<Record<string, ServiceFormState>>({});
    const [hydrated, setHydrated] = useState(false);
    const [saving, setSaving] = useState<string | null>(null);
    const [savingAll, setSavingAll] = useState(false);
    const [activeTab, setActiveTab] = useState<DispatchServiceType>("food");

    useEffect(() => {
      if (initial && !hydrated) {
        setForms(initial.forms);
        setSavedForms(initial.savedForms);
        setHydrated(true);
      }
    }, [initial, hydrated]);

    const dirtyByService = useMemo(() => {
      const map: Record<DispatchServiceType, boolean> = {
        food: false,
        parcel: false,
        person_ride: false,
      };
      for (const st of DISPATCH_SERVICE_TYPES) {
        map[st] = isDispatchFormDirty(forms[st] ?? emptyServiceForm(), savedForms[st]);
      }
      return map;
    }, [forms, savedForms]);

    const hasDirty = useMemo(
      () => DISPATCH_SERVICE_TYPES.some((st) => dirtyByService[st]),
      [dirtyByService]
    );

    useEffect(() => {
      onDirtyChange?.(hasDirty);
    }, [hasDirty, onDirtyChange]);

    const patchForm = (serviceType: DispatchServiceType, patch: Partial<ServiceFormState>) => {
      setForms((prev) => ({
        ...prev,
        [serviceType]: { ...(prev[serviceType] ?? emptyServiceForm()), ...patch },
      }));
    };

    const patchExpansion = (
      serviceType: DispatchServiceType,
      waveNumber: number,
      value: string
    ) => {
      setForms((prev) => {
        const current = prev[serviceType] ?? emptyServiceForm();
        return {
          ...prev,
          [serviceType]: {
            ...current,
            expansion_radii: { ...current.expansion_radii, [waveNumber]: value },
          },
        };
      });
    };

    const applyReload = useCallback(async () => {
      const result = await fetchDispatchWaveSettings();
      if (result.ok) {
        setForms(result.forms);
        setSavedForms(result.savedForms);
      }
      return result;
    }, []);

    const saveService = async (
      serviceType: DispatchServiceType
    ): Promise<{ ok: boolean; error?: string }> => {
      const form = forms[serviceType] ?? emptyServiceForm();
      setSaving(serviceType);

      try {
        const interval = Number(form.wave_interval_seconds);
        const maxWaves = Number(form.max_waves);
        if (!Number.isFinite(interval) || interval < 5 || interval > 600) {
          return { ok: false, error: "Wave interval must be between 5 and 600 seconds." };
        }
        if (!Number.isFinite(maxWaves) || maxWaves < 1 || maxWaves > 10) {
          return { ok: false, error: "Max waves must be between 1 and 10." };
        }

        let wave1Meters: number;
        let maxRadiusMeters: number;
        try {
          wave1Meters = parseRadiusToMeters(form.wave1_radius);
          maxRadiusMeters = parseRadiusToMeters(form.max_radius_input);
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Invalid radius" };
        }

        const expansions: { wave_number: number; effective_radius_meters: number }[] = [];
        for (let w = 2; w <= maxWaves; w++) {
          const raw = form.expansion_radii[w]?.trim();
          if (!raw) {
            return {
              ok: false,
              error: `${SERVICE_META[serviceType].label}: enter radius for wave ${w}.`,
            };
          }
          try {
            const meters = parseRadiusToMeters(raw);
            if (meters <= wave1Meters && w === 2) {
              return {
                ok: false,
                error: `Wave 2 radius should exceed wave 1 (${formatRadiusDisplay(wave1Meters)}).`,
              };
            }
            expansions.push({ wave_number: w, effective_radius_meters: meters });
          } catch (e) {
            return {
              ok: false,
              error: e instanceof Error ? e.message : `Invalid radius for wave ${w}`,
            };
          }
        }

        const res = await fetch("/api/super-admin/rider-dispatch-waves", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "service_bundle",
            data: {
              service_type: serviceType,
              wave1_radius_input: form.wave1_radius,
              wave_interval_seconds: Math.round(interval),
              max_waves: Math.round(maxWaves),
              max_dispatch_radius_meters: maxRadiusMeters,
              enabled: form.enabled,
              ...(serviceType === "food" ? { rider_accept_flow: form.rider_accept_flow } : {}),
              expansions,
            },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          return { ok: false, error: data.error || "Save failed" };
        }
        await applyReload();
        return { ok: true };
      } finally {
        setSaving(null);
      }
    };

    const saveAllDirty = async (): Promise<{ ok: boolean; error?: string }> => {
      const dirty = DISPATCH_SERVICE_TYPES.filter((st) => dirtyByService[st]);
      if (dirty.length === 0) return { ok: true };
      setSavingAll(true);
      try {
        for (const st of dirty) {
          const result = await saveService(st);
          if (!result.ok) return result;
        }
        return { ok: true };
      } finally {
        setSavingAll(false);
      }
    };

    const resetAllToSaved = () => {
      setForms(
        Object.fromEntries(
          DISPATCH_SERVICE_TYPES.map((st) => [
            st,
            cloneDispatchForm(savedForms[st] ?? emptyServiceForm()),
          ])
        ) as Record<string, ServiceFormState>
      );
    };

    useImperativeHandle(
      ref,
      () => ({
        saveAllDirty,
        resetAllToSaved,
        hasDirty,
      }),
      [hasDirty, dirtyByService, forms, savedForms]
    );

    const activeForm = forms[activeTab] ?? emptyServiceForm();
    const maxWaves = Math.min(10, Math.max(1, Number(activeForm.max_waves) || 1));
    const expansionWaveNumbers = useMemo(
      () => Array.from({ length: Math.max(0, maxWaves - 1) }, (_, i) => i + 2),
      [maxWaves]
    );
    const activeDirty = dirtyByService[activeTab];
    const activeMeta = SERVICE_META[activeTab];

    if (!hydrated) {
      return null;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2">
          <p className="text-xs text-sky-900 leading-snug">
            Wave 1 = pickup radius. Waves 2+ expand if no rider accepts. Use &quot;3 km&quot; or
            &quot;1500 m&quot;. Settings apply live from the database.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
          {DISPATCH_SERVICE_TYPES.map((st) => {
            const meta = SERVICE_META[st];
            const Icon = meta.icon;
            const selected = activeTab === st;
            const dirty = dirtyByService[st];
            return (
              <button
                key={st}
                type="button"
                onClick={() => setActiveTab(st)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition ${
                  selected
                    ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80"
                    : "text-gray-600 hover:bg-white/70"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br ${meta.accent} text-white`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="hidden sm:inline">{meta.tabLabel}</span>
                <span className="sm:hidden">{meta.label}</span>
                {dirty ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2">
            <span className="text-xs font-semibold text-gray-700">Waves enabled</span>
            <Toggle
              checked={activeForm.enabled}
              onChange={(v) => patchForm(activeTab, { enabled: v })}
            />
          </div>

          <div className="space-y-4 p-4">
            {activeTab === "food" ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Rider accept flow
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: "before_merchant_accept" as const,
                        title: "Before merchant accepts",
                      },
                      {
                        value: "after_merchant_accept" as const,
                        title: "After merchant accepts",
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = activeForm.rider_accept_flow === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => patchForm(activeTab, { rider_accept_flow: opt.value })}
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition ${
                          selected
                            ? "border-violet-400 bg-violet-50 text-violet-900"
                            : "border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {opt.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">
                  Wave 1 radius
                </label>
                <input
                  type="text"
                  value={activeForm.wave1_radius}
                  onChange={(e) => patchForm(activeTab, { wave1_radius: e.target.value })}
                  className={inputClass}
                  placeholder="3 km"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">
                  Wait (sec)
                </label>
                <input
                  type="number"
                  min={5}
                  max={600}
                  value={activeForm.wave_interval_seconds}
                  onChange={(e) =>
                    patchForm(activeTab, { wave_interval_seconds: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">
                  Max waves
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={activeForm.max_waves}
                  onChange={(e) => patchForm(activeTab, { max_waves: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-gray-600">
                  Max radius cap
                </label>
                <input
                  type="text"
                  value={activeForm.max_radius_input}
                  onChange={(e) => patchForm(activeTab, { max_radius_input: e.target.value })}
                  className={inputClass}
                  placeholder="6 km"
                />
              </div>
            </div>

            {expansionWaveNumbers.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-medium text-gray-600">
                  Expansion (waves 2–{maxWaves})
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {expansionWaveNumbers.map((waveNum) => (
                    <div key={waveNum} className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-center text-[11px] font-semibold text-violet-700">
                        W{waveNum}
                      </span>
                      <input
                        type="text"
                        value={activeForm.expansion_radii[waveNum] ?? ""}
                        onChange={(e) => patchExpansion(activeTab, waveNum, e.target.value)}
                        className={inputClass}
                        placeholder="e.g. 5 km"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              {activeDirty ? (
                <span className="text-[11px] text-amber-600">Unsaved changes</span>
              ) : (
                <span className="text-[11px] text-gray-400">No changes</span>
              )}
              <button
                type="button"
                onClick={() => void saveService(activeTab)}
                disabled={!activeDirty || saving === activeTab || savingAll}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {saving === activeTab ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save {activeMeta.label}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

RiderDispatchSettingsPanel.displayName = "RiderDispatchSettingsPanel";
