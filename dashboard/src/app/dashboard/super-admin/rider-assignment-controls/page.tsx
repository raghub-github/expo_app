"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Car,
  CheckCircle2,
  Info,
  Layers,
  Loader2,
  MapPin,
  Package,
  Radio,
  RefreshCw,
  Save,
  Shield,
  Store,
  Truck,
  UserCheck,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import {
  RiderDispatchSettingsPanel,
  type RiderDispatchPanelHandle,
} from "@/components/super-admin/RiderDispatchSettingsPanel";
import { buildServiceAssignmentRuleSummary } from "@/lib/service-assignment-rule-summary";
import {
  fetchDispatchWaveSettings,
  type ServiceFormState,
} from "@/lib/rider-dispatch-settings-form";

type ServiceType = "food" | "parcel" | "person_ride";

type ServiceLimitRow = {
  service_type: ServiceType;
  max_active_assignments: number;
  exclusive_mode: boolean;
};

type GlobalAssignmentSettings = {
  allow_cross_service_assignments: boolean;
  person_ride_exclusive_mode: boolean;
};

type MainPanel = "assignment" | "geo" | "dispatch";

type GeoRuleRow = {
  id: number;
  service_type: ServiceType;
  milestone_key: string;
  radius_meters: number;
  is_active: boolean;
};

const SERVICE_TYPES: ServiceType[] = ["food", "parcel", "person_ride"];

const SERVICE_CONFIG: Record<
  ServiceType,
  {
    label: string;
    tabLabel: string;
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    tabActiveBorder: string;
    description: string;
    limitLabel: string;
  }
> = {
  food: {
    label: "Food delivery",
    tabLabel: "Food Delivery",
    icon: UtensilsCrossed,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    tabActiveBorder: "border-emerald-500 text-emerald-700",
    description: "Maximum concurrent active food orders per rider",
    limitLabel: "Max active orders",
  },
  parcel: {
    label: "Parcel delivery",
    tabLabel: "Parcel Delivery",
    icon: Package,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
    tabActiveBorder: "border-sky-500 text-sky-700",
    description: "Maximum concurrent active parcel orders per rider",
    limitLabel: "Max active orders",
  },
  person_ride: {
    label: "Person ride",
    tabLabel: "Person Ride",
    icon: Car,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    tabActiveBorder: "border-violet-500 text-violet-700",
    description: "Maximum concurrent active person rides per rider",
    limitLabel: "Max active rides",
  },
};

const MILESTONE_LABELS: Record<string, string> = {
  reach_store: "Reach Store",
  mark_picked_up: "Mark Picked Up",
  reach_customer: "Reach Customer",
  mark_delivered: "Mark Delivered",
  reach_pickup: "Reach Pickup",
  pickup_confirmation: "Pickup Confirmation",
  reach_drop: "Reach Drop",
  delivery_confirmation: "Delivery Confirmation",
  start_ride: "Start Ride",
  reach_destination: "Reach Destination",
  complete_ride: "Complete Ride",
};

const MILESTONE_DESCRIPTIONS: Record<string, string> = {
  reach_store: "Maximum distance rider must be from restaurant before marking arrival",
  mark_picked_up: "Distance threshold for confirming pickup at restaurant",
  reach_customer: "Maximum distance from customer location for delivery",
  mark_delivered: "Distance threshold for marking order as delivered",
  reach_pickup: "Maximum distance rider must be from pickup location",
  pickup_confirmation:
    "Distance threshold for confirming pickup OTP (parcel / person ride)",
  reach_drop: "Maximum distance from drop location for delivery",
  delivery_confirmation: "Distance threshold for marking parcel as delivered",
  start_ride: "Maximum distance from pickup before starting the ride",
  reach_destination: "Maximum distance from destination before arrival",
  complete_ride: "Distance threshold for completing the ride",
};

