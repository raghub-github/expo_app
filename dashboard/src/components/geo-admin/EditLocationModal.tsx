"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  useGeoUpdateNodeMutation,
  useGeoDeleteNodeMutation,
  useGeoPricingContextQuery,
  useGeoCreatePricingRuleMutation,
  useGeoDeletePricingRuleMutation,
  useGeoUpdatePricingRuleMutation,
} from "@/store/api/geoAdminApi";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import { geoPricingRefKey } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/store/api/geoAdminApi";
import { resolveGeoEffectiveRules } from "@/lib/geo-pricing-inheritance";
import { toast } from "sonner";
import {
  CarFront,
  ChevronRight,
  Layers,
  Loader2,
  MapPin,
  Package,
  PencilLine,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeoPricingRuleRow } from "@/lib/geo/geo-shared";

type NonRoot = Exclude<GeoHierarchyLevel, "root">;

const levelBadge: Record<string, string> = {
  state: "border-violet-200 bg-violet-50 text-violet-800",
  region: "border-sky-200 bg-sky-50 text-sky-800",
  district: "border-cyan-200 bg-cyan-50 text-cyan-900",
  division: "border-amber-200 bg-amber-50 text-amber-900",
  post_office: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pincode: "border-rose-200 bg-rose-50 text-rose-900",
};

function formatLevel(l: string): string {
  return l.replaceAll("_", " ");
}

const serviceMeta = {
  food: { label: "Food", Icon: Utensils, chip: "bg-orange-50 text-orange-800 border-orange-200/80" },
  parcel: { label: "Parcel", Icon: Package, chip: "bg-sky-50 text-sky-800 border-sky-200/80" },
  ride: { label: "Ride", Icon: CarFront, chip: "bg-violet-50 text-violet-800 border-violet-200/80" },
} as const;

