"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Loader2,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PreventServiceCode } from "@/lib/db/operations/prevent-services-shared";

type SearchMode = "flat_search" | "lat_lng";

type PlaceHit = {
  placeId: string | null;
  locationName: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

type PreventRule = {
  id: string;
  searchType: SearchMode;
  placeId: string | null;
  locationName: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  status: "active" | "paused" | "expired" | "deleted";
  reason: string | null;
  reasonCustom: string | null;
  blockedServices: PreventServiceCode[];
  startsAt: string | null;
  endsAt: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  affectedMerchants?: number;
  affectedRiders?: number;
};

const SERVICE_OPTIONS: { code: PreventServiceCode; label: string }[] = [
  { code: "food", label: "Food" },
  { code: "grocery", label: "Grocery" },
  { code: "parcel", label: "Parcel" },
  { code: "ride", label: "Ride" },
  { code: "courier", label: "Courier" },
  { code: "pharmacy", label: "Pharmacy" },
];

const RADIUS_PRESETS: { label: string; meters: number | "custom" }[] = [
  { label: "100m", meters: 100 },
  { label: "250m", meters: 250 },
  { label: "500m", meters: 500 },
  { label: "1km", meters: 1000 },
  { label: "2km", meters: 2000 },
  { label: "5km", meters: 5000 },
  { label: "Custom", meters: "custom" },
];

const REASON_OPTIONS = [
  "Protest",
  "VIP Movement",
  "Flood",
  "Road Block",
  "Political Rally",
  "Maintenance",
  "Emergency",
  "Festival Restriction",
  "Railway station restrictions",
  "Airport restrictions",
  "Curfew",
  "Other",
];

function formatRadiusLabel(m: number): string {
  if (m >= 1000) {
    const km = m / 1000;
    return Number.isInteger(km) ? `${km}km` : `${km.toFixed(1)}km`;
  }
  return `${m}m`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** `datetime-local` needs local wall-clock `YYYY-MM-DDTHH:mm` (not UTC slice). */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local (local) back to ISO for the API. */
function fromDatetimeLocalValue(local: string): string | null {
  const v = local.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatWhenLines(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return {
      date: d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  } catch {
    return null;
  }
}

function statusBadge(status: PreventRule["status"]) {
  const styles: Record<PreventRule["status"], string> = {
    active: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    paused: "bg-amber-50 text-amber-800 ring-amber-600/20",
    expired: "bg-slate-100 text-slate-600 ring-slate-400/30",
    deleted: "bg-red-50 text-red-700 ring-red-600/20",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}

type FormState = {
  searchMode: SearchMode;
  placeQuery: string;
  placeId: string | null;
  locationName: string;
  address: string;
  latitude: string;
  longitude: string;
  radiusPreset: number | "custom";
  customRadius: string;
  customRadiusUnit: "m" | "km";
  blockedServices: PreventServiceCode[];
  reason: string;
  reasonCustom: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm = (): FormState => ({
  searchMode: "flat_search",
  placeQuery: "",
  placeId: null,
  locationName: "",
  address: "",
  latitude: "",
  longitude: "",
  radiusPreset: 500,
  customRadius: "",
  customRadiusUnit: "m",
  blockedServices: ["food", "grocery", "parcel"],
  reason: "Emergency",
  reasonCustom: "",
  startsAt: "",
  endsAt: "",
});

function formFromRule(r: PreventRule): FormState {
  const preset = RADIUS_PRESETS.find((p) => p.meters === r.radiusMeters);
  const isCustom = !preset || preset.meters === "custom";
  let customRadius = "";
  let customRadiusUnit: "m" | "km" = "m";
  if (isCustom) {
    if (r.radiusMeters >= 1000 && r.radiusMeters % 1000 === 0) {
      customRadius = String(r.radiusMeters / 1000);
      customRadiusUnit = "km";
    } else {
      customRadius = String(r.radiusMeters);
      customRadiusUnit = "m";
    }
  }
  return {
    searchMode: r.searchType,
    placeQuery: r.locationName,
    placeId: r.placeId,
    locationName: r.locationName,
    address: r.address ?? "",
    latitude: String(r.latitude),
    longitude: String(r.longitude),
    radiusPreset: preset && preset.meters !== "custom" ? (preset.meters as number) : "custom",
    customRadius,
    customRadiusUnit,
    blockedServices: [...r.blockedServices],
    reason: r.reason && REASON_OPTIONS.includes(r.reason) ? r.reason : r.reason ? "Other" : "Emergency",
    reasonCustom: r.reasonCustom ?? (r.reason && !REASON_OPTIONS.includes(r.reason) ? r.reason : ""),
    startsAt: toDatetimeLocalValue(r.startsAt),
    endsAt: toDatetimeLocalValue(r.endsAt),
  };
}

export function PreventServicesPanel() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<PreventRule[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [servicesMenuOpen, setServicesMenuOpen] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/prevent-services", { cache: "no-store" });
      const json = await res.json();
      if (res.status === 503 && json.migrationRequired) {
        setMigrationRequired(true);
        setRules([]);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Load failed");
      setMigrationRequired(false);
      const incoming = Array.isArray(json.rules) ? (json.rules as PreventRule[]) : [];
      // Deduplicate by id so React list keys stay unique if API ever returns overlaps.
      const seen = new Set<string>();
      const unique: PreventRule[] = [];
      for (const rule of incoming) {
        const id = typeof rule?.id === "string" && rule.id ? rule.id : "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(rule);
      }
      setRules(unique);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load prevent rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Instant refresh when any rule changes (same signal table the apps listen to).
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const { supabase } = await import("@/lib/supabase/client");
        const channel = supabase
          .channel("prevent-services-admin-signal")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "prevent_service_signals" },
            () => {
              void refresh();
            }
          )
          .subscribe();
        cleanup = () => {
          try {
            void supabase.removeChannel(channel);
          } catch {
            /* ignore */
          }
        };
      } catch {
        /* Realtime optional — polling below still covers expiry. */
      }
    })();
    const poll = setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      cleanup?.();
      clearInterval(poll);
    };
  }, [refresh]);

  const activeRules = useMemo(() => rules.filter((r) => r.status === "active"), [rules]);
  const liveServices = useMemo(() => {
    const set = new Set<PreventServiceCode>();
    for (const r of activeRules) for (const s of r.blockedServices) set.add(s);
    return [...set];
  }, [activeRules]);
  const totalAffectedMerchants = useMemo(
    () => activeRules.reduce((n, r) => n + (r.affectedMerchants ?? 0), 0),
    [activeRules]
  );
  const totalAffectedRiders = useMemo(
    () => activeRules.reduce((n, r) => n + (r.affectedRiders ?? 0), 0),
    [activeRules]
  );
  const nextExpiry = useMemo(() => {
    const times = activeRules
      .map((r) => r.endsAt)
      .filter((v): v is string => !!v)
      .map((v) => new Date(v).getTime())
      .filter((t) => Number.isFinite(t) && t > Date.now())
      .sort((a, b) => a - b);
    return times.length ? new Date(times[0]).toISOString() : null;
  }, [activeRules]);
  const earliestEffective = useMemo(() => {
    if (activeRules.length === 0) return null;
    const times = activeRules.map((r) => r.startsAt ?? r.createdAt);
    const sorted = [...times].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    return sorted[0] ?? null;
  }, [activeRules]);
  useEffect(() => {
    if (form.searchMode !== "flat_search") return;
    const q = form.placeQuery.trim();
    if (q.length < 2) {
      setPlaceHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/super-admin/prevent-services/place-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q }),
        });
        const json = await res.json();
        setPlaceHits(json.results ?? []);
      } catch {
        setPlaceHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.placeQuery, form.searchMode]);

  const radiusMeters = useMemo(() => {
    if (form.radiusPreset === "custom") {
      const n = Number(form.customRadius);
      if (!Number.isFinite(n) || n <= 0) return null;
      const meters = form.customRadiusUnit === "km" ? n * 1000 : n;
      return Math.round(meters);
    }
    return form.radiusPreset;
  }, [form.radiusPreset, form.customRadius, form.customRadiusUnit]);

  const openCreate = () => {
    setEditingId(null);
    setSaving(false);
    setServicesMenuOpen(false);
    setForm(emptyForm());
    setPlaceHits([]);
    setFormOpen(true);
  };

  const openEdit = (r: PreventRule) => {
    setEditingId(r.id);
    setSaving(false);
    setServicesMenuOpen(false);
    setForm(formFromRule(r));
    setPlaceHits([]);
    setFormOpen(true);
  };

  const pickPlace = (hit: PlaceHit) => {
    setForm((f) => ({
      ...f,
      placeId: hit.placeId,
      locationName: hit.locationName,
      address: hit.address ?? "",
      latitude: String(hit.latitude),
      longitude: String(hit.longitude),
      placeQuery: hit.locationName,
    }));
    setPlaceHits([]);
  };

  const toggleService = (code: PreventServiceCode) => {
    setForm((f) => ({
      ...f,
      blockedServices: f.blockedServices.includes(code)
        ? f.blockedServices.filter((c) => c !== code)
        : [...f.blockedServices, code],
    }));
  };

  const buildPayload = () => {
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (!form.locationName.trim()) throw new Error("Location name is required");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Valid coordinates are required");
    if (radiusMeters == null || radiusMeters < 50) throw new Error("Select a radius (min 50m)");
    if (form.blockedServices.length === 0) throw new Error("Select at least one service to block");
    const reason =
      form.reason === "Other" ? form.reasonCustom.trim() || "Other" : form.reason;
    return {
      searchType: form.searchMode,
      placeId: form.placeId,
      locationName: form.locationName.trim(),
      address: form.address.trim() || null,
      latitude: lat,
      longitude: lng,
      radiusMeters,
      blockedServices: form.blockedServices,
      reason,
      reasonCustom: form.reason === "Other" ? form.reasonCustom.trim() || null : null,
      startsAt: fromDatetimeLocalValue(form.startsAt),
      endsAt: fromDatetimeLocalValue(form.endsAt),
      status: "active" as const,
    };
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = editingId
        ? await fetch(`/api/super-admin/prevent-services/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/super-admin/prevent-services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success(editingId ? "Rule updated" : "Blocking rule created");
      setFormOpen(false);
      setSaving(false);
      setServicesMenuOpen(false);
      // Refresh after clearing spinner so the button never looks stuck.
      void refresh();
    } catch (e) {
      setSaving(false);
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const pauseOrResume = async (r: PreventRule) => {
    setRowBusy(r.id);
    try {
      const path = r.status === "paused" ? "resume" : "pause";
      const res = await fetch(`/api/super-admin/prevent-services/${r.id}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      toast.success(path === "pause" ? "Rule paused — services available again" : "Rule resumed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async (r: PreventRule) => {
    if (!window.confirm(`Delete block for “${r.locationName}”? Services become available immediately.`)) {
      return;
    }
    setRowBusy(r.id);
    try {
      const res = await fetch(`/api/super-admin/prevent-services/${r.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast.success("Rule deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/30 sm:rounded-2xl sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600/10 text-rose-700 ring-1 ring-rose-600/15">
              <ShieldAlert className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                Prevent Services
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:max-w-2xl">
                Control service availability for specific locations without affecting surrounding areas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-teal-600/20 bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add blocked location
          </button>
        </div>
      </div>

      {migrationRequired ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          Apply database migration <code className="font-mono text-xs">0476_prevent_services.sql</code>{" "}
          before using Prevent Services.
        </div>
      ) : null}

      {formOpen ? (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/30 sm:rounded-2xl sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {editingId ? "Edit / Update block" : "New blocked location"}
            </h3>
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
              onClick={() => {
                setFormOpen(false);
                setSaving(false);
                setServicesMenuOpen(false);
              }}
            >
              Cancel
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Search method">
            {(
              [
                ["flat_search", "Flat Search"],
                ["lat_lng", "Latitude / Longitude"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={form.searchMode === mode}
                onClick={() => setForm((f) => ({ ...f, searchMode: mode }))}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  form.searchMode === mode
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {form.searchMode === "flat_search" ? (
            <div className="relative mb-4">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Location search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={form.placeQuery}
                  onChange={(e) => setForm((f) => ({ ...f, placeQuery: e.target.value }))}
                  placeholder="Place, landmark, station, airport, mall, PIN…"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
                />
                {searching ? (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                ) : null}
              </div>
              {placeHits.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {placeHits.map((hit, i) => (
                    <li key={`${hit.placeId ?? i}-${hit.latitude}`}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => pickPlace(hit)}
                      >
                        <span className="text-sm font-medium text-slate-900">{hit.locationName}</span>
                        <span className="text-[11px] text-slate-500">{hit.address}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Latitude
                </label>
                <input
                  value={form.latitude}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      latitude: e.target.value,
                      locationName: f.locationName || `Lat ${e.target.value}`,
                    }))
                  }
                  placeholder="28.643336"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Longitude
                </label>
                <input
                  value={form.longitude}
                  onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                  placeholder="77.219687"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Location label
                </label>
                <input
                  value={form.locationName}
                  onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
                  placeholder="Custom area name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                />
              </div>
            </div>
          )}

          {(form.latitude || form.address) && form.searchMode === "flat_search" ? (
            <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                <div>
                  <p className="font-medium text-slate-800">{form.locationName || "Selected place"}</p>
                  {form.address ? <p className="mt-0.5">{form.address}</p> : null}
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {form.latitude}, {form.longitude}
                    {form.placeId ? ` · ${form.placeId}` : ""}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="relative z-20 mb-4 overflow-visible pb-1">
            <div className="flex w-full flex-nowrap items-end gap-2">
              {/* Blocking radius */}
              <div className="w-[112px] shrink-0">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Blocking radius
                </label>
                <select
                  value={form.radiusPreset === "custom" ? "custom" : String(form.radiusPreset)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      radiusPreset: v === "custom" ? "custom" : Number(v),
                    }));
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                >
                  {RADIUS_PRESETS.map((p) => (
                    <option
                      key={p.label}
                      value={p.meters === "custom" ? "custom" : String(p.meters)}
                    >
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.radiusPreset === "custom" ? (
                <div className="w-[128px] shrink-0">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Custom value
                  </label>
                  <div className="flex h-10 overflow-hidden rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-teal-600/30">
                    <input
                      value={form.customRadius}
                      onChange={(e) => setForm((f) => ({ ...f, customRadius: e.target.value }))}
                      placeholder="e.g. 750"
                      inputMode="decimal"
                      className="min-w-0 flex-1 px-2 text-sm outline-none"
                    />
                    <select
                      value={form.customRadiusUnit}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customRadiusUnit: e.target.value === "km" ? "km" : "m",
                        }))
                      }
                      className="w-[48px] border-l border-slate-200 bg-slate-50 px-1 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="m">m</option>
                      <option value="km">km</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {/* Blocked services multi-select */}
              <div className={cn("relative w-[150px] shrink-0", servicesMenuOpen && "z-50")}>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Blocked services
                </label>
                <button
                  type="button"
                  onClick={() => setServicesMenuOpen((o) => !o)}
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-sm outline-none hover:bg-slate-50 focus:ring-2 focus:ring-teal-600/30"
                >
                  <span className="truncate text-slate-800">
                    {form.blockedServices.length === 0
                      ? "Select services"
                      : form.blockedServices.length === SERVICE_OPTIONS.length
                        ? "All services"
                        : `${form.blockedServices.length} selected`}
                  </span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </button>
                {servicesMenuOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="Close services menu"
                      className="fixed inset-0 z-20 cursor-default"
                      onClick={() => setServicesMenuOpen(false)}
                    />
                    <ul className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-56 w-[190px] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                      {SERVICE_OPTIONS.map((s) => {
                        const on = form.blockedServices.includes(s.code);
                        return (
                          <li key={s.code}>
                            <button
                              type="button"
                              onClick={() => toggleService(s.code)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span
                                className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                                  on
                                    ? "border-rose-500 bg-rose-500 text-white"
                                    : "border-slate-300 text-transparent"
                                )}
                              >
                                ✓
                              </span>
                              <span className={on ? "font-medium text-slate-900" : "text-slate-600"}>
                                {s.label}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </div>

              {/* Reason */}
              <div className="min-w-[145px] flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Reason
                </label>
                <select
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                >
                  {REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start */}
              <div className="w-[180px] shrink-0">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Start (optional)
                </label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                />
              </div>

              {/* End */}
              <div className="w-[180px] shrink-0">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  End (optional)
                </label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
                />
              </div>
            </div>
          </div>

          {form.reason === "Other" ? (
            <div className="mb-4 max-w-md">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Custom reason
              </label>
              <input
                value={form.reasonCustom}
                onChange={(e) => setForm((f) => ({ ...f, reasonCustom: e.target.value }))}
                placeholder="Describe the restriction"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-teal-600/30"
              />
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setSaving(false);
                setServicesMenuOpen(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {editingId ? "Updating…" : "Creating…"}
                </>
              ) : editingId ? (
                "Update"
              ) : (
                "Create block"
              )}
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/30 sm:rounded-2xl">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Live impact</h3>
              <p className="text-[11px] text-slate-500">
                Area-level only — merchants and riders keep serving every unblocked area in their
                radius. Updates instantly when rules change.
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                activeRules.length > 0
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
                  : "bg-slate-100 text-slate-600 ring-slate-400/30"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  activeRules.length > 0 ? "animate-pulse bg-emerald-500" : "bg-slate-400"
                )}
              />
              {activeRules.length > 0 ? "Live · Active" : "Idle"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Active blocked areas
              </p>
              <p className="text-lg font-semibold text-slate-900">{activeRules.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Affected merchants
              </p>
              <p className="text-lg font-semibold text-slate-900">{totalAffectedMerchants}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Affected riders
              </p>
              <p className="text-lg font-semibold text-slate-900">{totalAffectedRiders}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Active blocked services
              </p>
              <p className="mt-0.5 flex flex-wrap gap-1">
                {liveServices.length === 0 ? (
                  <span className="text-sm text-slate-400">None</span>
                ) : (
                  liveServices.map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700"
                    >
                      {s}
                    </span>
                  ))
                )}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Effective time
              </p>
              <p className="text-xs font-medium text-slate-800">
                {earliestEffective
                  ? formatWhen(earliestEffective) === "—"
                    ? "Immediate"
                    : formatWhen(earliestEffective)
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Expiry
              </p>
              <p className="text-xs font-medium text-slate-800">
                {nextExpiry ? formatWhen(nextExpiry) : "No schedule"}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-900">Blocked locations</h3>
          <p className="text-[11px] text-slate-500">
            Multiple rules can be active at once. Nearest matching rule wins messaging; any match
            keeps that service unavailable inside its radius.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : rules.length === 0 ? (
          <div className="px-4 py-12 text-center sm:px-5">
            <Ban className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">No blocked locations yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Add a place or coordinates to instantly disable services inside a radius.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-5 py-3.5">Location</th>
                  <th className="px-4 py-3.5">Radius</th>
                  <th className="px-4 py-3.5">Services</th>
                  <th className="px-4 py-3.5 text-center">Merchants</th>
                  <th className="px-4 py-3.5 text-center">Riders</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Effective</th>
                  <th className="px-4 py-3.5">Expires</th>
                  <th className="px-4 py-3.5">Created by</th>
                  <th className="sticky right-0 z-10 bg-slate-50 px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r, rowIndex) => {
                  const effective = formatWhenLines(r.startsAt);
                  const expires = formatWhenLines(r.endsAt);
                  const rowKey = r.id ? `prevent-rule-${r.id}` : `prevent-rule-row-${rowIndex}`;
                  return (
                    <tr key={rowKey} className="group align-top transition-colors hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-white px-5 py-4 group-hover:bg-slate-50/70">
                        <p className="max-w-[220px] font-semibold leading-snug text-slate-900">
                          {r.locationName}
                        </p>
                        {r.address ? (
                          <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-slate-500 line-clamp-2">
                            {r.address}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {r.searchType === "flat_search" ? "Flat search" : "Lat/Lng"}
                          </span>
                          {r.reason ? (
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              {r.reason}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-800">
                        {formatRadiusLabel(r.radiusMeters)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-[200px] flex-wrap gap-1.5">
                          {(r.blockedServices ?? []).map((s, serviceIndex) => (
                            <span
                              key={`${rowKey}-svc-${s}-${serviceIndex}`}
                              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-600/15"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-center text-sm font-medium text-slate-800">
                        {r.status === "active" ? r.affectedMerchants ?? "—" : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-center text-sm font-medium text-slate-800">
                        {r.status === "active" ? r.affectedRiders ?? "—" : "—"}
                      </td>
                      <td className="px-4 py-4">{statusBadge(r.status)}</td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {effective ? (
                          <div>
                            <p className="text-xs font-medium text-slate-800">{effective.date}</p>
                            <p className="text-[11px] text-slate-500">{effective.time}</p>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-600">Immediate</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {expires ? (
                          <div>
                            <p className="text-xs font-medium text-slate-800">{expires.date}</p>
                            <p className="text-[11px] text-slate-500">{expires.time}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-xs font-medium text-slate-700">{r.createdByName || "—"}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          Updated {formatWhen(r.updatedAt)}
                        </p>
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-5 py-4 group-hover:bg-slate-50/70">
                        <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
                          <button
                            type="button"
                            title="Edit"
                            disabled={rowBusy === r.id}
                            onClick={() => openEdit(r)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            title={r.status === "paused" ? "Resume" : "Pause"}
                            disabled={rowBusy === r.id || r.status === "expired"}
                            onClick={() => void pauseOrResume(r)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                          >
                            {r.status === "paused" ? (
                              <Play className="h-3.5 w-3.5" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                            {r.status === "paused" ? "Resume" : "Pause"}
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            disabled={rowBusy === r.id}
                            onClick={() => void remove(r)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 shadow-sm hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
