"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bike, Loader2 } from "lucide-react";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";
import { SlabNumericInput } from "./SlabNumericInput";

type RiderService = "food" | "parcel" | "ride";
type Funding = "company" | "customer" | "shared";

type OverrideRow = {
  id: number;
  ratePerKm: number;
  funding: Funding;
  customerSharePct: number;
  minAmount: number | null;
  maxAmount: number | null;
  isActive: boolean;
};

type ApiResponse = {
  override: OverrideRow | null;
  effective: OverrideRow | null;
  inherited: boolean;
};

type Form = {
  ratePerKm: string;
  funding: Funding;
  customerSharePct: string;
  minAmount: string;
  maxAmount: string;
  isActive: boolean;
};

const blankForm: Form = {
  ratePerKm: "0",
  funding: "company",
  customerSharePct: "0",
  minAmount: "",
  maxAmount: "",
  isActive: true,
};

const inputCls =
  "w-full min-w-[4rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";
const selectCls = inputCls;
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50";

function mapRow(r: Record<string, unknown> | null): OverrideRow | null {
  if (!r) return null;
  return {
    id: Number(r.id),
    ratePerKm: Number(r.ratePerKm ?? r.rate_per_km ?? 0),
    funding: (String(r.funding ?? "company").toLowerCase() as Funding) ?? "company",
    customerSharePct: Number(r.customerSharePct ?? r.customer_share_pct ?? 0),
    minAmount: r.minAmount == null && r.min_amount == null ? null : Number(r.minAmount ?? r.min_amount),
    maxAmount: r.maxAmount == null && r.max_amount == null ? null : Number(r.maxAmount ?? r.max_amount),
    isActive: (r.isActive ?? r.is_active) === true,
  };
}

function rowToForm(r: OverrideRow): Form {
  return {
    ratePerKm: String(r.ratePerKm),
    funding: r.funding,
    customerSharePct: String(r.customerSharePct),
    minAmount: r.minAmount == null ? "" : String(r.minAmount),
    maxAmount: r.maxAmount == null ? "" : String(r.maxAmount),
    isActive: r.isActive,
  };
}

const FUNDING_LABEL: Record<Funding, string> = {
  company: "Company bears it (customer price unchanged)",
  customer: "Customer bears it (added on cancellation/order rule)",
  shared: "Shared (split company / customer)",
};

/**
 * Per-location rider PRE-PICKUP (first-mile) ₹/km compensation editor.
 *
 * Overrides the global Dispatch Coverage default for THIS geo node (and, by inheritance,
 * its descendants). When no override is set, the location falls back to the nearest
 * ancestor's override, or the global default. Never changes the customer's delivery price
 * unless funding = customer/shared.
 */