const DEFAULT_LIMITS: ServiceLimitRow[] = [
  { service_type: "food", max_active_assignments: 2, exclusive_mode: false },
  { service_type: "parcel", max_active_assignments: 2, exclusive_mode: false },
  { service_type: "person_ride", max_active_assignments: 1, exclusive_mode: true },
];

const DEFAULT_GLOBAL: GlobalAssignmentSettings = {
  allow_cross_service_assignments: false,
  person_ride_exclusive_mode: true,
};

const DEFAULT_GEO_RADII: Record<string, number> = {
  reach_store: 500,
  mark_picked_up: 300,
  reach_customer: 200,
  mark_delivered: 150,
  reach_pickup: 500,
  pickup_confirmation: 300,
  reach_drop: 200,
  delivery_confirmation: 150,
  start_ride: 300,
  reach_destination: 200,
  complete_ride: 150,
};

function cloneLimits(rows: ServiceLimitRow[]): ServiceLimitRow[] {
  return rows.map((r) => ({ ...r }));
}

function cloneGlobal(g: GlobalAssignmentSettings): GlobalAssignmentSettings {
  return { ...g };
}

function assignmentBundleDirty(
  limits: ServiceLimitRow[],
  savedLimits: ServiceLimitRow[],
  global: GlobalAssignmentSettings | null,
  savedGlobal: GlobalAssignmentSettings | null
): boolean {
  if (!global || !savedGlobal) return false;
  return (
    JSON.stringify({ limits, global }) !==
    JSON.stringify({ limits: savedLimits, global: savedGlobal })
  );
}

function geoRowDirty(row: GeoRuleRow, saved: GeoRuleRow | undefined): boolean {
  if (!saved) return false;
  return (
    row.radius_meters !== saved.radius_meters || row.is_active !== saved.is_active
  );
}

function milestoneIcon(key: string): React.ElementType {
  if (key.includes("store") || key.includes("picked")) return Store;
  if (key.includes("customer") || key.includes("destination")) return UserCheck;
  if (key.includes("pickup") || key.includes("drop")) return MapPin;
  if (key.includes("delivered") || key.includes("confirmation") || key.includes("complete"))
    return CheckCircle2;
  if (key.includes("ride") || key.includes("start")) return Car;
  return Truck;
}