function RulesMiniTable(props: { rules: GeoPricingRuleRow[] }) {
  const active = props.rules.filter((r) => r.is_active);
  if (active.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-500">
        No pricing rules stored at this level.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/90">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <th className="px-2.5 py-1.5">Service</th>
            <th className="px-2.5 py-1.5">Rule</th>
            <th className="px-2.5 py-1.5 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {active.map((r) => {
            const sm = serviceMeta[r.service as keyof typeof serviceMeta];
            const Icon = sm?.Icon ?? Package;
            return (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-2.5 py-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold",
                      sm?.chip ?? "border-slate-200 bg-slate-50 text-slate-700"
                    )}
                  >
                    <Icon className="h-3 w-3 opacity-80" aria-hidden />
                    {sm?.label ?? r.service}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 font-medium text-slate-700">{r.rule_type}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-slate-800">
                  {r.value_numeric ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const EditLocationModal = React.memo(function EditLocationModal(props: {
  row: GeoChildRow | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [branchType, setBranchType] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [ruleType, setRuleType] = useState("base_fee");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleService, setRuleService] = useState<"food" | "parcel" | "ride">("food");
  const [rulePriority, setRulePriority] = useState("0");
  const [editNumeric, setEditNumeric] = useState<Record<string, string>>({});

  const [updateMut, { isLoading: saving }] = useGeoUpdateNodeMutation();
  const [delMut, { isLoading: deleting }] = useGeoDeleteNodeMutation();
  const [createRuleMut, { isLoading: ruleAdding }] = useGeoCreatePricingRuleMutation();
  const [delRuleMut] = useGeoDeletePricingRuleMutation();
  const [patchRuleMut] = useGeoUpdatePricingRuleMutation();
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [patchingRuleId, setPatchingRuleId] = useState<string | null>(null);

  const row = props.row;
  const level = row ? (row.kind as NonRoot) : null;

  useEffect(() => {
    if (!row) return;
    setName(row.name);
    setBranchType("");
    setLat(row.latitude ?? "");
    setLng(row.longitude ?? "");
    setEditNumeric({});
  }, [row]);

  const { data: ctx, isLoading: ctxLoading, isError: ctxError } = useGeoPricingContextQuery(
    { level: row?.kind ?? "state", refId: row?.id ?? "" },
    { skip: !row?.id }
  );

  const effective = useMemo(
    () => (ctx ? resolveGeoEffectiveRules(ctx.chain, ctx.rulesByRef) : []),
    [ctx]
  );

  const currentRefKey = row ? geoPricingRefKey({ level: row.kind as NonRoot, id: row.id }) : "";
  const ownRules = ctx?.rulesByRef[currentRefKey] ?? [];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row || !level) return;
    try {
      if (level === "post_office") {
        await updateMut({
          level,
          id: row.id,
          name,
          branchType: branchType || null,
          latitude: lat === "" ? null : Number(lat),
          longitude: lng === "" ? null : Number(lng),
        }).unwrap();
      } else {
        await updateMut({ level, id: row.id, name }).unwrap();
      }
      toast.success("Updated");
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function softDelete() {
    if (!row || !level) return;
    if (!confirm(`Soft-delete this ${row.kind}?`)) return;
    try {
      await delMut({ level, id: row.id }).unwrap();
      toast.success("Deactivated");
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    const num = ruleValue === "" ? null : Number(ruleValue);
    const pr = rulePriority === "" ? 0 : Number(rulePriority);
    if (Number.isNaN(pr)) {
      toast.error("Priority must be a number");
      return;
    }
    try {
      await createRuleMut({
        level: row.kind,
        refId: row.id,
        service: ruleService,
        ruleType,
        valueNumeric: num,
        priority: pr,
      }).unwrap();
      toast.success("Rule added");
      setRuleValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add rule");
    }
  }

  async function saveRulePatch(r: GeoPricingRuleRow) {
    const raw = editNumeric[r.id] ?? r.value_numeric ?? "";
    const num = raw === "" ? null : Number(raw);
    if (raw !== "" && Number.isNaN(num)) {
      toast.error("Value must be numeric");
      return;
    }
    setPatchingRuleId(r.id);
    try {
      await patchRuleMut({
        id: r.id,
        ruleType: r.rule_type,
        valueNumeric: num,
        valueJson: r.value_json,
        priority: r.priority,
        isActive: r.is_active,
      }).unwrap();
      toast.success("Rule updated");
      setEditNumeric((m) => {
        const n = { ...m };
        delete n[r.id];
        return n;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPatchingRuleId(null);
    }
  }

  if (!row || !level) return null;

  const currentStep = ctx?.chain[ctx.chain.length - 1];
  const isOrphanChain = ctx && ctx.chain.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="geo-edit-title"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_25px_80px_-20px_rgba(15,23,42,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 px-6 pb-8 pt-6 text-white">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 rounded-full bg-cyan-300/20 blur-2xl" />
          <button
            type="button"
            onClick={props.onClose}
            className="absolute right-4 top-4 rounded-xl border border-white/20 bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-10">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-inner">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-100/90">
                Geo directory
              </p>
              <h2 id="geo-edit-title" className="text-xl font-bold tracking-tight">
                Edit {formatLevel(row.kind)}
              </h2>
              {ctxLoading ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-teal-100/85">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Loading hierarchy…
                </p>
              ) : ctxError ? (
                <p className="mt-2 text-sm text-amber-100">{row.path}</p>
              ) : ctx && ctx.chain.length > 0 ? (
                <nav
                  className="mt-3 flex flex-wrap items-center gap-1 text-xs font-medium text-teal-50/95"
                  aria-label="Location path"
                >
                  {ctx.chain.map((step, i) => (
                    <React.Fragment key={`${step.level}-${step.id}`}>
                      {i > 0 ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                      ) : null}
                      <span
                        className={cn(
                          "max-w-[10rem] truncate rounded-lg border border-white/20 bg-black/10 px-2 py-0.5 backdrop-blur-sm",
                          step.id === row.id && step.level === row.kind && "border-white/40 bg-white/20 font-semibold"
                        )}
                        title={step.name}
                      >
                        {step.name}
                      </span>
                    </React.Fragment>
                  ))}
                </nav>
              ) : (
                <p className="mt-2 text-sm text-teal-100/85">{row.path}</p>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-gradient-to-b from-slate-50/90 to-white px-5 py-5 sm:px-6">
          <form onSubmit={save} className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
              <div className="mb-3 flex items-center gap-2 text-slate-800">
                <PencilLine className="h-4 w-4 text-teal-600" aria-hidden />
                <h3 className="text-sm font-bold">Location details</h3>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name / pincode
                </span>
                <input
                  className="rounded-xl border border-slate-200 bg-slate-50/30 px-3 py-2.5 text-sm font-medium text-slate-900 shadow-inner transition focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {row.kind === "post_office" && (
                <div className="mt-3 space-y-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branch type
                    </span>
                    <input
                      className="rounded-xl border border-slate-200 bg-slate-50/30 px-3 py-2.5 text-sm shadow-inner focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      value={branchType}
                      onChange={(e) => setBranchType(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Latitude
                      </span>
                      <input
                        className="rounded-xl border border-slate-200 bg-slate-50/30 px-3 py-2.5 text-sm font-mono focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Longitude
                      </span>
                      <input
                        className="rounded-xl border border-slate-200 bg-slate-50/30 px-3 py-2.5 text-sm font-mono focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving || deleting}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-600/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Save changes
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  onClick={props.onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || deleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-2.5 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                  onClick={() => void softDelete()}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Deactivate
                </button>
              </div>
            </div>
          </form>

          <section className="mt-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-800">
              <Layers className="h-4 w-4 text-teal-600" aria-hidden />
              <h3 className="text-sm font-bold">Pricing by hierarchy</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Rules set on a parent apply to children unless you add an override on a lower level. Nearest level to
              this location wins.
            </p>

            {ctxLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 to-slate-50"
                  />
                ))}
              </div>
            )}

            {ctxError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Could not load pricing hierarchy. Check your connection and try again.
              </p>
            )}

            {!ctxLoading && !ctxError && ctx && (
              <>
                {isOrphanChain && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    No parent chain found for this record (it may be orphaned in the database).
                  </p>
                )}

                <div className="relative space-y-0 pl-3">
                  <div className="absolute bottom-2 left-[11px] top-2 w-px bg-gradient-to-b from-teal-200 via-teal-300 to-teal-100" />
                  {ctx.chain.map((step, idx) => {
                    const k = geoPricingRefKey(step);
                    const stepRules = ctx.rulesByRef[k] ?? [];
                    const isCurrent = step.id === row.id && step.level === row.kind;
                    return (
                      <div key={k} className="relative pb-5 pl-6 last:pb-0">
                        <span className="absolute left-0 top-2 flex h-[9px] w-[9px] rounded-full border-2 border-white bg-teal-500 shadow ring-2 ring-teal-200/80" />
                        <div
                          className={cn(
                            "rounded-2xl border p-4 shadow-sm transition",
                            isCurrent
                              ? "border-teal-300/80 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/40 shadow-teal-200/30"
                              : "border-slate-200/80 bg-white/95 shadow-slate-200/20"
                          )}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                                levelBadge[step.level] ?? "border-slate-200 bg-slate-50 text-slate-700"
                              )}
                            >
                              {formatLevel(step.level)}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{step.name}</span>
                            {isCurrent ? (
                              <span className="rounded-full border border-teal-200 bg-teal-100/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-900">
                                You are here
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                Step {idx + 1} of {ctx.chain.length}
                              </span>
                            )}
                          </div>
                          <RulesMiniTable rules={stepRules} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-teal-50/40 p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
                    <h4 className="text-sm font-bold text-slate-900">Effective values here</h4>
                  </div>
                  <p className="mb-3 text-[11px] text-slate-600">
                    Resolved defaults for{" "}
                    <strong className="text-slate-800">
                      {currentStep?.name ?? row.name}
                    </strong>{" "}
                    — closest defined rule in the chain is used.
                  </p>
                  {effective.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-violet-200 bg-white/60 px-3 py-2 text-xs text-slate-600">
                      No rules defined anywhere above or on this node. Add a rule below to set amounts.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-violet-100 bg-white/90">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <th className="px-2.5 py-2">Service</th>
                            <th className="px-2.5 py-2">Rule</th>
                            <th className="px-2.5 py-2 text-right">Amount</th>
                            <th className="px-2.5 py-2">Applies from</th>
                          </tr>
                        </thead>
                        <tbody>
                          {effective.map((er) => {
                            const sm = serviceMeta[er.service as keyof typeof serviceMeta];
                            const Icon = sm?.Icon ?? Package;
                            const fromHere =
                              er.source.id === row.id && er.source.level === row.kind;
                            return (
                              <tr key={`${er.service}-${er.ruleType}-${er.ruleId}`} className="border-b border-slate-50 last:border-0">
                                <td className="px-2.5 py-2">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold",
                                      sm?.chip ?? "border-slate-200 bg-slate-50"
                                    )}
                                  >
                                    <Icon className="h-3 w-3" aria-hidden />
                                    {sm?.label ?? er.service}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2 font-medium text-slate-700">{er.ruleType}</td>
                                <td className="px-2.5 py-2 text-right font-mono text-slate-900">
                                  {er.valueNumeric ?? "—"}
                                </td>
                                <td className="px-2.5 py-2 text-slate-600">
                                  {fromHere ? (
                                    <span className="font-semibold text-teal-700">This location</span>
                                  ) : (
                                    <>
                                      <span className="font-medium text-slate-800">
                                        {formatLevel(er.source.level)}
                                      </span>
                                      <span className="text-slate-400"> · </span>
                                      <span className="max-w-[8rem] truncate align-bottom" title={er.source.name}>
                                        {er.source.name}
                                      </span>
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-slate-900">Rules on this location</h4>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Add or adjust rules here to override parents for this node only.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {ownRules.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">
                            {r.service} · {r.rule_type}
                          </span>
                          <span className="mx-1.5 text-slate-300">|</span>
                          <span className="font-mono">priority {r.priority}</span>
                          {!r.is_active && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                              inactive
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                            placeholder={r.value_numeric ?? "0"}
                            value={editNumeric[r.id] ?? r.value_numeric ?? ""}
                            onChange={(e) =>
                              setEditNumeric((m) => ({ ...m, [r.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            disabled={
                              patchingRuleId !== null ||
                              String(editNumeric[r.id] ?? r.value_numeric ?? "") ===
                                String(r.value_numeric ?? "")
                            }
                            className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                            onClick={() => void saveRulePatch(r)}
                          >
                            {patchingRuleId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Update"
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={deletingRuleId !== null}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                            onClick={() => {
                              setDeletingRuleId(r.id);
                              void delRuleMut({ id: r.id, refId: row.id })
                                .unwrap()
                                .then(() => toast.success("Removed"))
                                .catch(() => toast.error("Remove failed"))
                                .finally(() => setDeletingRuleId(null));
                            }}
                          >
                            {deletingRuleId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Remove"
                            )}
                          </button>
                        </div>
                      </li>
                    ))}
                    {ownRules.length === 0 && (
                      <li className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
                        No rules on this node yet — values flow from parents until you add one.
                      </li>
                    )}
                  </ul>

                  <form onSubmit={addRule} className="mt-4 rounded-xl border border-teal-100 bg-teal-50/20 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
                      New rule
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="flex min-w-[5.5rem] flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Service</span>
                        <select
                          value={ruleService}
                          onChange={(e) => setRuleService(e.target.value as "food" | "parcel" | "ride")}
                          className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        >
                          <option value="food">Food</option>
                          <option value="parcel">Parcel</option>
                          <option value="ride">Ride</option>
                        </select>
                      </label>
                      <label className="flex min-w-[6.5rem] flex-1 flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Rule type</span>
                        <input
                          className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                          placeholder="e.g. base_fee"
                          value={ruleType}
                          onChange={(e) => setRuleType(e.target.value)}
                        />
                      </label>
                      <label className="flex w-full min-w-[5rem] flex-col gap-1 sm:w-28">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Amount</span>
                        <input
                          className="rounded-xl border border-slate-200 bg-white px-2 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                          placeholder="0"
                          value={ruleValue}
                          onChange={(e) => setRuleValue(e.target.value)}
                        />
                      </label>
                      <label className="flex w-full min-w-[4rem] flex-col gap-1 sm:w-20">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Priority</span>
                        <input
                          className="rounded-xl border border-slate-200 bg-white px-2 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                          value={rulePriority}
                          onChange={(e) => setRulePriority(e.target.value)}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={ruleAdding}
                        className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-md disabled:opacity-50 sm:shrink-0"
                      >
                        {ruleAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Add rule
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
});