export function PrePickupCompensationPanel(props: { level: string; refId: string; service: RiderService }) {
  const { level, refId, service } = props;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState<OverrideRow | null>(null);
  const [effective, setEffective] = useState<OverrideRow | null>(null);
  const [inherited, setInherited] = useState(false);
  const [form, setForm] = useState<Form>(blankForm);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ level, refId, service });
      const res = await fetch(`/api/super-admin/geo/pre-pickup-compensation?${qs.toString()}`, {
        cache: "no-store",
      });
      const json: ApiResponse = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
      const ov = mapRow(json.override as Record<string, unknown> | null);
      setOverride(ov);
      setEffective(mapRow(json.effective as Record<string, unknown> | null));
      setInherited(Boolean(json.inherited));
      setForm(ov ? rowToForm(ov) : blankForm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load pre-pickup config");
    } finally {
      setLoading(false);
    }
  }, [level, refId, service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const rate = parseDecimalOrZero(form.ratePerKm);
  const minAmt = form.minAmount.trim() === "" ? null : parseDecimalOrZero(form.minAmount);
  const maxAmt = form.maxAmount.trim() === "" ? null : parseDecimalOrZero(form.maxAmount);

  // Tiny live preview: rate × distance, clamped to [min, max]. Matches prePickupAllowanceAmount.
  const [previewKm, setPreviewKm] = useState("4");
  const previewAmount = useMemo(() => {
    const km = parseDecimalOrZero(previewKm);
    let amt = rate > 0 ? rate * km : 0;
    if (maxAmt != null) amt = Math.min(amt, maxAmt);
    if (minAmt != null && amt > 0) amt = Math.max(amt, minAmt);
    return Math.round(Math.max(0, amt) * 100) / 100;
  }, [previewKm, rate, minAmt, maxAmt]);

  async function save() {
    if (maxAmt != null && minAmt != null && maxAmt < minAmt) {
      toast.error("Max must be ≥ Min");
      return;
    }
    const sharePct = parseDecimalOrZero(form.customerSharePct);
    if (form.funding === "shared" && (sharePct <= 0 || sharePct >= 100)) {
      toast.error("Customer share must be between 0 and 100 for shared funding");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/geo/pre-pickup-compensation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          refId,
          service,
          ratePerKm: rate,
          funding: form.funding,
          customerSharePct: form.funding === "shared" ? sharePct : 0,
          minAmount: minAmt,
          maxAmount: maxAmt,
          isActive: form.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success("Pre-pickup compensation saved for this location");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearOverride() {
    setBusy(true);
    try {
      const qs = new URLSearchParams({ level, refId, service });
      const res = await fetch(`/api/super-admin/geo/pre-pickup-compensation?${qs.toString()}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Clear failed");
      toast.success("Override removed — this location now inherits the parent / global rate");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-teal-800">
        <Bike className="h-4 w-4" /> Rider pre-pickup (first-mile) ₹/km — this location
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Pays the accepting rider for the pickup leg (rider → store/pickup). Overrides the global
        Dispatch Coverage default for this node and inherits down the tree. Company-funded does not
        change the customer&apos;s price.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* Effective / inheritance indicator */}
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {effective ? (
              <>
                Effective here: <b className="font-mono text-slate-800">₹{effective.ratePerKm}/km</b>{" "}
                · {effective.funding}
                {effective.minAmount != null ? ` · min ₹${effective.minAmount}` : ""}
                {effective.maxAmount != null ? ` · max ₹${effective.maxAmount}` : ""}
                {inherited ? (
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                    inherited from ancestor
                  </span>
                ) : (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                    set here
                  </span>
                )}
              </>
            ) : (
              <>No geo override on this chain — falls back to the global Dispatch Coverage default.</>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Rate (₹/km)">
              <SlabNumericInput value={form.ratePerKm} onChange={set("ratePerKm")} kind="decimal" className={inputCls} placeholder="e.g. 8" />
            </Field>
            <Field label="Funding">
              <select className={selectCls} value={form.funding} onChange={(e) => setForm((f) => ({ ...f, funding: e.target.value as Funding }))}>
                <option value="company">Company</option>
                <option value="customer">Customer</option>
                <option value="shared">Shared</option>
              </select>
            </Field>
            {form.funding === "shared" ? (
              <Field label="Customer share (%)">
                <SlabNumericInput value={form.customerSharePct} onChange={set("customerSharePct")} kind="decimal" className={inputCls} placeholder="e.g. 50" />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Field label="Min ₹ (optional)">
              <SlabNumericInput value={form.minAmount} onChange={set("minAmount")} kind="decimal" className={inputCls} placeholder="none" />
            </Field>
            <Field label="Max ₹ (optional cap)">
              <SlabNumericInput value={form.maxAmount} onChange={set("maxAmount")} kind="decimal" className={inputCls} placeholder="none" />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Active
            </label>
          </div>

          <p className="mt-2 text-[11px] text-slate-500">{FUNDING_LABEL[form.funding]}</p>

          {/* Live preview */}
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2 text-sm">
            <span className="text-xs font-semibold text-teal-800">Preview:</span>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              rider→pickup
              <SlabNumericInput value={previewKm} onChange={setPreviewKm} kind="decimal" className={`${inputCls} w-20`} />
              km
            </label>
            <span className="text-teal-400">→</span>
            <span className="font-mono font-bold text-teal-800">₹{previewAmount.toFixed(2)}</span>
            <span className="text-xs text-slate-500">first-mile allowance</span>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {override ? (
              <button type="button" className={btnSecondary} onClick={clearOverride} disabled={busy}>
                Clear override
              </button>
            ) : null}
            <button type="button" className={btnPrimary} onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save for this location
            </button>
          </div>
        </>
      )}
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