export default function RiderAssignmentControlsPage() {
  const searchParams = useSearchParams();
  const dispatchRef = useRef<RiderDispatchPanelHandle>(null);

  const [limits, setLimits] = useState<ServiceLimitRow[]>([]);
  const [savedLimits, setSavedLimits] = useState<ServiceLimitRow[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalAssignmentSettings | null>(null);
  const [savedGlobalSettings, setSavedGlobalSettings] = useState<GlobalAssignmentSettings | null>(
    null
  );

  const [geoRows, setGeoRows] = useState<GeoRuleRow[]>([]);
  const [savedGeoRows, setSavedGeoRows] = useState<GeoRuleRow[]>([]);
  const [geoTab, setGeoTab] = useState<ServiceType>("food");
  const [mainPanel, setMainPanel] = useState<MainPanel>("assignment");

  const [pageReady, setPageReady] = useState(false);
  const [dispatchBootstrap, setDispatchBootstrap] = useState<{
    forms: Record<string, ServiceFormState>;
    savedForms: Record<string, ServiceFormState>;
  } | null>(null);
  const [dispatchDirty, setDispatchDirty] = useState(false);
  const [savingDispatch, setSavingDispatch] = useState(false);

  const [savingAssignment, setSavingAssignment] = useState(false);
  const [savingGeoKey, setSavingGeoKey] = useState<string | null>(null);
  const [savingAllGeo, setSavingAllGeo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel === "assignment" || panel === "geo" || panel === "dispatch") {
      setMainPanel(panel);
    }
  }, [searchParams]);

  const loadAssignment = useCallback(async () => {
    const res = await fetch("/api/super-admin/rider-assignment-controls");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Load failed");
    const limitRows = (data.limits as Array<Record<string, unknown>>).map((r) => ({
      service_type: String(r.service_type) as ServiceType,
      max_active_assignments: Number(r.max_active_assignments),
      exclusive_mode: Boolean(r.exclusive_mode),
    }));
    const g = data.global as Record<string, unknown>;
    const normalizedGlobal: GlobalAssignmentSettings = {
      allow_cross_service_assignments: Boolean(g.allow_cross_service_assignments),
      person_ride_exclusive_mode: Boolean(g.person_ride_exclusive_mode),
    };
    setLimits(limitRows);
    setSavedLimits(cloneLimits(limitRows));
    setGlobalSettings(normalizedGlobal);
    setSavedGlobalSettings(cloneGlobal(normalizedGlobal));
  }, []);

  const loadGeo = useCallback(async () => {
    const res = await fetch("/api/super-admin/rider-status-geo-fence");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Load failed");
    const normalized = (data.rows as GeoRuleRow[]).map((r) => ({
      id: Number(r.id),
      service_type: r.service_type as ServiceType,
      milestone_key: String(r.milestone_key),
      radius_meters: Number(r.radius_meters),
      is_active: Boolean(r.is_active),
    }));
    setGeoRows(normalized);
    setSavedGeoRows(normalized.map((r) => ({ ...r })));
  }, []);

  const loadAll = useCallback(async () => {
    setPageReady(false);
    setMessage(null);
    const errors: string[] = [];
    try {
      const results = await Promise.allSettled([
        loadAssignment(),
        loadGeo(),
        fetchDispatchWaveSettings(),
      ]);
      if (results[0].status === "rejected") {
        errors.push(
          results[0].reason instanceof Error
            ? results[0].reason.message
            : "Assignment settings load failed"
        );
      }
      if (results[1].status === "rejected") {
        errors.push(
          results[1].reason instanceof Error ? results[1].reason.message : "Geo rules load failed"
        );
      }
      if (results[2].status === "fulfilled") {
        const dispatchResult = results[2].value;
        if (!dispatchResult.ok) {
          errors.push(dispatchResult.error ?? "Dispatch settings load failed");
        } else {
          setDispatchBootstrap({
            forms: dispatchResult.forms,
            savedForms: dispatchResult.savedForms,
          });
        }
      } else {
        errors.push(
          results[2].reason instanceof Error
            ? results[2].reason.message
            : "Dispatch settings load failed"
        );
      }
      if (errors.length > 0) {
        setMessage(errors[0]);
      }
    } finally {
      setPageReady(true);
    }
  }, [loadAssignment, loadGeo]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const assignmentIsDirty = useMemo(
    () => assignmentBundleDirty(limits, savedLimits, globalSettings, savedGlobalSettings),
    [limits, savedLimits, globalSettings, savedGlobalSettings]
  );

  const ruleSummary = useMemo(() => {
    if (!globalSettings || limits.length === 0) return [];
    return buildServiceAssignmentRuleSummary(limits, globalSettings);
  }, [limits, globalSettings]);

  const assignmentSummaryItems = useMemo(() => {
    const byType = Object.fromEntries(limits.map((l) => [l.service_type, l])) as Record<
      string,
      ServiceLimitRow
    >;
    const items: { label: string; value: string }[] = [];
    for (const st of SERVICE_TYPES) {
      const row = byType[st];
      const cfg = SERVICE_CONFIG[st];
      if (!row) continue;
      items.push({
        label: `${cfg.label} max active ${st === "person_ride" ? "rides" : "orders"}`,
        value: String(row.max_active_assignments),
      });
    }
    if (globalSettings) {
      items.push({
        label: "Cross-service assignments",
        value: globalSettings.allow_cross_service_assignments ? "Enabled" : "Disabled",
      });
      items.push({
        label: "Person ride exclusive mode",
        value: globalSettings.person_ride_exclusive_mode ? "Enabled" : "Disabled",
      });
    }
    return items;
  }, [limits, globalSettings]);

  const savedGeoById = useMemo(() => {
    const m = new Map<number, GeoRuleRow>();
    for (const r of savedGeoRows) m.set(r.id, r);
    return m;
  }, [savedGeoRows]);

  const dirtyGeoRows = useMemo(
    () => geoRows.filter((row) => geoRowDirty(row, savedGeoById.get(row.id))),
    [geoRows, savedGeoById]
  );

  const dirtyGeoByService = useMemo(() => {
    const map: Record<ServiceType, boolean> = {
      food: false,
      parcel: false,
      person_ride: false,
    };
    for (const row of dirtyGeoRows) {
      map[row.service_type] = true;
    }
    return map;
  }, [dirtyGeoRows]);

  const geoHasDirty = dirtyGeoRows.length > 0;

  const activeGeoRows = useMemo(
    () => geoRows.filter((r) => r.service_type === geoTab),
    [geoRows, geoTab]
  );

  const geoMilestoneCounts = useMemo(() => {
    const counts: Record<ServiceType, number> = { food: 0, parcel: 0, person_ride: 0 };
    for (const row of geoRows) {
      if (row.is_active) counts[row.service_type] += 1;
    }
    return counts;
  }, [geoRows]);

  const saveAssignment = async () => {
    if (!globalSettings || !assignmentIsDirty) return;
    setSavingAssignment(true);
    setMessage(null);
    try {
      const res = await fetch("/api/super-admin/rider-assignment-controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limits: limits.map((l) => ({
            service_type: l.service_type,
            max_active_assignments: l.max_active_assignments,
            exclusive_mode: l.exclusive_mode,
          })),
          allow_cross_service_assignments: globalSettings.allow_cross_service_assignments,
          person_ride_exclusive_mode: globalSettings.person_ride_exclusive_mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("Assignment controls saved.");
      await loadAssignment();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingAssignment(false);
    }
  };

  const saveGeoRow = async (row: GeoRuleRow) => {
    const saved = savedGeoById.get(row.id);
    if (!geoRowDirty(row, saved)) return;

    const key = `${row.service_type}:${row.milestone_key}`;
    setSavingGeoKey(key);
    setMessage(null);
    try {
      const res = await fetch("/api/super-admin/rider-status-geo-fence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_type: row.service_type,
          milestone_key: row.milestone_key,
          radius_meters: row.radius_meters,
          is_active: row.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage(`Saved ${MILESTONE_LABELS[row.milestone_key] ?? row.milestone_key}.`);
      await loadGeo();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingGeoKey(null);
    }
  };

  const saveAllGeo = async () => {
    if (dirtyGeoRows.length === 0) return;
    setSavingAllGeo(true);
    setMessage(null);
    try {
      for (const row of dirtyGeoRows) {
        const res = await fetch("/api/super-admin/rider-status-geo-fence", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_type: row.service_type,
            milestone_key: row.milestone_key,
            radius_meters: row.radius_meters,
            is_active: row.is_active,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Save failed");
      }
      setMessage("All geo-fence changes saved.");
      await loadGeo();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingAllGeo(false);
    }
  };

  const resetAssignmentToDefaults = () => {
    setLimits(cloneLimits(DEFAULT_LIMITS));
    setGlobalSettings(cloneGlobal(DEFAULT_GLOBAL));
    setMessage(null);
  };

  const resetGeoToDefaults = () => {
    setGeoRows((prev) =>
      prev.map((r) => ({
        ...r,
        radius_meters: DEFAULT_GEO_RADII[r.milestone_key] ?? r.radius_meters,
        is_active: true,
      }))
    );
    setMessage(null);
  };

  const resetDispatchToSaved = () => {
    dispatchRef.current?.resetAllToSaved();
    setMessage(null);
  };

  const saveDispatch = async () => {
    if (!dispatchRef.current?.hasDirty) return;
    setSavingDispatch(true);
    setMessage(null);
    try {
      const result = await dispatchRef.current.saveAllDirty();
      if (result.ok) {
        setMessage("Dispatch settings saved.");
      } else {
        setMessage(result.error ?? "Save failed");
      }
    } finally {
      setSavingDispatch(false);
    }
  };

  const footerReset = () => {
    if (mainPanel === "assignment") resetAssignmentToDefaults();
    else if (mainPanel === "geo") resetGeoToDefaults();
    else resetDispatchToSaved();
  };

  const footerCanSave =
    mainPanel === "assignment"
      ? assignmentIsDirty
      : mainPanel === "geo"
        ? geoHasDirty
        : dispatchDirty;

  const footerSaving =
    mainPanel === "assignment"
      ? savingAssignment
      : mainPanel === "geo"
        ? savingAllGeo
        : savingDispatch;

  const footerSave = () => {
    if (mainPanel === "assignment") void saveAssignment();
    else if (mainPanel === "geo") void saveAllGeo();
    else void saveDispatch();
  };

  const footerSaveLabel =
    mainPanel === "geo" ? "Save All Changes" : "Save Changes";

  const isSuccessMsg =
    message?.startsWith("Saved") ||
    message?.includes("saved") ||
    message?.includes("Saved");

  const pageSubtitle =
    mainPanel === "assignment"
      ? "Configure service-based assignment limits and global assignment rules for rider dispatch"
      : mainPanel === "geo"
        ? "Configure geo-fenced radius controls for rider status updates across all services"
        : "Pickup radius and dispatch wave expansion per service (food / parcel / ride)";

  return (
    <div className="-m-3 sm:-m-4 min-h-full bg-[#f4f5f7] p-3 sm:p-4 pb-10 min-w-0 w-full space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <p className="min-w-0 flex-1 text-xs text-gray-600 max-w-2xl leading-snug">{pageSubtitle}</p>

        <div
          className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm"
          role="tablist"
          aria-label="Control section"
        >
          <ViewToggleButton
            active={mainPanel === "assignment"}
            onClick={() => setMainPanel("assignment")}
            label="Assignment limits"
            icon={Layers}
            activeClass="bg-violet-50 text-violet-700 ring-1 ring-violet-200"
            iconActiveClass="text-violet-600"
          />
          <ViewToggleButton
            active={mainPanel === "geo"}
            onClick={() => setMainPanel("geo")}
            label="Geo-fenced status"
            icon={MapPin}
            activeClass="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            iconActiveClass="text-emerald-600"
            showDot={geoHasDirty}
          />
          <ViewToggleButton
            active={mainPanel === "dispatch"}
            onClick={() => setMainPanel("dispatch")}
            label="Dispatch settings"
            icon={Radio}
            activeClass="bg-sky-50 text-sky-700 ring-1 ring-sky-200"
            iconActiveClass="text-sky-600"
            showDot={dispatchDirty}
          />
        </div>
      </div>

      {message ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
            isSuccessMsg
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
              : "bg-red-50 text-red-700 ring-1 ring-red-200/80"
          }`}
        >
          {isSuccessMsg ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <Info className="h-4 w-4 shrink-0" />
          )}
          {message}
        </div>
      ) : null}

      {!pageReady ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-sm text-gray-500 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          Loading rider controls…
        </div>
      ) : mainPanel === "assignment" ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-3">
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-2">
                <h2 className="text-sm font-semibold text-gray-900">Service Assignment Limits</h2>
                <p className="text-xs text-gray-500">
                  Max active assignments per service type
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {globalSettings && limits.length > 0 ? (
                  SERVICE_TYPES.map((st) => {
                    const row = limits.find((l) => l.service_type === st);
                    const cfg = SERVICE_CONFIG[st];
                    const Icon = cfg.icon;
                    if (!row) return null;
                    return (
                      <div
                        key={st}
                        className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:flex-nowrap"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}
                        >
                          <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{cfg.label}</p>
                          <p className="text-xs text-gray-500 leading-snug">{cfg.description}</p>
                        </div>
                        <label className="shrink-0">
                          <span className="block text-[10px] font-medium text-gray-500 mb-1 text-right">
                            {cfg.limitLabel}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="w-20 rounded-md border border-gray-200 bg-gray-50/50 px-2 py-1.5 text-sm font-medium tabular-nums text-gray-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
                            value={row.max_active_assignments}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setLimits((prev) =>
                                prev.map((l) =>
                                  l.service_type === st
                                    ? { ...l, max_active_assignments: v }
                                    : l
                                )
                              );
                            }}
                          />
                        </label>
                      </div>
                    );
                  })
                ) : (
                  <p className="px-4 py-4 text-xs text-red-600">
                    Service assignment limits unavailable. Run migration 0285.
                  </p>
                )}
              </div>

              <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-2">
                <h2 className="text-sm font-semibold text-gray-900">Global Assignment Rules</h2>
                <p className="text-xs text-gray-500">Cross-service and exclusive behavior</p>
              </div>
              <div className="divide-y divide-gray-100 px-4">
                {globalSettings ? (
                  <>
                    <RuleToggleRow
                      icon={Zap}
                      iconBg="bg-violet-50"
                      iconColor="text-violet-600"
                      label="Allow cross-service assignments"
                      hint="Riders can accept orders from different services at once"
                      checked={globalSettings.allow_cross_service_assignments}
                      onChange={(v) =>
                        setGlobalSettings((g) =>
                          g ? { ...g, allow_cross_service_assignments: v } : g
                        )
                      }
                      accent="violet"
                    />
                    <RuleToggleRow
                      icon={Shield}
                      iconBg="bg-amber-50"
                      iconColor="text-amber-600"
                      label="Person ride exclusive mode"
                      hint="Active person rides block food/parcel and vice versa"
                      checked={globalSettings.person_ride_exclusive_mode}
                      onChange={(v) =>
                        setGlobalSettings((g) =>
                          g ? { ...g, person_ride_exclusive_mode: v } : g
                        )
                      }
                      accent="violet"
                    />
                  </>
                ) : null}
              </div>
            </section>

            <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2">
              <Info className="h-4 w-4 shrink-0 text-violet-600 mt-0.5" />
              <p className="text-xs text-violet-900 leading-snug">
                Changes apply immediately to dispatch. Active trips are unaffected until the next
                assignment.
              </p>
            </div>
          </div>

          <aside className="space-y-3">
            <SidebarCard title="Current Rule Summary">
              <ul className="space-y-1.5">
                {assignmentSummaryItems.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-gray-600 leading-snug">{item.label}</span>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                      {item.value}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 ring-1 ring-emerald-200/60">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-emerald-900">Configuration Status</p>
                  <p className="text-[10px] text-emerald-700 leading-snug">
                    All rules active and enforced
                  </p>
                </div>
              </div>
            </SidebarCard>

            <SidebarCard title="How It Works">
              <ul className="space-y-1.5 text-xs text-gray-600">
                {ruleSummary.length > 0 ? (
                  ruleSummary.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                      <span>{line}</span>
                    </li>
                  ))
                ) : (
                  <>
                    <HowItWorksItem text="Service limits control max concurrent active orders per rider" />
                    <HowItWorksItem text="Cross-service rules determine if riders can mix food, parcel, and rides" />
                    <HowItWorksItem text="Exclusive mode prevents conflicting service assignments" />
                    <HowItWorksItem text="Changes apply to dispatch pool, push, socket, and accept flows" />
                  </>
                )}
              </ul>
            </SidebarCard>
          </aside>
        </div>
      ) : mainPanel === "geo" ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-col border-b border-gray-100 sm:flex-row sm:items-stretch">
                <div className="shrink-0 border-b border-gray-100 px-4 py-2 sm:border-b-0 sm:border-r">
                  <h2 className="text-sm font-semibold text-gray-900">Milestones</h2>
                  <p className="text-xs text-gray-500">Radius per status update</p>
                </div>
                <div className="flex flex-1 min-w-0">
                  {SERVICE_TYPES.map((st) => {
                    const cfg = SERVICE_CONFIG[st];
                    const Icon = cfg.icon;
                    const selected = geoTab === st;
                    const dirty = dirtyGeoByService[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setGeoTab(st)}
                        className={`relative flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-xs font-semibold transition -mb-px ${
                          selected
                            ? cfg.tabActiveBorder
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md ${cfg.iconBg}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                        </span>
                        <span className="hidden md:inline">{cfg.tabLabel}</span>
                        <span className="md:hidden">{cfg.label}</span>
                        {dirty ? (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/80 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-3 py-2">Milestone</th>
                          <th className="px-2 py-2">Description</th>
                          <th className="px-2 py-2 w-28">Radius (m)</th>
                          <th className="px-2 py-2 w-16 text-center">Status</th>
                          <th className="px-3 py-2 w-14 text-right">Save</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activeGeoRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-gray-500">
                              No milestones for this service.
                            </td>
                          </tr>
                        ) : (
                          activeGeoRows.map((row) => {
                            const saved = savedGeoById.get(row.id);
                            const dirty = geoRowDirty(row, saved);
                            const saveId = `${row.service_type}:${row.milestone_key}`;
                            const MilestoneIcon = milestoneIcon(row.milestone_key);
                            return (
                              <tr key={row.id} className="hover:bg-gray-50/50">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                                      <MilestoneIcon className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold text-gray-900 leading-tight">
                                        {MILESTONE_LABELS[row.milestone_key] ?? row.milestone_key}
                                      </p>
                                      <p className="text-[10px] font-mono text-gray-400 truncate">
                                        {row.milestone_key}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-gray-600 max-w-[200px] text-[11px] leading-snug">
                                  {MILESTONE_DESCRIPTIONS[row.milestone_key] ??
                                    "Radius threshold for this milestone"}
                                </td>
                                <td className="px-2 py-2">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={1}
                                      max={100000}
                                      className={`w-full rounded-md border py-1.5 pl-2 pr-7 text-xs tabular-nums outline-none transition ${
                                        dirty
                                          ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-200/80"
                                          : "border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
                                      }`}
                                      value={row.radius_meters}
                                      onChange={(e) => {
                                        const v = Number(e.target.value);
                                        setGeoRows((prev) =>
                                          prev.map((r) =>
                                            r.id === row.id ? { ...r, radius_meters: v } : r
                                          )
                                        );
                                      }}
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                      m
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <StatusToggle
                                    checked={row.is_active}
                                    onChange={(v) =>
                                      setGeoRows((prev) =>
                                        prev.map((r) =>
                                          r.id === row.id ? { ...r, is_active: v } : r
                                        )
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    disabled={!dirty || savingGeoKey === saveId}
                                    onClick={() => void saveGeoRow(row)}
                                    title="Save milestone"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {savingGeoKey === saveId ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Save className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2">
                    <Info className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" />
                    <p className="text-[11px] text-emerald-900 leading-snug">
                      <span className="font-semibold">How it works:</span> Riders must be within the
                      configured radius; GPS is validated before each status update.
                    </p>
                  </div>
              </>
            </section>
          </div>

          <aside className="space-y-3">
            <SidebarCard title="About Geo-fenced Status">
              <ul className="space-y-1.5 text-xs text-gray-600">
                <HowItWorksItem text="Prevents riders from updating status when too far from target location" />
                <HowItWorksItem text="Validates rider GPS coordinates against milestone radius" />
                <HowItWorksItem text="Applies to all status updates in rider mobile app" />
                <HowItWorksItem text="Configurable per service type and milestone" accent="emerald" />
              </ul>
            </SidebarCard>

            <SidebarCard title="Current Configuration Summary">
              <ul className="space-y-1.5">
                {SERVICE_TYPES.map((st) => {
                  const cfg = SERVICE_CONFIG[st];
                  const Icon = cfg.icon;
                  return (
                    <li
                      key={st}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-md ${cfg.iconBg}`}
                        >
                          <Icon className={`h-3 w-3 ${cfg.iconColor}`} />
                        </span>
                        {cfg.tabLabel}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        {geoMilestoneCounts[st]} milestones
                      </span>
                    </li>
                  );
                })}
              </ul>
            </SidebarCard>

            <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2">
              <Info className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
              <p className="text-[11px] text-amber-950 leading-snug">
                <span className="font-semibold">Note:</span> Radius changes apply immediately to all
                trips. Test carefully in production.
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <RiderDispatchSettingsPanel
              ref={dispatchRef}
              initial={dispatchBootstrap}
              onDirtyChange={setDispatchDirty}
            />
          </div>
          <aside className="space-y-3">
            <SidebarCard title="How dispatch waves work">
              <ul className="space-y-1.5 text-xs text-gray-600">
                <HowItWorksItem text="Wave 1 searches riders within the pickup radius" accent="violet" />
                <HowItWorksItem
                  text="If no rider accepts, the next wave expands the search radius"
                  accent="violet"
                />
                <HowItWorksItem
                  text="Wait time controls how long each wave runs before expanding"
                  accent="violet"
                />
                <HowItWorksItem
                  text="Food orders can require merchant acceptance before rider accept"
                  accent="violet"
                />
              </ul>
            </SidebarCard>
            <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2">
              <Info className="h-3.5 w-3.5 shrink-0 text-violet-600 mt-0.5" />
              <p className="text-[11px] text-violet-900 leading-snug">
                Changes apply to new dispatch waves immediately. Active searches keep their current
                wave settings.
              </p>
            </div>
          </aside>
        </div>
      )}

      {pageReady ? (
        <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-end gap-2 rounded-xl border border-gray-200/80 bg-[#f4f5f7]/95 px-3 py-3 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={footerReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset to Default
          </button>
          <button
            type="button"
            onClick={footerSave}
            disabled={footerSaving || !footerCanSave}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mainPanel === "geo"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : mainPanel === "dispatch"
                  ? "bg-sky-600 hover:bg-sky-700"
                  : "bg-violet-600 hover:bg-violet-700"
            }`}
          >
            {footerSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {footerSaveLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
  icon: Icon,
  activeClass,
  iconActiveClass,
  showDot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ElementType;
  activeClass: string;
  iconActiveClass: string;
  showDot?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
        active ? activeClass : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? iconActiveClass : "text-gray-400"}`} />
      {label}
      {showDot && !active ? (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
      ) : null}
    </button>
  );
}

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-900 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function HowItWorksItem({
  text,
  accent = "violet",
}: {
  text: string;
  accent?: "violet" | "emerald";
}) {
  const dot = accent === "emerald" ? "bg-emerald-500" : "bg-violet-500";
  return (
    <li className="flex gap-2 text-xs text-gray-600 leading-snug">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span>{text}</span>
    </li>
  );
}

function RuleToggleRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  hint,
  checked,
  onChange,
  accent,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent: "violet" | "emerald";
}) {
  const onClass = accent === "emerald" ? "bg-emerald-600" : "bg-violet-600";
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex gap-2 min-w-0">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
        >
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </span>
        <div>
          <p className="text-xs font-semibold text-gray-900 leading-tight">{label}</p>
          <p className="text-[11px] text-gray-500 leading-snug">{hint}</p>
        </div>
      </div>
      <StatusToggle checked={checked} onChange={onChange} accent={accent} />
    </div>
  );
}

function StatusToggle({
  checked,
  onChange,
  accent = "emerald",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: "violet" | "emerald";
}) {
  const onClass = accent === "emerald" ? "bg-emerald-600" : "bg-violet-600";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? onClass : "bg-gray-300"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
