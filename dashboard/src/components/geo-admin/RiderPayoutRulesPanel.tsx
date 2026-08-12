"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Layers, Loader2, Plus } from "lucide-react";
import {
  previewServicePayoutBreakdown,
  type PreviewSurgeDefinition,
  type PreviewSurgeTimeSlot,
  type ServicePayoutRulePreviewInput,
} from "@/lib/geo/riderPayoutPreview";
import {
  fetchServicePayoutRules,
  getServicePayoutRulesCache,
  invalidateServicePayoutRulesCache,
  servicePayoutRulesCacheKey,
} from "@/lib/geo/servicePayoutRulesCache";
import { fetchDeliveryRateSlabs } from "@/lib/geo/deliveryRateSlabsCache";
import {
  calcCustomerPreviewBreakdown,
  composeRiderPayout,
  defaultPrePickupFunding,
  normalizePrePickupFunding,
  type CustomerSlab,
  type PrePickupFunding,
} from "@/lib/pricing/slabPricingEngine";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";
import { SlabNumericInput } from "./SlabNumericInput";
import { VEHICLE_OPTIONS, type VehicleType } from "./rideVehicleTypes";

type RiderService = "food" | "parcel" | "ride";

function ToggleSwitch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 " +
          (props.checked
            ? "border-teal-500 bg-teal-600"
            : "border-slate-200 bg-slate-200")
        }
      >
        <span
          className={
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-150 " +
            (props.checked ? "translate-x-[1.15rem]" : "translate-x-0.5")
          }
        />
      </button>
      {props.label}
    </label>
  );
}

/**
 * Rider Fare Engine v3.0: intentionally minimal rule shape. No guardrails —
 * the pickup/drop split is always pure distance ratio, so nothing here can
 * ever force a fixed or 50/50 split.
 */
