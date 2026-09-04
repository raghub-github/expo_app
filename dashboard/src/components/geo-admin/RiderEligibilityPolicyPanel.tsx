"use client";

/**
 * Rider Service ELIGIBILITY / DOCUMENT POLICY panel (Phase 14/36/37).
 *
 * SEPARATE from pricing — this configures WHO may receive a service (FOOD | PARCEL |
 * PERSON RIDE) at a geo node, from vehicle class, fuel, ownership, and DL/RC document
 * gates. It is NOT a fare editor.
 *
 * The decision engine is backend-authoritative: this UI only edits the geo-scoped policy
 * rows (rider_service_eligibility_rules) and previews the decision through the SAME
 * production engine via /simulate — no eligibility formula is duplicated in the browser.
 *
 * Core principle surfaced to the admin: DOCUMENT VERIFICATION ≠ SERVICE ELIGIBILITY.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, ShieldCheck, XCircle } from "lucide-react";

type EligibilityService = "food" | "parcel" | "person_ride";
type DocRequirement = "required" | "optional" | "exempt";
type VehicleClass = "2_wheeler" | "3_wheeler" | "4_wheeler";
type OwnershipType = "commercial" | "non_commercial";
type DocState = "verified" | "pending" | "failed" | "expired" | "missing";

type RuleRow = {
  id: number;
  serviceType: EligibilityService;
  geoLevel: string;
  geoRefId: string;
  serviceEnabled: boolean;
  dlRequirement: DocRequirement;
  rcRequirement: DocRequirement;
  evProofRequirement: DocRequirement;
  ownershipProofRequirement: DocRequirement;
  commercialProofRequirement: DocRequirement;
  commercialRequired: boolean;
  allowedVehicleClasses: VehicleClass[];
  allowedFuelKinds: string[];
  allowedOwnership: OwnershipType[];
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

type EligibilityBlock = { code: string; reason: string; requiredAction?: string };
type EligibilityDecision = {
  service: EligibilityService;
  eligible: boolean;
  vehicleClass: VehicleClass | null;
  fuelKind: string | null;
  ownership: OwnershipType;
  dlState: DocState;
  rcState: DocState;
  commercialRequired: boolean;
  blocking: EligibilityBlock[];
  resolvedGeo?: { level: string; refId: string } | null;
};
type EffectivePolicy = {
  service: EligibilityService;
  serviceEnabled: boolean;
  dlRequirement: DocRequirement;
  rcRequirement: DocRequirement;
  commercialRequired: boolean;
  allowedVehicleClasses: VehicleClass[];
  allowedFuelKinds: string[];
  allowedOwnership: OwnershipType[];
  resolvedGeo?: { level: string; refId: string } | null;
};

const SERVICES: { value: EligibilityService; label: string }[] = [
  { value: "food", label: "FOOD" },
  { value: "parcel", label: "PARCEL" },
  { value: "person_ride", label: "RIDE" },
];
const VEHICLE_CLASSES: { value: VehicleClass; label: string }[] = [
  { value: "2_wheeler", label: "2-wheeler" },
  { value: "3_wheeler", label: "3-wheeler" },
  { value: "4_wheeler", label: "4-wheeler" },
];
const FUEL_KINDS: { value: string; label: string }[] = [
  { value: "ev", label: "Electric (EV)" },
  { value: "petrol", label: "Petrol / Diesel" },
  { value: "cng", label: "CNG" },
  { value: "other", label: "Other" },
];
const OWNERSHIP: { value: OwnershipType; label: string }[] = [
  { value: "commercial", label: "Commercial" },
  { value: "non_commercial", label: "Non-commercial" },
];
const DOC_STATES: { value: DocState; label: string }[] = [
  { value: "verified", label: "Verified" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed / inconclusive" },
  { value: "expired", label: "Expired" },
  { value: "missing", label: "Missing" },
];
const REQUIREMENTS: DocRequirement[] = ["required", "optional", "exempt"];

const inputCls =
  "w-full min-w-[4rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-indigo-300 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50";

function defaultsForService(service: EligibilityService) {
  return {
    serviceEnabled: true,
    dlRequirement: (service === "food" ? "optional" : "required") as DocRequirement,
    rcRequirement: (service === "food" ? "optional" : "required") as DocRequirement,
    evProofRequirement: "exempt" as DocRequirement,
    ownershipProofRequirement: "exempt" as DocRequirement,
    commercialProofRequirement: "exempt" as DocRequirement,
    commercialRequired: service === "person_ride",
    allowedVehicleClasses: (service === "food"
      ? ["2_wheeler"]
      : ["2_wheeler", "3_wheeler", "4_wheeler"]) as VehicleClass[],
    allowedFuelKinds: [] as string[],
    allowedOwnership: ["commercial", "non_commercial"] as OwnershipType[],
    priority: 100,
    isActive: true,
  };
}

type RuleForm = ReturnType<typeof defaultsForService>;

function ruleToForm(r: RuleRow): RuleForm {
  return {
    serviceEnabled: r.serviceEnabled,
    dlRequirement: r.dlRequirement,
    rcRequirement: r.rcRequirement,
    evProofRequirement: r.evProofRequirement,
    ownershipProofRequirement: r.ownershipProofRequirement,
    commercialProofRequirement: r.commercialProofRequirement,
    commercialRequired: r.commercialRequired,
    allowedVehicleClasses: r.allowedVehicleClasses,
    allowedFuelKinds: r.allowedFuelKinds,
    allowedOwnership: r.allowedOwnership,
    priority: r.priority,
    isActive: r.isActive,
  };
}

function mapRuleFromApi(r: Record<string, unknown>): RuleRow {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  return {
    id: Number(r.id),
    serviceType: String(r.serviceType) as EligibilityService,
    geoLevel: String(r.geoLevel ?? ""),
    geoRefId: String(r.geoRefId ?? ""),
    serviceEnabled: r.serviceEnabled !== false,
    dlRequirement: (String(r.dlRequirement ?? "required") as DocRequirement),
    rcRequirement: (String(r.rcRequirement ?? "required") as DocRequirement),
    evProofRequirement: (String(r.evProofRequirement ?? "exempt") as DocRequirement),
    ownershipProofRequirement: (String(r.ownershipProofRequirement ?? "exempt") as DocRequirement),
    commercialProofRequirement: (String(r.commercialProofRequirement ?? "exempt") as DocRequirement),
    commercialRequired: r.commercialRequired === true,
    allowedVehicleClasses: arr(r.allowedVehicleClasses) as VehicleClass[],
    allowedFuelKinds: arr(r.allowedFuelKinds),
    allowedOwnership: arr(r.allowedOwnership) as OwnershipType[],
    priority: Number(r.priority ?? 100),
    isActive: r.isActive === true,
    effectiveFrom: r.effectiveFrom == null ? null : String(r.effectiveFrom),
    effectiveTo: r.effectiveTo == null ? null : String(r.effectiveTo),
  };
}

function ToggleRow(props: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>
        {props.label}
        {props.hint ? <span className="block font-normal text-slate-400">{props.hint}</span> : null}
      </span>
    </label>
  );
}

function ChipMultiSelect<T extends string>(props: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  disabledValue?: (value: T) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.options.map((o) => {
        const on = props.selected.includes(o.value);
        const disabled = props.disabledValue?.(o.value) ?? false;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => props.onToggle(o.value)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold transition " +
              (disabled
                ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                : on
                  ? "border-indigo-300 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {props.label}
      {props.children}
      {props.hint ? <span className="font-normal text-slate-400">{props.hint}</span> : null}
    </label>
  );
}

export function RiderEligibilityPolicyPanel(props: { level: string; refId: string; name: string }) {
  const { level, refId } = props;
  const [service, setService] = useState<EligibilityService>("food");
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingOpen, setAddingOpen] = useState(false);
  const [addForm, setAddForm] = useState<RuleForm>(defaultsForService("food"));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<RuleForm>(defaultsForService("food"));
  const [busyId, setBusyId] = useState<number | "new" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ level, refId, service });
      const res = await fetch(`/api/super-admin/geo/rider-eligibility-rules?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load eligibility rules");
      setRules(((json.rules ?? []) as Record<string, unknown>[]).map(mapRuleFromApi));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load eligibility rules");
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [level, refId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reset transient form/open state whenever the service changes.
  useEffect(() => {
    setAddingOpen(false);
    setEditingId(null);
    setAddForm(defaultsForService(service));
  }, [service]);

  function foodGuard(form: RuleForm): string | null {
    if (service === "food" && form.allowedVehicleClasses.some((c) => c !== "2_wheeler")) {
      return "Food is 2-wheeler only — remove 3/4-wheeler from allowed classes.";
    }
    if (form.allowedVehicleClasses.length === 0) {
      return "Select at least one allowed vehicle class.";
    }
    return null;
  }

  async function submitAdd() {
    const err = foodGuard(addForm);
    if (err) {
      toast.error(err);
      return;
    }
    setBusyId("new");
    try {
      const res = await fetch("/api/super-admin/geo/rider-eligibility-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, refId, service, ...addForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add rule");
      toast.success("Eligibility policy added");
      setAddingOpen(false);
      setAddForm(defaultsForService(service));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setBusyId(null);
    }
  }

  async function submitEdit(id: number) {
    const err = foodGuard(editForm);
    if (err) {
      toast.error(err);
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-eligibility-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save rule");
      toast.success("Eligibility policy saved");
      setEditingId(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(id: number) {
    if (!confirm("Delete this eligibility policy at this node? Effective policy will fall back to the inherited/default one.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-eligibility-rules/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete rule");
      toast.success("Eligibility policy deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    } finally {
      setBusyId(null);
    }
  }

  const hasLocalOverride = rules.length > 0;

  return (
    <div className="mt-6 rounded-2xl border border-indigo-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-indigo-100 px-6 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Rider eligibility · document policy
          </p>
          <h2 className="mt-0.5 truncate text-lg font-semibold text-slate-900">
            Who can receive this service here
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Separate from pricing. <strong>Document verification ≠ service eligibility</strong> — a verified
            DL/RC does not auto-grant every service. The backend engine decides from vehicle class, fuel,
            ownership and document gates; this only configures the geo policy.
          </p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setAddingOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Add override
        </button>
      </div>

      <div className="px-6 py-4">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {SERVICES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setService(s.value)}
              className={
                "px-4 py-2 text-sm font-semibold transition " +
                (service === s.value ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-50")
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading policy…
          </div>
        ) : (
          <>
            {!hasLocalOverride && !addingOpen ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                No override configured at this node. The effective policy is <strong>inherited</strong> from
                the nearest parent geo node (GLOBAL → STATE → … → PINCODE) or the built-in default. Use the
                simulator below to see the effective policy and its source, or add an override to change it
                here.
              </p>
            ) : null}

            {addingOpen ? (
              <RuleFormCard
                title="New override at this node"
                service={service}
                form={addForm}
                setForm={setAddForm}
                busy={busyId === "new"}
                onCancel={() => setAddingOpen(false)}
                onSave={submitAdd}
              />
            ) : null}

            <div className="mt-4 space-y-3">
              {rules.map((r) =>
                editingId === r.id ? (
                  <RuleFormCard
                    key={r.id}
                    title="Edit override"
                    service={service}
                    form={editForm}
                    setForm={setEditForm}
                    busy={busyId === r.id}
                    onCancel={() => setEditingId(null)}
                    onSave={() => submitEdit(r.id)}
                  />
                ) : (
                  <RuleSummaryCard
                    key={r.id}
                    rule={r}
                    busy={busyId === r.id}
                    onEdit={() => {
                      setEditingId(r.id);
                      setEditForm(ruleToForm(r));
                    }}
                    onDelete={() => deleteRule(r.id)}
                  />
                )
              )}
            </div>
          </>
        )}

        <EligibilitySimulator level={level} refId={refId} service={service} />
        <OnboardingSimulator level={level} refId={refId} />
      </div>
    </div>
  );
}

function Badge(props: { children: React.ReactNode; tone?: "green" | "slate" | "amber" | "indigo" | "rose" }) {
  const tone = props.tone ?? "slate";
  const cls =
    tone === "green"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : tone === "indigo"
          ? "bg-indigo-100 text-indigo-800"
          : tone === "rose"
            ? "bg-rose-100 text-rose-800"
            : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{props.children}</span>;
}

function reqTone(r: DocRequirement): "rose" | "amber" | "slate" {
  return r === "required" ? "rose" : r === "optional" ? "amber" : "slate";
}

function RuleSummaryCard(props: {
  rule: RuleRow;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const r = props.rule;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={r.serviceEnabled ? "green" : "rose"}>
            {r.serviceEnabled ? "Service enabled" : "Service OFF"}
          </Badge>
          <Badge tone={r.isActive ? "green" : "slate"}>{r.isActive ? "Active" : "Inactive"}</Badge>
          <Badge tone={reqTone(r.dlRequirement)}>DL {r.dlRequirement}</Badge>
          <Badge tone={reqTone(r.rcRequirement)}>RC {r.rcRequirement}</Badge>
          {r.commercialRequired ? <Badge tone="indigo">Commercial required</Badge> : null}
          <span className="text-xs text-slate-500">Priority {r.priority}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={props.onEdit}>
            Edit
          </button>
          <button type="button" className={btnSecondary} disabled={props.busy} onClick={props.onDelete}>
            {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        <span>
          Vehicle classes:{" "}
          <b>
            {r.allowedVehicleClasses.length
              ? r.allowedVehicleClasses
                  .map((c) => VEHICLE_CLASSES.find((v) => v.value === c)?.label ?? c)
                  .join(", ")
              : "none"}
          </b>
        </span>
        <span>
          Fuel:{" "}
          <b>
            {r.allowedFuelKinds.length
              ? r.allowedFuelKinds.map((f) => FUEL_KINDS.find((x) => x.value === f)?.label ?? f).join(", ")
              : "all"}
          </b>
        </span>
        <span>
          Ownership:{" "}
          <b>
            {r.allowedOwnership.length
              ? r.allowedOwnership.map((o) => OWNERSHIP.find((x) => x.value === o)?.label ?? o).join(", ")
              : "all"}
          </b>
        </span>
      </div>
    </div>
  );
}

function RuleFormCard(props: {
  title: string;
  service: EligibilityService;
  form: RuleForm;
  setForm: React.Dispatch<React.SetStateAction<RuleForm>>;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { form, setForm, service } = props;
  const toggleIn = <T extends string>(key: keyof RuleForm, value: T) =>
    setForm((f) => {
      const cur = f[key] as unknown as T[];
      const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
      return { ...f, [key]: next } as RuleForm;
    });

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">{props.title}</p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <ToggleRow
            checked={form.serviceEnabled}
            onChange={(v) => setForm((f) => ({ ...f, serviceEnabled: v }))}
            label="Service enabled at this location"
            hint="Off = no rider is eligible here regardless of documents."
          />
          <ToggleRow
            checked={form.commercialRequired}
            onChange={(v) => setForm((f) => ({ ...f, commercialRequired: v }))}
            label="Commercial vehicle required"
            hint="Person-Ride often requires a commercial vehicle; location-configurable."
          />
          <ToggleRow
            checked={form.isActive}
            onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            label="Rule active"
          />
          <Field label="Priority" hint="Higher wins when multiple rules match at this node.">
            <input
              type="number"
              className={inputCls}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="DL requirement">
            <select
              className={inputCls}
              value={form.dlRequirement}
              onChange={(e) => setForm((f) => ({ ...f, dlRequirement: e.target.value as DocRequirement }))}
            >
              {REQUIREMENTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="RC requirement">
            <select
              className={inputCls}
              value={form.rcRequirement}
              onChange={(e) => setForm((f) => ({ ...f, rcRequirement: e.target.value as DocRequirement }))}
            >
              {REQUIREMENTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Field label="EV proof (EVs only)">
            <select
              className={inputCls}
              value={form.evProofRequirement}
              onChange={(e) => setForm((f) => ({ ...f, evProofRequirement: e.target.value as DocRequirement }))}
            >
              {REQUIREMENTS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Ownership proof">
            <select
              className={inputCls}
              value={form.ownershipProofRequirement}
              onChange={(e) => setForm((f) => ({ ...f, ownershipProofRequirement: e.target.value as DocRequirement }))}
            >
              {REQUIREMENTS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Commercial proof (commercial only)">
            <select
              className={inputCls}
              value={form.commercialProofRequirement}
              onChange={(e) => setForm((f) => ({ ...f, commercialProofRequirement: e.target.value as DocRequirement }))}
            >
              {REQUIREMENTS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">Allowed vehicle classes</p>
          <ChipMultiSelect
            options={VEHICLE_CLASSES}
            selected={form.allowedVehicleClasses}
            onToggle={(v) => toggleIn("allowedVehicleClasses", v)}
            disabledValue={(v) => service === "food" && v !== "2_wheeler"}
          />
          {service === "food" ? (
            <p className="mt-1 text-[11px] text-slate-400">Food is 2-wheeler only.</p>
          ) : null}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">
            Allowed fuel kinds <span className="font-normal text-slate-400">(none selected = all allowed)</span>
          </p>
          <ChipMultiSelect
            options={FUEL_KINDS}
            selected={form.allowedFuelKinds}
            onToggle={(v) => toggleIn("allowedFuelKinds", v)}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">
            Allowed ownership <span className="font-normal text-slate-400">(none selected = all allowed)</span>
          </p>
          <ChipMultiSelect
            options={OWNERSHIP}
            selected={form.allowedOwnership}
            onToggle={(v) => toggleIn("allowedOwnership", v)}
          />
        </div>
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

type OnboardingSimResult = {
  onboarding: {
    status: string;
    paymentEligible: boolean;
    eligibleServices: EligibilityService[];
    blockedServices: { service: EligibilityService; missingDocuments: string[]; reasons: string[] }[];
    allEligible: boolean;
    nextAction: string;
  };
  services: Record<EligibilityService, EligibilityDecision>;
  resolvedGeo?: { level: string; refId: string } | null;
};

function OnboardingSimulator(props: { level: string; refId: string }) {
  const [vehicleClass, setVehicleClass] = useState<VehicleClass | "">("2_wheeler");
  const [fuelKind, setFuelKind] = useState<string>("petrol");
  const [ownership, setOwnership] = useState<OwnershipType>("non_commercial");
  const [dl, setDl] = useState<DocState>("missing");
  const [rc, setRc] = useState<DocState>("verified");
  const [identityVerified, setIdentityVerified] = useState(true);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [allowZero, setAllowZero] = useState(true);
  const [result, setResult] = useState<OnboardingSimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = useMemo(
    () => ({
      geoLevel: props.level,
      geoRefId: props.refId,
      vehicleClass: vehicleClass || null,
      fuelKind,
      ownership,
      dl,
      rc,
      identityVerified,
      identitySubmitted: true,
      paymentCompleted,
      allowZeroServiceEligibility: allowZero,
    }),
    [props.level, props.refId, vehicleClass, fuelKind, ownership, dl, rc, identityVerified, paymentCompleted, allowZero]
  );

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/super-admin/geo/rider-eligibility/simulate-onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setResult(null);
          setError(json?.error || json?.message || "Simulation failed");
        } else {
          setResult(json as OnboardingSimResult);
        }
      } catch (e) {
        if (!cancelled) {
          setResult(null);
          setError(e instanceof Error ? e.message : "Backend unreachable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [body]);

  const ob = result?.onboarding;
  const statusTone =
    ob?.status === "COMPLETE_FULL"
      ? "green"
      : ob?.status === "COMPLETE_LIMITED" || ob?.status === "READY_FOR_PAYMENT"
        ? "amber"
        : "rose";

  return (
    <div className="mt-6 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 to-fuchsia-50/40 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
          Onboarding requirement simulator — backend engine (authoritative)
        </p>
        {loading ? (
          <span className="flex items-center gap-1 text-xs text-violet-600">
            <Loader2 className="h-3 w-3 animate-spin" /> resolving…
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] text-violet-700">
        Simulates the WHOLE onboarding decision (all services + status + missing docs) via the same
        resolver production uses. Document verification ≠ onboarding completion ≠ service eligibility.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Field label="Vehicle class">
          <select className={inputCls} value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as VehicleClass | "")}>
            <option value="">None (no vehicle)</option>
            {VEHICLE_CLASSES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Fuel">
          <select className={inputCls} value={fuelKind} onChange={(e) => setFuelKind(e.target.value)}>
            {FUEL_KINDS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
          </select>
        </Field>
        <Field label="Ownership">
          <select className={inputCls} value={ownership} onChange={(e) => setOwnership(e.target.value as OwnershipType)}>
            {OWNERSHIP.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </Field>
        <Field label="DL state">
          <select className={inputCls} value={dl} onChange={(e) => setDl(e.target.value as DocState)}>
            {DOC_STATES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
        </Field>
        <Field label="RC state">
          <select className={inputCls} value={rc} onChange={(e) => setRc(e.target.value as DocState)}>
            {DOC_STATES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <ToggleRow checked={identityVerified} onChange={setIdentityVerified} label="Identity verified (aadhaar + selfie)" />
        <ToggleRow checked={paymentCompleted} onChange={setPaymentCompleted} label="Onboarding fee paid" />
        <ToggleRow checked={allowZero} onChange={setAllowZero} label="Allow zero-eligibility onboarding" />
      </div>

      {error ? (
        <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p>
      ) : ob ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone as "green" | "amber" | "rose"}>{ob.status.replaceAll("_", " ")}</Badge>
            <span className="text-xs text-slate-600">
              Payment {ob.paymentEligible ? "allowed" : "blocked"} · next: <b>{ob.nextAction.replaceAll("_", " ").toLowerCase()}</b>
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-emerald-700">Eligible services</p>
              {ob.eligibleServices.length ? (
                <ul className="mt-1 text-sm text-slate-700">
                  {ob.eligibleServices.map((s) => (<li key={s}>✓ {SERVICES.find((x) => x.value === s)?.label ?? s}</li>))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-400">none</p>
              )}
            </div>
            <div className="rounded-lg border border-rose-100 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold uppercase text-rose-700">Blocked services</p>
              {ob.blockedServices.length ? (
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {ob.blockedServices.map((b) => (
                    <li key={b.service}>
                      ✕ {SERVICES.find((x) => x.value === b.service)?.label ?? b.service}
                      {b.missingDocuments.length ? (
                        <span className="text-slate-500"> — needs {b.missingDocuments.map((m) => m.replaceAll("_", " ").toLowerCase()).join(", ")}</span>
                      ) : b.reasons[0] ? (
                        <span className="text-slate-500"> — {b.reasons[0]}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-400">none</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EligibilitySimulator(props: { level: string; refId: string; service: EligibilityService }) {
  const [vehicleClass, setVehicleClass] = useState<VehicleClass | "">("2_wheeler");
  const [fuelKind, setFuelKind] = useState<string>("petrol");
  const [ownership, setOwnership] = useState<OwnershipType>("non_commercial");
  const [dl, setDl] = useState<DocState>("verified");
  const [rc, setRc] = useState<DocState>("verified");
  const [decision, setDecision] = useState<EligibilityDecision | null>(null);
  const [policy, setPolicy] = useState<EffectivePolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = useMemo(
    () => ({
      service: props.service,
      geoLevel: props.level,
      geoRefId: props.refId,
      vehicleClass: vehicleClass || null,
      fuelKind,
      ownership,
      dl,
      rc,
    }),
    [props.service, props.level, props.refId, vehicleClass, fuelKind, ownership, dl, rc]
  );

  // Re-run the backend simulation (debounced) whenever any input or the geo node changes,
  // so the preview always reflects the SAME engine used at order-accept enforcement.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/super-admin/geo/rider-eligibility/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setDecision(null);
          setPolicy(null);
          setError(json?.error || json?.message || "Simulation failed");
        } else {
          setDecision(json.decision ?? null);
          setPolicy(json.policy ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setDecision(null);
          setPolicy(null);
          setError(e instanceof Error ? e.message : "Backend unreachable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [body]);

  return (
    <div className="mt-6 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-violet-50/50 px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">
          Eligibility simulator — backend engine (authoritative)
        </p>
        {loading ? (
          <span className="flex items-center gap-1 text-xs text-indigo-600">
            <Loader2 className="h-3 w-3 animate-spin" /> resolving…
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] text-indigo-700">
        POST /v1/rider-eligibility/simulate — the SAME engine + geo policy resolver used to block order
        acceptance. No formula is duplicated in the dashboard.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="Vehicle class">
          <select className={inputCls} value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as VehicleClass | "")}>
            <option value="">None (no vehicle)</option>
            {VEHICLE_CLASSES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fuel">
          <select className={inputCls} value={fuelKind} onChange={(e) => setFuelKind(e.target.value)}>
            {FUEL_KINDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ownership">
          <select className={inputCls} value={ownership} onChange={(e) => setOwnership(e.target.value as OwnershipType)}>
            {OWNERSHIP.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="DL state">
          <select className={inputCls} value={dl} onChange={(e) => setDl(e.target.value as DocState)}>
            {DOC_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="RC state">
          <select className={inputCls} value={rc} onChange={(e) => setRc(e.target.value as DocState)}>
            {DOC_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error ? (
        <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p>
      ) : decision ? (
        <div className="mt-4">
          <div
            className={
              "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold " +
              (decision.eligible ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900")
            }
          >
            {decision.eligible ? (
              <>
                <CheckCircle2 className="h-5 w-5" /> ELIGIBLE — rider may receive this service here.
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5" /> NOT ELIGIBLE — order acceptance would be blocked.
              </>
            )}
          </div>

          {decision.blocking.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {decision.blocking.map((b, i) => (
                <li key={i} className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <span className="font-semibold text-rose-800">{b.code}</span> — {b.reason}
                  {b.requiredAction ? (
                    <span className="mt-0.5 block text-slate-500">→ {b.requiredAction}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {policy ? (
            <div className="mt-3 rounded-lg border border-indigo-100 bg-white px-4 py-3 text-xs text-slate-700">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                Effective policy in force
                {policy.resolvedGeo ? (
                  <span className="ml-1 font-normal text-slate-500">
                    (from {policy.resolvedGeo.level.replaceAll("_", " ")})
                  </span>
                ) : (
                  <span className="ml-1 font-normal text-slate-500">(built-in default — no geo rule)</span>
                )}
              </p>
              <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                <span>Service: <b>{policy.serviceEnabled ? "enabled" : "disabled"}</b></span>
                <span>DL: <b>{policy.dlRequirement}</b></span>
                <span>RC: <b>{policy.rcRequirement}</b></span>
                <span>Commercial required: <b>{policy.commercialRequired ? "yes" : "no"}</b></span>
                <span>
                  Vehicle classes:{" "}
                  <b>{policy.allowedVehicleClasses.length ? policy.allowedVehicleClasses.join(", ") : "none"}</b>
                </span>
                <span>Fuel: <b>{policy.allowedFuelKinds.length ? policy.allowedFuelKinds.join(", ") : "all"}</b></span>
                <span>
                  Ownership: <b>{policy.allowedOwnership.length ? policy.allowedOwnership.join(", ") : "all"}</b>
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
