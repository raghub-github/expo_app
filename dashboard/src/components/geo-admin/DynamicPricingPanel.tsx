"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CloudRain, Loader2, Moon, Plus, Sparkles, TrendingUp } from "lucide-react";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";
import { SlabNumericInput } from "./SlabNumericInput";
import { VEHICLE_OPTIONS, PARCEL_VEHICLE_OPTIONS, type VehicleType } from "./rideVehicleTypes";

type RiderService = "food" | "parcel" | "ride";
type Mode = "NIGHT" | "RAIN" | "PEAK" | "FESTIVAL" | "HOLIDAY" | "HIGH_DEMAND" | "LOW_SUPPLY" | "MANUAL";
type ValueType = "FIXED" | "PER_KM" | "PERCENTAGE" | "MULTIPLIER";
type Funding = "customer" | "company" | "shared";

const MODES: { value: Mode; label: string }[] = [
  { value: "NIGHT", label: "Night" },
  { value: "RAIN", label: "Rain" },
  { value: "PEAK", label: "Peak hour" },
  { value: "FESTIVAL", label: "Festival" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "HIGH_DEMAND", label: "High demand" },
  { value: "LOW_SUPPLY", label: "Low supply" },
  { value: "MANUAL", label: "Manual / override" },
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Row = {
  id: number;
  mode: Mode;
  /** NULL = applies to all vehicles (food never has a vehicle). */
  vehicleType: VehicleType | null;
  name: string | null;
  valueType: ValueType;
  value: number;
  maxAmount: number | null;
  funding: Funding;
  customerSharePct: number;
  taxable: boolean;
  gstRate: number; // fraction 0..1
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: number[] | null;
  manualActive: boolean;
  isActive: boolean;
};

type Form = {
  mode: Mode;
  /** "" = applies to all vehicles. */
  vehicleType: VehicleType | "";
  name: string;
  valueType: ValueType;
  value: string;
  maxAmount: string;
  funding: Funding;
  customerSharePct: string;
  taxable: boolean;
  gstPct: string; // percent in UI
  allDay: boolean;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  manualActive: boolean;
  isActive: boolean;
};

const blankForm: Form = {
  mode: "NIGHT", vehicleType: "", name: "", valueType: "FIXED", value: "0", maxAmount: "", funding: "customer",
  customerSharePct: "50", taxable: false, gstPct: "18", allDay: false, startTime: "22:00",
  endTime: "06:00", daysOfWeek: [], manualActive: false, isActive: true,
};

const inputCls =
  "w-full min-w-[3.5rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50";

function modeIcon(m: Mode) {
  if (m === "NIGHT") return <Moon className="h-4 w-4" />;
  if (m === "RAIN") return <CloudRain className="h-4 w-4" />;
  if (m === "FESTIVAL" || m === "HOLIDAY") return <Sparkles className="h-4 w-4" />;
  return <TrendingUp className="h-4 w-4" />;
}

function mapRow(r: Record<string, unknown>): Row {
  return {
    id: Number(r.id),
    mode: String(r.mode) as Mode,
    vehicleType: (r.vehicleType ?? r.vehicle_type) == null ? null : (String(r.vehicleType ?? r.vehicle_type) as VehicleType),
    name: r.name == null ? null : String(r.name),
    valueType: String(r.valueType ?? r.value_type) as ValueType,
    value: Number(r.value),
    maxAmount: r.maxAmount == null && r.max_amount == null ? null : Number(r.maxAmount ?? r.max_amount),
    funding: String(r.funding) as Funding,
    customerSharePct: Number(r.customerSharePct ?? r.customer_share_pct ?? 100),
    taxable: (r.taxable ?? false) === true,
    gstRate: Number(r.gstRate ?? r.gst_rate ?? 0),
    allDay: (r.allDay ?? r.all_day) === true,
    startTime: (r.startTime ?? r.start_time) == null ? null : String(r.startTime ?? r.start_time).slice(0, 5),
    endTime: (r.endTime ?? r.end_time) == null ? null : String(r.endTime ?? r.end_time).slice(0, 5),
    daysOfWeek: Array.isArray(r.daysOfWeek ?? r.days_of_week)
      ? ((r.daysOfWeek ?? r.days_of_week) as unknown[]).map(Number)
      : null,
    manualActive: (r.manualActive ?? r.manual_active) === true,
    isActive: (r.isActive ?? r.is_active) === true,
  };
}

function rowToForm(r: Row): Form {
  return {
    mode: r.mode,
    vehicleType: r.vehicleType ?? "",
    name: r.name ?? "",
    valueType: r.valueType,
    value: String(r.value),
    maxAmount: r.maxAmount == null ? "" : String(r.maxAmount),
    funding: r.funding,
    customerSharePct: String(r.customerSharePct),
    taxable: r.taxable,
    gstPct: String(Math.round(r.gstRate * 10000) / 100),
    allDay: r.allDay,
    startTime: r.startTime ?? "22:00",
    endTime: r.endTime ?? "06:00",
    daysOfWeek: r.daysOfWeek ?? [],
    manualActive: r.manualActive,
    isActive: r.isActive,
  };
}

function valueTypeSuffix(t: ValueType): string {
  return t === "FIXED" ? "₹" : t === "PER_KM" ? "₹/km" : t === "PERCENTAGE" ? "% of fare" : "× fare";
}

function vehicleOptionsFor(service: RiderService) {
  return service === "parcel" ? PARCEL_VEHICLE_OPTIONS : VEHICLE_OPTIONS;
}

function vehicleLabel(service: RiderService, v: VehicleType): string {
  return vehicleOptionsFor(service).find((o) => o.value === v)?.label ?? v;
}

/**
 * Dynamic pricing editor: per-location Night / Rain / Peak / Festival / … surcharges for a
 * service. Admin sets the amount, WHO PAYS (customer / company / both + split), and the TIME
 * WINDOW (all-day, start–end, days, or a manual override). Customer-borne portion is added to
 * the bill; company-borne is recorded for rider incentive / settlement.
 */
export function DynamicPricingPanel(props: { level: string; refId: string; service: RiderService }) {
  const { level, refId, service } = props;
  const [rules, setRules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Form>(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Form>(blankForm);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ level, refId, service });
      const res = await fetch(`/api/super-admin/geo/dynamic-pricing?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRules(((json.rules ?? []) as Record<string, unknown>[]).map(mapRow));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dynamic pricing");
    } finally {
      setLoading(false);
    }
  }, [level, refId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function formToPayload(f: Form) {
    return {
      mode: f.mode,
      vehicleType: service === "food" || f.vehicleType === "" ? null : f.vehicleType,
      name: f.name.trim() || null,
      valueType: f.valueType,
      value: parseDecimalOrZero(f.value),
      maxAmount: f.maxAmount.trim() === "" ? null : parseDecimalOrZero(f.maxAmount),
      funding: f.funding,
      customerSharePct: parseDecimalOrZero(f.customerSharePct),
      taxable: f.taxable,
      gstRate: f.taxable ? Math.min(1, Math.max(0, parseDecimalOrZero(f.gstPct) / 100)) : 0,
      allDay: f.allDay,
      startTime: f.allDay || f.mode === "MANUAL" ? null : f.startTime || null,
      endTime: f.allDay || f.mode === "MANUAL" ? null : f.endTime || null,
      daysOfWeek: f.daysOfWeek.length > 0 ? f.daysOfWeek : null,
      manualActive: f.mode === "MANUAL" ? true : f.manualActive,
      isActive: f.isActive,
    };
  }

  async function submitAdd() {
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/geo/dynamic-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, refId, service, ...formToPayload(addForm) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success(`${addForm.mode} pricing saved for this location`);
      setAddOpen(false);
      setAddForm(blankForm);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(id: number) {
    setBusy(true);
    try {
      const { mode: _m, ...patch } = formToPayload(editForm);
      void _m;
      const res = await fetch(`/api/super-admin/geo/dynamic-pricing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      toast.success("Dynamic pricing updated");
      setEditingId(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/geo/dynamic-pricing/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast.success("Dynamic pricing removed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-800">
          <Moon className="h-4 w-4" /> Dynamic pricing — night / rain / peak / festival (this location)
        </div>
        <button type="button" className={btnPrimary} onClick={() => setAddOpen((v) => !v)}>
          <Plus className="h-4 w-4" /> Add mode
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Set the amount, <b>who pays</b> (customer / company / both + split), and <b>when</b>
        (all-day, a start–end window, specific days, or a manual override). Company-funded does not
        change the customer&apos;s price — it&apos;s recorded as a rider incentive.
      </p>
      <p className="mt-1.5 text-[11px] text-slate-400">
        This is the <span className="font-semibold text-slate-500">customer-facing</span> surge — the
        customer share is added to the bill (with GST). For surges paid to the{" "}
        <span className="font-semibold text-slate-500">rider only</span>, switch to the{" "}
        <span className="font-semibold text-slate-500">Rider</span> tab → Rider surge rules.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : null}

      {addOpen ? (
        <RuleForm form={addForm} setForm={setAddForm} onCancel={() => setAddOpen(false)} onSave={submitAdd} busy={busy} isEdit={false} service={service} />
      ) : null}

      {!loading && rules.length === 0 && !addOpen ? (
        <p className="mt-4 text-sm text-slate-500">
          No dynamic pricing at this node. Effective rules (if any) inherit from a parent geo node.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {rules.map((r) =>
          editingId === r.id ? (
            <RuleForm
              key={r.id}
              form={editForm}
              setForm={setEditForm}
              onCancel={() => setEditingId(null)}
              onSave={() => submitEdit(r.id)}
              busy={busy}
              isEdit
              service={service}
            />
          ) : (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-800">
                    {modeIcon(r.mode)} {r.name?.trim() || r.mode}
                  </span>
                  <span className="font-mono text-slate-700">
                    {r.value} {valueTypeSuffix(r.valueType)}
                    {r.maxAmount != null ? ` (cap ₹${r.maxAmount})` : ""}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {r.funding === "shared" ? `shared ${r.customerSharePct}% cust` : r.funding}
                  </span>
                  {r.vehicleType ? (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                      {vehicleLabel(service, r.vehicleType)}
                    </span>
                  ) : service !== "food" ? (
                    <span className="text-xs text-slate-400">all vehicles</span>
                  ) : null}
                  <span className="text-xs text-slate-500">
                    {r.manualActive || r.mode === "MANUAL"
                      ? "manual override"
                      : r.allDay
                        ? "all day"
                        : `${r.startTime ?? "—"}–${r.endTime ?? "—"}`}
                    {r.daysOfWeek && r.daysOfWeek.length > 0
                      ? ` · ${r.daysOfWeek.map((d) => DOW[d]).join(",")}`
                      : ""}
                  </span>
                  {r.taxable ? (
                    <span className="text-xs text-slate-500">GST {Math.round(r.gstRate * 10000) / 100}%</span>
                  ) : null}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {r.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={btnSecondary} onClick={() => { setEditingId(r.id); setEditForm(rowToForm(r)); }}>
                    Edit
                  </button>
                  <button type="button" className={btnSecondary} disabled={busy} onClick={() => del(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function RuleForm(props: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  isEdit: boolean;
  service: RiderService;
}) {
  const { form, setForm } = props;
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter((x) => x !== d) : [...f.daysOfWeek, d].sort(),
    }));
  const isManual = form.mode === "MANUAL";

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Mode">
          <select className={inputCls} value={form.mode} disabled={props.isEdit}
            onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as Mode }))}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        {props.service !== "food" ? (
          <Field label="Vehicle">
            <select className={inputCls} value={form.vehicleType} disabled={props.isEdit}
              onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value as VehicleType | "" }))}>
              <option value="">All vehicles</option>
              {vehicleOptionsFor(props.service).map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Label (optional)">
          <input className={inputCls} value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder={form.mode} />
        </Field>
        <Field label="Value type">
          <select className={inputCls} value={form.valueType} onChange={(e) => setForm((f) => ({ ...f, valueType: e.target.value as ValueType }))}>
            <option value="FIXED">Fixed ₹</option>
            <option value="PER_KM">Per km ₹</option>
            <option value="PERCENTAGE">% of fare</option>
            <option value="MULTIPLIER">Multiplier ×</option>
          </select>
        </Field>
        <Field label={`Value (${valueTypeSuffix(form.valueType)})`}>
          <SlabNumericInput value={form.value} onChange={set("value")} kind="decimal" className={inputCls} />
        </Field>

        <Field label="Max cap ₹ (optional)">
          <SlabNumericInput value={form.maxAmount} onChange={set("maxAmount")} kind="decimal" className={inputCls} placeholder="none" />
        </Field>
        <Field label="Who pays">
          <select className={inputCls} value={form.funding} onChange={(e) => setForm((f) => ({ ...f, funding: e.target.value as Funding }))}>
            <option value="customer">Customer</option>
            <option value="company">Company</option>
            <option value="shared">Both (shared)</option>
          </select>
        </Field>
        {form.funding === "shared" ? (
          <Field label="Customer share (%)">
            <SlabNumericInput value={form.customerSharePct} onChange={set("customerSharePct")} kind="decimal" className={inputCls} />
          </Field>
        ) : <div className="hidden sm:block" />}
        <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Active
        </label>
      </div>

      {/* Tax */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={form.taxable} onChange={(e) => setForm((f) => ({ ...f, taxable: e.target.checked }))} />
          GST on the customer portion
        </label>
        {form.taxable ? (
          <label className="flex items-center gap-1 text-xs text-slate-600">
            rate %
            <SlabNumericInput value={form.gstPct} onChange={set("gstPct")} kind="decimal" className={`${inputCls} w-20`} />
          </label>
        ) : null}
      </div>

      {/* Time window */}
      <div className="mt-3 rounded-lg border border-slate-100 bg-white/70 px-3 py-2">
        <p className="text-xs font-semibold uppercase text-slate-500">When does it apply?</p>
        {isManual ? (
          <p className="mt-1 text-xs text-slate-500">Manual mode is on whenever the rule is Active (no time window).</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} />
                All day
              </label>
              {!form.allDay ? (
                <>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    from <input type="time" className={`${inputCls} w-28`} value={form.startTime} onChange={(e) => set("startTime")(e.target.value)} />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    to <input type="time" className={`${inputCls} w-28`} value={form.endTime} onChange={(e) => set("endTime")(e.target.value)} />
                  </label>
                  <span className="text-[11px] text-slate-400">crosses midnight OK (e.g. 22:00–06:00)</span>
                </>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Days (empty = every day):</span>
              {DOW.map((d, i) => (
                <button key={d} type="button"
                  onClick={() => toggleDay(i)}
                  className={
                    "rounded-md border px-2 py-0.5 text-xs font-semibold " +
                    (form.daysOfWeek.includes(i)
                      ? "border-indigo-400 bg-indigo-100 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-500")
                  }>
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={props.onCancel} disabled={props.busy}>Cancel</button>
        <button type="button" className={btnPrimary} onClick={props.onSave} disabled={props.busy}>
          {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
        </button>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
      {props.label}
      {props.children}
    </label>
  );
}
