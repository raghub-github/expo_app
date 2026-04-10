"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreatePricingRuleMutation, type PricingRuleTypeApi } from "@/store/api/pricingRulesApi";
import { ConditionBuilder, conditionsToJson, type ConditionState } from "./ConditionBuilder";
import { SlabEditor, type DistanceSlab } from "./SlabEditor";

const tabs = [
  { id: "basic" as const, label: "Basic" },
  { id: "distance" as const, label: "Distance" },
  { id: "time" as const, label: "Time" },
  { id: "conditions" as const, label: "Conditions" },
  { id: "incentives" as const, label: "Incentives" },
];

type Service = "food" | "parcel" | "ride";

export function RuleEditor(props: {
  open: boolean;
  onClose: () => void;
  level: string;
  refId: string;
  geoTitle?: string;
  defaultService?: Service;
  defaultRuleType?: PricingRuleTypeApi;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("basic");
  const [serviceType, setServiceType] = useState<Service>(props.defaultService ?? "food");
  const [ruleType, setRuleType] = useState<PricingRuleTypeApi>(props.defaultRuleType ?? "customer_delivery_fee");
  const [priority, setPriority] = useState(0);
  const [override, setOverride] = useState(false);

  const [baseFare, setBaseFare] = useState<number | "">("");
  const [perKm, setPerKm] = useState<number | "">("");
  const [surge, setSurge] = useState<number | "">("");
  const [waiting, setWaiting] = useState<number | "">("");
  const [discountPct, setDiscountPct] = useState<number | "">("");

  const [conditions, setConditions] = useState<ConditionState>({});
  const [slabs, setSlabs] = useState<DistanceSlab[]>([]);

  const [createRule, { isLoading }] = useCreatePricingRuleMutation();

  const actionsJson = useMemo(() => {
    const a: Record<string, unknown> = {};
    if (baseFare !== "") a.base_fare = Number(baseFare);
    if (perKm !== "") a.per_km = Number(perKm);
    if (surge !== "") a.surge_multiplier = Number(surge);
    if (waiting !== "") a.waiting_charge = Number(waiting);
    if (discountPct !== "") a.discount_percent = Number(discountPct);
    if (slabs.length) a.distance_slabs = slabs;
    return a;
  }, [baseFare, perKm, surge, waiting, discountPct, slabs]);

  const conditionsJson = useMemo(() => conditionsToJson(conditions), [conditions]);

  const reset = () => {
    setTab("basic");
    setServiceType(props.defaultService ?? "food");
    setRuleType(props.defaultRuleType ?? "customer_delivery_fee");
    setPriority(0);
    setOverride(false);
    setBaseFare("");
    setPerKm("");
    setSurge("");
    setWaiting("");
    setDiscountPct("");
    setConditions({});
    setSlabs([]);
  };

  if (!props.open) return null;

  const onSave = async () => {
    try {
      const res = await createRule({
        ruleType,
        serviceType,
        level: props.level,
        refId: props.refId,
        conditions: conditionsJson,
        actions: actionsJson,
        priority,
        isActive: true,
        override,
      }).unwrap();
      toast.success("Rule created", { description: res.rule?.id?.slice(0, 8) });
      reset();
      props.onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="rule-editor-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div>
            <p id="rule-editor-title" className="text-base font-bold text-slate-900">
              Pricing rule
            </p>
            <p className="text-xs text-slate-500">
              {props.geoTitle ?? `${props.level} · ${props.refId.slice(0, 8)}…`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              props.onClose();
            }}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-slate-600">Service</span>
              <select
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as Service)}
              >
                <option value="food">food</option>
                <option value="parcel">parcel</option>
                <option value="ride">ride</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-slate-600">Rule type</span>
              <select
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as PricingRuleTypeApi)}
              >
                <option value="customer_delivery_fee">customer_delivery_fee</option>
                <option value="rider_payout">rider_payout</option>
                <option value="surge_pricing">surge_pricing</option>
                <option value="discount">discount</option>
                <option value="commission">commission</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-slate-600">Priority</span>
              <input
                type="number"
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-center gap-2 pt-5 text-xs">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
              />
              <span className="text-slate-700">Override (metadata; resolution uses priority + geo step)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold",
                  tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "basic" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="text-slate-600">Base fare (₹)</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  value={baseFare}
                  onChange={(e) => setBaseFare(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600">Per km (₹)</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  value={perKm}
                  onChange={(e) => setPerKm(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600">Surge multiplier</span>
                <input
                  type="number"
                  step="0.01"
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  value={surge}
                  onChange={(e) => setSurge(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600">Waiting ₹/min</span>
                <input
                  type="number"
                  step="0.01"
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  value={waiting}
                  onChange={(e) => setWaiting(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="text-slate-600">Discount %</span>
                <input
                  type="number"
                  className="mt-0.5 w-full max-w-xs rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {tab === "distance" && <SlabEditor value={slabs} onChange={setSlabs} />}

          {tab === "time" && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-3 text-sm text-amber-950">
              <p className="font-medium">Peak / night / weekend</p>
              <p className="mt-1 text-xs text-amber-900/90">
                Use the <strong>Conditions</strong> tab: set <code className="rounded bg-white/60 px-1">time_range</code> for peak or
                night windows, and <code className="rounded bg-white/60 px-1">day_of_week</code> for weekends. Multiple rules with different
                priorities can model stacked scenarios.
              </p>
            </div>
          )}

          {tab === "conditions" && <ConditionBuilder value={conditions} onChange={setConditions} />}

          {tab === "incentives" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Rider incentives</p>
              <p className="mt-2 text-xs leading-relaxed">
                Per-order bonuses, targets, and hourly guarantees will be configured in a dedicated flow later. This rule engine table
                already supports <code className="rounded bg-white px-1">rider_payout</code> and future incentive types.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                reset();
                props.onClose();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              onClick={onSave}
            >
              {isLoading ? "Saving…" : "Create rule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