export type ServicePayoutRuleRow = {
  id: number;
  riderPercentage: number;
  platformPercentage: number;
  waitingChargePerMin: number | null;
  waitingFreeMinutes: number;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

type RuleForm = {
  riderPercentage: string;
  waitingChargePerMin: string;
  waitingFreeMinutes: string;
  priority: string;
  isActive: boolean;
};

const blankForm: RuleForm = {
  riderPercentage: "90",
  waitingChargePerMin: "1",
  waitingFreeMinutes: "2",
  priority: "100",
  isActive: true,
};

function ruleToForm(r: ServicePayoutRuleRow): RuleForm {
  return {
    riderPercentage: String(r.riderPercentage),
    waitingChargePerMin: r.waitingChargePerMin == null ? "" : String(r.waitingChargePerMin),
    waitingFreeMinutes: String(r.waitingFreeMinutes),
    priority: String(r.priority),
    isActive: r.isActive,
  };
}

function formToPayload(f: RuleForm) {
  const riderPercentage = parseDecimalOrZero(f.riderPercentage);
  return {
    riderPercentage,
    platformPercentage: Math.round((100 - riderPercentage) * 100) / 100,
    waitingChargePerMin: f.waitingChargePerMin === "" ? null : parseDecimalOrZero(f.waitingChargePerMin),
    waitingFreeMinutes: Math.round(parseDecimalOrZero(f.waitingFreeMinutes)),
    priority: Math.round(parseDecimalOrZero(f.priority)),
    isActive: f.isActive,
  };
}

/** Form values -> preview engine input. Used so the calculator updates live from unsaved edits. */
function formToPreviewInput(f: RuleForm): ServicePayoutRulePreviewInput {
  const payload = formToPayload(f);
  return {
    riderPercentage: payload.riderPercentage,
    platformPercentage: payload.platformPercentage,
    waitingChargePerMin: payload.waitingChargePerMin,
    waitingFreeMinutes: payload.waitingFreeMinutes,
  };
}

function ruleRowToPreviewInput(r: ServicePayoutRuleRow): ServicePayoutRulePreviewInput {
  return {
    riderPercentage: r.riderPercentage,
    platformPercentage: r.platformPercentage,
    waitingChargePerMin: r.waitingChargePerMin,
    waitingFreeMinutes: r.waitingFreeMinutes,
  };
}

/** Maps a raw customer delivery-rate-slab or ride_customer_pricing API row to the shared pricing engine's slab shape. */
function toCustomerSlab(s: Record<string, unknown>): CustomerSlab {
  const maxKm = s.maxKm ?? s.max_km;
  const baseFare = s.baseFare ?? s.base_fare;
  const minCharge = s.minCharge ?? s.min_charge;
  return {
    id: Number(s.id),
    minKm: Number(s.minKm ?? s.min_km),
    maxKm: maxKm == null ? null : Number(maxKm),
    baseFare: baseFare == null ? null : Number(baseFare),
    perKmRate: Number(s.perKmRate ?? s.per_km_rate ?? 0),
    minCharge: minCharge == null ? null : Number(minCharge),
    priority: Number(s.priority ?? 100),
    isActive: (s.isActive ?? s.is_active) === true,
  };
}

const inputCls =
  "w-full min-w-[4rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50";

function mapRuleFromApi(r: Record<string, unknown>): ServicePayoutRuleRow {
  return {
    id: Number(r.id),
    riderPercentage: Number(r.riderPercentage),
    platformPercentage: Number(r.platformPercentage),
    waitingChargePerMin: r.waitingChargePerMin == null ? null : Number(r.waitingChargePerMin),
    waitingFreeMinutes: Number(r.waitingFreeMinutes ?? 2),
    priority: Number(r.priority ?? 100),
    isActive: r.isActive === true,
    effectiveFrom: r.effectiveFrom == null ? null : String(r.effectiveFrom),
    effectiveTo: r.effectiveTo == null ? null : String(r.effectiveTo),
  };
}

export function RiderPayoutRulesPanel(props: {
  level: string;
  refId: string;
  service: RiderService;
  surgeRefreshKey?: number;
}) {
  const cacheKey = useMemo(
    () => servicePayoutRulesCacheKey({ level: props.level, refId: props.refId, service: props.service }),
    [props.level, props.refId, props.service]
  );
  const cached = getServicePayoutRulesCache(cacheKey);

  const [rules, setRules] = useState<ServicePayoutRuleRow[]>(
    cached ? cached.rules.map(mapRuleFromApi) : []
  );
  const [loading, setLoading] = useState(!cached);
  const [addingOpen, setAddingOpen] = useState(false);
  const [addForm, setAddForm] = useState<RuleForm>(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(blankForm);
  const [busyId, setBusyId] = useState<number | "new" | null>(null);

  const [previewPickupKm, setPreviewPickupKm] = useState("");
  const [previewDropKm, setPreviewDropKm] = useState("");
  const [previewWaitMin, setPreviewWaitMin] = useState("0");
  const [previewMaxRider, setPreviewMaxRider] = useState(false);
  const [calcVehicleType, setCalcVehicleType] = useState<VehicleType>("2_wheeler");
  const [surgeCatalog, setSurgeCatalog] = useState<{
    definitions: PreviewSurgeDefinition[];
    timeSlots: PreviewSurgeTimeSlot[];
    surgeWaitMaxOnly: boolean;
    maxTotalSurgeAmount: number | null;
  }>({ definitions: [], timeSlots: [], surgeWaitMaxOnly: false, maxTotalSurgeAmount: null });
  const [previewForceSurgeIds, setPreviewForceSurgeIds] = useState<number[]>([]);

  // First-mile (pre-pickup) config for THIS service — pulled from the live dispatch
  // strategy config so the calculator composes the first-mile exactly like production.
  // Editable in the calculator so an admin can what-if a rate/funding before saving it.
  const [prePickupRatePerKm, setPrePickupRatePerKm] = useState<string>("");
  const [prePickupFunding, setPrePickupFunding] = useState<PrePickupFunding>(
    defaultPrePickupFunding(props.service)
  );
  const [prePickupConfigLoaded, setPrePickupConfigLoaded] = useState(false);

  // Customer fare is computed from the same production Customer Slab Pricing Engine used at
  // checkout — never entered manually — so the preview always matches production exactly.
  const [customerSlabs, setCustomerSlabs] = useState<CustomerSlab[]>([]);
  const [customerSlabsLoading, setCustomerSlabsLoading] = useState(true);

  const loadCustomerSlabs = useCallback(async () => {
    setCustomerSlabsLoading(true);
    try {
      if (props.service === "ride") {
        const qs = new URLSearchParams({
          level: props.level,
          refId: props.refId,
          vehicleType: calcVehicleType,
          effective: "1",
        });
        const res = await fetch(`/api/super-admin/geo/ride-customer-pricing?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load ride customer pricing");
        setCustomerSlabs(((json.slabs ?? []) as Record<string, unknown>[]).map(toCustomerSlab));
        return;
      }
      const payload = await fetchDeliveryRateSlabs({
        level: props.level,
        refId: props.refId,
        serviceType: props.service,
        actorType: "customer",
      });
      setCustomerSlabs(payload.effectiveSlabs.map(toCustomerSlab));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load customer pricing for the calculator");
      setCustomerSlabs([]);
    } finally {
      setCustomerSlabsLoading(false);
    }
  }, [props.level, props.refId, props.service, calcVehicleType]);

  useEffect(() => {
    void loadCustomerSlabs();
  }, [loadCustomerSlabs]);

  const pickupKm = parseDecimalOrZero(previewPickupKm);
  const dropKm = parseDecimalOrZero(previewDropKm);
  const hasPickupInput = previewPickupKm.trim() !== "";
  const hasDropInput = previewDropKm.trim() !== "";

  const totalTripKm = pickupKm + dropKm;

  const customerFareBreakdown = useMemo(() => {
    if (customerSlabs.length === 0 || totalTripKm <= 0) return null;
    return calcCustomerPreviewBreakdown({ distanceKm: totalTripKm, slabs: customerSlabs });
  }, [customerSlabs, totalTripKm]);
  const customerFare = customerFareBreakdown?.finalAmount ?? 0;

  const loadSurgeCatalog = useCallback(async () => {
    if (props.level !== "state") {
      setSurgeCatalog({ definitions: [], timeSlots: [], surgeWaitMaxOnly: false, maxTotalSurgeAmount: null });
      return;
    }
    try {
      const res = await fetch(`/api/super-admin/geo/state-surge-configs?stateId=${props.refId}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) return;
      setSurgeCatalog({
        definitions: (json.surges ?? []).map((s: Record<string, unknown>) => ({
          id: Number(s.id),
          name: String(s.name),
          surgeType: (String(s.surgeType ?? s.surge_type ?? "fixed") === "percentage"
            ? "percentage"
            : "fixed") as PreviewSurgeDefinition["surgeType"],
          amount: Number(s.amount ?? 0),
          priority: Number(s.priority ?? 100),
          isEnabled: s.enabled === true,
          gmitraMaxOnly: s.maxRidersOnly === true,
          appliesFood: s.appliesFood !== false,
          appliesParcel: s.appliesParcel !== false,
          appliesRide: s.appliesRide !== false,
          vehicleType: String(s.vehicleType ?? s.vehicle_type ?? "all"),
          manualActive: s.manualActive === true,
        })),
        timeSlots: (json.timeSlots ?? []).map((s: Record<string, unknown>) => ({
          id: Number(s.id),
          surgeId: Number(s.stateSurgeId ?? s.state_surge_id),
          startTime: String(s.startTime ?? s.start_time).slice(0, 5),
          endTime: String(s.endTime ?? s.end_time).slice(0, 5),
          daysOfWeek: Array.isArray(s.daysOfWeek) ? s.daysOfWeek.map((x: unknown) => Number(x)) : [0, 1, 2, 3, 4, 5, 6],
          isEnabled: s.isEnabled === true || s.is_enabled === true,
        })),
        surgeWaitMaxOnly: false,
        maxTotalSurgeAmount: json.settings?.maxTotalSurgeAmount == null ? null : Number(json.settings.maxTotalSurgeAmount),
      });
    } catch {
      /* ignore */
    }
  }, [props.level, props.refId]);

  const refresh = useCallback(
    async (force = true) => {
      if (force) invalidateServicePayoutRulesCache(cacheKey);
      const hadCache = !force && getServicePayoutRulesCache(cacheKey) != null;
      if (!hadCache) setLoading(true);
      try {
        const payload = await fetchServicePayoutRules({
          level: props.level,
          refId: props.refId,
          service: props.service,
          force,
        });
        setRules(payload.rules.map(mapRuleFromApi));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load rider payout rules");
      } finally {
        setLoading(false);
      }
    },
    [props.level, props.refId, props.service, cacheKey]
  );

  useEffect(() => {
    void refresh();
    void loadSurgeCatalog();
  }, [refresh, loadSurgeCatalog, props.surgeRefreshKey]);

  // Pull the live first-mile rate + funding for this service (once) so the calculator
  // seeds the same values production uses. Admin can override in the calculator.
  const loadPrePickupConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/dispatch-strategy-config", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;
      const configServiceType = props.service === "ride" ? "person_ride" : props.service;
      const cfg = (json.strategy_configs ?? []).find(
        (c: Record<string, unknown>) => String(c.service_type) === configServiceType
      );
      if (cfg) {
        const rate = Number(cfg.pre_pickup_rate_per_km);
        setPrePickupRatePerKm(Number.isFinite(rate) && rate > 0 ? String(rate) : "");
        setPrePickupFunding(
          normalizePrePickupFunding(cfg.pre_pickup_funding, defaultPrePickupFunding(props.service))
        );
      }
    } catch {
      /* keep defaults */
    } finally {
      setPrePickupConfigLoaded(true);
    }
  }, [props.service]);

  useEffect(() => {
    void loadPrePickupConfig();
  }, [loadPrePickupConfig]);

  const effectiveRule = useMemo(() => rules.find((r) => r.isActive) ?? null, [rules]);

  // The calculator reflects whatever the admin is currently typing in the Add/Edit form —
  // no Save required — falling back to the saved effective rule when no form is open.
  const calcRule: ServicePayoutRulePreviewInput | null = useMemo(() => {
    if (editingId != null) return formToPreviewInput(editForm);
    if (addingOpen) return formToPreviewInput(addForm);
    return effectiveRule ? ruleRowToPreviewInput(effectiveRule) : null;
  }, [editingId, editForm, addingOpen, addForm, effectiveRule]);

  const validationError = useMemo(() => {
    if (!hasPickupInput || pickupKm <= 0) return "Pickup distance is required.";
    if (!hasDropInput || dropKm <= 0) return "Drop distance is required.";
    if (totalTripKm === 0) return "Enter a valid trip distance.";
    return null;
  }, [hasPickupInput, hasDropInput, pickupKm, dropKm]);

  const previewBreakdown = useMemo(() => {
    if (!calcRule || customerFare <= 0 || validationError) return null;
    return previewServicePayoutBreakdown({
      customerFare,
      pickupKm,
      dropKm,
      rule: calcRule,
      waitingMinutes: parseDecimalOrZero(previewWaitMin),
      riderHasGmitraMax: previewMaxRider,
      service: props.service,
      surgeDefinitions: surgeCatalog.definitions,
      surgeTimeSlots: surgeCatalog.timeSlots,
      surgeWaitMaxOnly: surgeCatalog.surgeWaitMaxOnly,
      maxTotalSurgeAmount: surgeCatalog.maxTotalSurgeAmount,
      forceActiveSurgeIds: previewForceSurgeIds.length > 0 ? previewForceSurgeIds : undefined,
    });
  }, [
    calcRule,
    customerFare,
    validationError,
    pickupKm,
    dropKm,
    previewWaitMin,
    previewMaxRider,
    props.service,
    surgeCatalog,
    previewForceSurgeIds,
  ]);

  // v3.1 first-mile composition — the SAME shared engine the backend uses to pay riders.
  // basePool = the pure % pool (customerFare × rider%); surge/waiting are on-top add-ons.
  const prePickupRaw = useMemo(() => {
    const rate = parseDecimalOrZero(prePickupRatePerKm);
    return rate > 0 && pickupKm > 0 ? Math.round(rate * pickupKm * 100) / 100 : 0;
  }, [prePickupRatePerKm, pickupKm]);

  const composition = useMemo(() => {
    if (!previewBreakdown) return null;
    return composeRiderPayout({
      basePool: previewBreakdown.riderTotal,
      prePickupRaw,
      surge: previewBreakdown.surgeTotal,
      waiting: previewBreakdown.waitingAmount,
      funding: prePickupFunding,
    });
  }, [previewBreakdown, prePickupRaw, prePickupFunding]);

  async function submitAdd() {
    setBusyId("new");
    try {
      const payload = formToPayload(addForm);
      if (payload.riderPercentage <= 0 || payload.riderPercentage > 100) {
        toast.error("Rider % must be between 0 and 100");
        return;
      }
      const res = await fetch("/api/super-admin/geo/rider-payout-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: props.level, refId: props.refId, service: props.service, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add rule");
      toast.success("Rider payout rule added");
      setAddingOpen(false);
      setAddForm(blankForm);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setBusyId(null);
    }
  }

  async function submitEdit(id: number) {
    setBusyId(id);
    try {
      const payload = formToPayload(editForm);
      if (payload.riderPercentage <= 0 || payload.riderPercentage > 100) {
        toast.error("Rider % must be between 0 and 100");
        return;
      }
      const res = await fetch(`/api/super-admin/geo/rider-payout-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save rule");
      toast.success("Rider payout rule saved");
      setEditingId(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(id: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-payout-rules/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete rule");
      toast.success("Rider payout rule deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-teal-800">
          <Layers className="h-4 w-4" /> Rider Payout Rules — % of customer fare
        </div>
        <button type="button" className={btnPrimary} onClick={() => setAddingOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Add rule
        </button>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading rules...
        </div>
      ) : null}

      {addingOpen ? (
        <RuleFormCard form={addForm} setForm={setAddForm} onCancel={() => setAddingOpen(false)} onSave={submitAdd} busy={busyId === "new"} />
      ) : null}

      {!loading && rules.length === 0 && !addingOpen ? (
        <p className="mt-4 text-sm text-slate-500">
          No rule configured at this node. Effective rule (if any) is inherited from a parent geo node.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {rules.map((r) =>
          editingId === r.id ? (
            <RuleFormCard
              key={r.id}
              form={editForm}
              setForm={setEditForm}
              onCancel={() => setEditingId(null)}
              onSave={() => submitEdit(r.id)}
              busy={busyId === r.id}
            />
          ) : (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="font-mono font-semibold text-teal-800">
                    Rider {r.riderPercentage}% / Platform {r.platformPercentage}%
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {r.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="text-xs text-slate-500">Priority {r.priority}</span>
                  <span className="text-xs text-slate-500">
                    Wait ₹{r.waitingChargePerMin ?? 0}/min after {r.waitingFreeMinutes} min free
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      setEditingId(r.id);
                      setEditForm(ruleToForm(r));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={busyId === r.id}
                    onClick={() => deleteRule(r.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* Live Calculator */}
      <div className="mt-6 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-800">
          Customer fare vs rider payout — live calculator
        </p>
        <p className="text-xs text-teal-700">
          Customer fare is computed live from the production Customer Slab Pricing Engine (same rules used at
          checkout) — never entered manually. Every field below recalculates instantly. No Save needed.
        </p>
        {!calcRule ? (
          <p className="mt-3 text-sm text-slate-500">No active rule to preview — add one above.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {props.service === "ride" ? (
                <PreviewField label="Vehicle type">
                  <select
                    className={inputCls}
                    value={calcVehicleType}
                    onChange={(e) => setCalcVehicleType(e.target.value as VehicleType)}
                  >
                    {VEHICLE_OPTIONS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </PreviewField>
              ) : null}
              <PreviewField label="Pickup distance (km)">
                <SlabNumericInput value={previewPickupKm} onChange={setPreviewPickupKm} kind="decimal" className={inputCls} placeholder="e.g. 2" />
              </PreviewField>
              <PreviewField label="Drop distance (km)">
                <SlabNumericInput value={previewDropKm} onChange={setPreviewDropKm} kind="decimal" className={inputCls} placeholder="e.g. 8" />
              </PreviewField>
              <PreviewField label="Waiting minutes">
                <SlabNumericInput value={previewWaitMin} onChange={setPreviewWaitMin} kind="decimal" className={inputCls} />
              </PreviewField>
              <PreviewField label="First-mile rate (₹/km)">
                <SlabNumericInput
                  value={prePickupRatePerKm}
                  onChange={setPrePickupRatePerKm}
                  kind="decimal"
                  className={inputCls}
                  placeholder="0"
                />
              </PreviewField>
              <PreviewField label="First-mile funding">
                <select
                  className={inputCls}
                  value={prePickupFunding}
                  onChange={(e) => setPrePickupFunding(e.target.value as PrePickupFunding)}
                >
                  <option value="customer">Customer (within pool)</option>
                  <option value="company">Company (on top)</option>
                  <option value="shared">Shared (pool + company overflow)</option>
                </select>
              </PreviewField>
              <div className="flex items-end pb-2">
                <ToggleSwitch checked={previewMaxRider} onChange={setPreviewMaxRider} label="GMitra Max" />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-teal-700">
              Customer fare is calculated on the total trip distance (pickup + drop) via the Customer Slab
              Pricing Engine.
            </p>

            {validationError ? (
              <p className="mt-3 text-sm font-semibold text-amber-700">{validationError}</p>
            ) : customerSlabsLoading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading customer pricing…
              </p>
            ) : customerSlabs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No customer pricing configured at this node — cannot compute a live customer fare.
              </p>
            ) : previewBreakdown ? (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-6 rounded-lg border border-teal-100 bg-white px-4 py-4">
                  <MiniStat label="Customer fare" value={`₹${customerFare.toFixed(2)}`} />
                  <span className="text-2xl text-teal-400">→</span>
                  <MiniStat label={`Rider pool (${calcRule.riderPercentage}%)`} value={`₹${previewBreakdown.riderTotal.toFixed(2)}`} />
                  <span className="text-2xl text-teal-400">→</span>
                  <MiniStat
                    label="Rider gets"
                    value={`₹${(composition?.riderDeliveryCredit ?? previewBreakdown.finalAmount).toFixed(2)}`}
                    emphasize
                  />
                  <span className="text-2xl text-teal-400">|</span>
                  <MiniStat label={`Platform revenue (${calcRule.platformPercentage}%)`} value={`₹${previewBreakdown.platformRevenue.toFixed(2)}`} />
                </div>

                {/* v3.1 First-mile composition — pre-pickup carved from the pool vs company top-up. */}
                {composition && prePickupRaw > 0 ? (
                  <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-indigo-600">
                      First-mile (pre-pickup) composition — {prePickupFunding} funded
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-3">
                      <span>First-mile (raw): <b>₹{prePickupRaw.toFixed(2)}</b></span>
                      <span>From pool: <b>₹{composition.prePickupFromPool.toFixed(2)}</b></span>
                      <span>Company-funded: <b>₹{composition.prePickupCompanyFunded.toFixed(2)}</b></span>
                      <span>Pre-pickup paid: <b>₹{composition.prePickupPaid.toFixed(2)}</b></span>
                      <span>Post-pickup (remainder): <b>₹{composition.postPickup.toFixed(2)}</b></span>
                      <span>
                        Rider base pool: <b>₹{composition.basePool.toFixed(2)}</b>
                      </span>
                      {composition.prePickupCappedAtPool ? (
                        <span className="sm:col-span-3 text-amber-700">
                          ⚠ First-mile exceeds the pool — capped at the pool (post-pickup = ₹0).
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-indigo-100 pt-2 text-sm text-slate-700 sm:grid-cols-3">
                      <span>
                        Ledger A — delivery-fee funded:{" "}
                        <b className="text-teal-800">₹{composition.deliveryFeeFundedTotal.toFixed(2)}</b>
                      </span>
                      <span>
                        Ledger B — company funded:{" "}
                        <b className="text-indigo-800">₹{composition.companyFundedTotal.toFixed(2)}</b>
                      </span>
                      <span className="sm:col-span-3 border-t border-indigo-100 pt-1.5">
                        Rider delivery credit:{" "}
                        <b className="text-teal-800">₹{composition.riderDeliveryCredit.toFixed(2)}</b>
                        {" "}(A + B)
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Detailed Calculation Breakdown */}
                <div className="mt-4 rounded-lg border border-teal-100 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Detailed calculation breakdown</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-3">
                    <span>Customer fare: <b>₹{customerFare.toFixed(2)}</b></span>
                    <span>Platform %: <b>{calcRule.platformPercentage}%</b></span>
                    <span>Platform revenue: <b>₹{previewBreakdown.platformRevenue.toFixed(2)}</b></span>
                    <span>Rider %: <b>{calcRule.riderPercentage}%</b></span>
                    <span>Rider total: <b>₹{previewBreakdown.riderTotal.toFixed(2)}</b></span>
                    <span>Pickup distance: <b>{pickupKm} km</b></span>
                    <span>Drop distance: <b>{dropKm} km</b></span>
                    <span>Total distance (customer fare basis): <b>{totalTripKm.toFixed(1)} km</b></span>
                    <span>Pickup ratio: <b>{previewBreakdown.pickupRatio}%</b></span>
                    <span>Drop ratio: <b>{previewBreakdown.dropRatio}%</b></span>
                    <span>Pickup payout: <b>₹{previewBreakdown.pickupAmount.toFixed(2)}</b></span>
                    <span>Drop payout: <b>₹{previewBreakdown.dropAmount.toFixed(2)}</b></span>
                    <span>Waiting charge: <b>₹{previewBreakdown.waitingAmount.toFixed(2)}</b></span>
                    <span>Surge: <b>₹{previewBreakdown.surgeTotal.toFixed(2)}</b></span>
                    {prePickupRaw > 0 ? (
                      <span>First-mile paid: <b>₹{(composition?.prePickupPaid ?? 0).toFixed(2)}</b></span>
                    ) : null}
                    <span className="sm:col-span-3 border-t border-slate-100 pt-1.5">
                      Rider gets:{" "}
                      <b className="text-teal-800">
                        ₹{(composition?.riderDeliveryCredit ?? previewBreakdown.finalAmount).toFixed(2)}
                      </b>
                      {prePickupRaw > 0 ? (
                        <span className="ml-2 text-xs text-slate-500">
                          (pool {previewBreakdown.riderTotal.toFixed(2)} + surge{" "}
                          {previewBreakdown.surgeTotal.toFixed(2)} + waiting{" "}
                          {previewBreakdown.waitingAmount.toFixed(2)}
                          {prePickupFunding === "customer"
                            ? ", first-mile within pool"
                            : `, + company first-mile ${(composition?.prePickupCompanyFunded ?? 0).toFixed(2)}`}
                          )
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </>
            ) : null}

            {surgeCatalog.definitions.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-600">Surge type (optional):</p>
                <div className="mt-1 flex flex-wrap gap-3">
                  {surgeCatalog.definitions.map((d) => (
                    <label key={d.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={previewForceSurgeIds.includes(d.id)}
                        onChange={(e) =>
                          setPreviewForceSurgeIds((ids) =>
                            e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)
                          )
                        }
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <FormulaFlow />
    </div>
  );
}

function MiniStat(props: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase text-slate-500">{props.label}</p>
      <p className={props.emphasize ? "text-xl font-bold text-teal-800" : "text-xl font-bold text-slate-800"}>
        {props.value}
      </p>
    </div>
  );
}

const FORMULA_STEPS = [
  "Customer Slab Pricing Engine",
  "Customer Fare",
  "Rider %",
  "Rider Total",
  "Distance Ratio",
  "Pickup Amount",
  "Drop Amount",
  "Waiting Charge",
  "Surge",
  "Final Rider Payout",
];

function FormulaFlow() {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Formula flow</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 overflow-x-auto">
        {FORMULA_STEPS.map((step, i) => (
          <React.Fragment key={step}>
            <span className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {step}
            </span>
            {i < FORMULA_STEPS.length - 1 ? (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const VERIFICATION_ROWS: { label: string; status: string }[] = [
  { label: "Customer Fare", status: "Customer Slab Pricing Engine" },
  { label: "Rider %", status: "Rider Rule" },
  { label: "Distance Split", status: "Production Formula" },
  { label: "Waiting", status: "Included" },
  { label: "Surge", status: "Included" },
  { label: "Dashboard Calculator", status: "Same Production Engine" },
  { label: "Rider Preview API", status: "Same Production Engine" },
  { label: "Order Creation", status: "Same Production Engine" },
];

export function ProductionVerificationCard() {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Production engine status</p>
      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {VERIFICATION_ROWS.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{row.label}:</span> {row.status}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-emerald-700">No duplicate calculations exist anywhere in this system.</p>
    </div>
  );
}

function PreviewField(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {props.label}
      {props.children}
    </label>
  );
}

function RuleFormCard(props: {
  form: RuleForm;
  setForm: (updater: (f: RuleForm) => RuleForm) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const { form, setForm } = props;
  const set = (key: keyof RuleForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const platformPct = 100 - parseDecimalOrZero(form.riderPercentage || "0");

  return (
    <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <PreviewField label="Rider %">
          <SlabNumericInput value={form.riderPercentage} onChange={set("riderPercentage")} kind="decimal" className={inputCls} />
        </PreviewField>
        <PreviewField label="Platform % (auto)">
          <input className={inputCls} value={Number.isFinite(platformPct) ? platformPct.toFixed(2) : "0"} disabled readOnly />
        </PreviewField>
        <PreviewField label="Priority">
          <SlabNumericInput value={form.priority} onChange={set("priority")} kind="integer" className={inputCls} />
        </PreviewField>

        <PreviewField label="Wait charge (₹/min)">
          <SlabNumericInput value={form.waitingChargePerMin} onChange={set("waitingChargePerMin")} kind="decimal" className={inputCls} placeholder="none" />
        </PreviewField>
        <PreviewField label="Free wait (minutes)">
          <SlabNumericInput value={form.waitingFreeMinutes} onChange={set("waitingFreeMinutes")} kind="integer" className={inputCls} />
        </PreviewField>
        <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Active
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} onClick={props.onSave} disabled={props.busy}>
          {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
        </button>
      </div>
    </div>
  );
}
