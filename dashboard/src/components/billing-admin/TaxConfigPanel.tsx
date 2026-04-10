"use client";

import type { Dispatch, SetStateAction } from "react";

export type TaxFormState = {
  name: string;
  service_type: "FOOD" | "PARCEL" | "RIDE" | "ALL";
  rate: string;
  applicable_base: string;
  tax_group: string;
  priority: string;
  is_active: boolean;
  is_hidden: boolean;
  metadata: string;
};

/**
 * Inline fields for creating/editing a row in `billing_tax_configs` (+ linked TAX pricing rule).
 */
export function TaxConfigPanel({
  taxForm,
  setTaxForm,
  taxPercentDisplay,
  setTaxPriorityField,
  taxBases,
  taxGroups,
  labelCls,
  inputCls,
  selectCls,
}: {
  taxForm: TaxFormState;
  setTaxForm: Dispatch<SetStateAction<TaxFormState>>;
  taxPercentDisplay: string;
  setTaxPriorityField: (v: string) => void;
  taxBases: readonly string[];
  taxGroups: readonly string[];
  labelCls: string;
  inputCls: string;
  selectCls: string;
}) {
  return (
    <>
      <div className="sm:col-span-2 rounded-xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50/90 to-sky-50/90 px-3 py-2.5 text-sm text-slate-800 shadow-sm">
        Tax configuration is stored in <code className="text-[11px]">billing_tax_configs</code> with a linked TAX row in{" "}
        <code className="text-[11px]">billing_pricing_rules</code> for engine order. Saving a tax here creates or updates
        that row. If you removed slabs in SQL only, use &quot;Attach missing tax rows&quot; on the Charge order card.
        Rider tip and donation stay non-taxable by design.
      </div>
      <div>
        <label className={labelCls} htmlFor="tax-name-inline">
          Name (shown on bill)
        </label>
        <input
          id="tax-name-inline"
          className={inputCls}
          value={taxForm.name}
          onChange={(e) => setTaxForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="tax-service-inline">
          Service line
        </label>
        <select
          id="tax-service-inline"
          className={selectCls}
          value={taxForm.service_type}
          onChange={(e) => setTaxForm((f) => ({ ...f, service_type: e.target.value as (typeof f)["service_type"] }))}
        >
          {(["FOOD", "PARCEL", "RIDE", "ALL"] as const).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="tax-rate-inline">
          Tax rate (%)
        </label>
        <input
          id="tax-rate-inline"
          className={inputCls}
          value={taxPercentDisplay}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setTaxForm((f) => ({ ...f, rate: Number.isFinite(v) ? String(v / 100) : "0" }));
          }}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="tax-base-inline">
          Applicable base
        </label>
        <select
          id="tax-base-inline"
          className={selectCls}
          value={taxForm.applicable_base}
          onChange={(e) => setTaxForm((f) => ({ ...f, applicable_base: e.target.value }))}
        >
          {taxBases.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="tax-group-inline">
          Tax group (UI / exports)
        </label>
        <select
          id="tax-group-inline"
          className={selectCls}
          value={taxForm.tax_group}
          onChange={(e) => setTaxForm((f) => ({ ...f, tax_group: e.target.value }))}
        >
          {taxGroups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="tax-priority-inline">
          Priority
        </label>
        <input
          id="tax-priority-inline"
          className={inputCls}
          inputMode="numeric"
          value={taxForm.priority}
          onChange={(e) => setTaxPriorityField(e.target.value)}
        />
        <p className="mt-0.5 text-xs text-slate-500">
          Pre-filled to the next free slot for this service line (max tax priority + 10). You can override it; duplicate
          priorities are rejected so ordering remains explicit.
        </p>
      </div>
    </>
  );
}
