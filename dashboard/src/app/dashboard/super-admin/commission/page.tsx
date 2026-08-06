"use client";

/**
 * Unified Commission Engine dashboard — single page covering:
 *   1. Platform default % (singleton config)
 *   2. Subscription plan benefits (commission_percent_override per plan)
 *   3. Per-store overrides (search by numeric id OR GMMC… code)
 *
 * Backed by the four /api/admin/commission/* endpoints. Every mutation here
 * writes to commission_audit_log on the server side, so navigating to the
 * audit timeline is just "scroll to the bottom".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Plug,
  Search,
  Trash2,
  Store as StoreIcon,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

/* ─────────────────────────── Types ─────────────────────────── */

type SaveState = "idle" | "saving" | "saved" | "error";

type PlanRow = {
  id: number;
  planName: string;
  planCode: string;
  commissionPercentOverride: string | null;
  commissionBenefitActive: boolean;
};

type StoreSummary = {
  id: number;
  storeId: string;
  storeName: string;
  storeDisplayName: string | null;
  city: string | null;
  approvalStatus: string | null;
  parentId: number | null;
};

type ActiveTrace = {
  percent: number;
  sourceKind: "DEFAULT" | "STORE_OVERRIDE" | "SUBSCRIPTION" | "PROMOTIONAL";
  sourceLabel: string;
  sourceRuleId: number | null;
  sourcePlanId: number | null;
  sourceSubscriptionId: number | null;
  validUntil: string | null;
};

type Rule = {
  id: number;
  commissionType: string;
  commissionValue: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  priority: number;
  sourceKind: "MANUAL_OVERRIDE" | "PROMOTIONAL" | "SUBSCRIPTION_BENEFIT";
  reason: string | null;
};

type AuditRow = {
  id: number;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
};

type StoreState = {
  storeId: number;
  store: StoreSummary;
  active: ActiveTrace;
  rules: Rule[];
  audit: AuditRow[];
};

/* ───────────────────────── Styling tokens ───────────────────────── */

const inputClass =
  "w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/* ────────────────────────────── Page ────────────────────────────── */

export default function CommissionAdminPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: permLoading } = usePermissions();

  /* Platform default */
  const [defaultPercent, setDefaultPercent] = useState<string>("");
  const [defaultReason, setDefaultReason] = useState("");
  const [defaultState, setDefaultState] = useState<SaveState>("idle");

  /* Plan benefits */
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [planEdits, setPlanEdits] = useState<Record<number, { percent: string; active: boolean }>>({});
  const [planStates, setPlanStates] = useState<Record<number, SaveState>>({});

  /* Per-store */
  const [searchInput, setSearchInput] = useState("");
  const [storeState, setStoreState] = useState<StoreState | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [newPercent, setNewPercent] = useState("");
  const [newKind, setNewKind] = useState<"MANUAL_OVERRIDE" | "PROMOTIONAL">("MANUAL_OVERRIDE");
  const [newPriority, setNewPriority] = useState("100");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [newReason, setNewReason] = useState("");
  const [creating, setCreating] = useState(false);

  /* Top-level page loading + error */
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadGlobal = useCallback(async () => {
    setPageLoading(true);
    setPageError(null);
    try {
      const [defRes, planRes] = await Promise.all([
        fetch("/api/admin/commission/default", { cache: "no-store" }),
        fetch("/api/admin/commission/plans", { cache: "no-store" }),
      ]);
      const defJson = await defRes.json();
      const planJson = await planRes.json();
      if (!defJson?.success) throw new Error(defJson?.error || "Failed to load default");
      if (!planJson?.success) throw new Error(planJson?.error || "Failed to load plans");
      setDefaultPercent(String(defJson.percent ?? "15"));
      setPlans(planJson.plans ?? []);
      const edits: Record<number, { percent: string; active: boolean }> = {};
      (planJson.plans as PlanRow[]).forEach((p) => {
        edits[p.id] = {
          percent: p.commissionPercentOverride ?? "",
          active: p.commissionBenefitActive,
        };
      });
      setPlanEdits(edits);
    } catch (e) {
      setPageError((e as Error).message);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
    if (!permLoading && isSuperAdmin) void loadGlobal();
  }, [permLoading, isSuperAdmin, loadGlobal, router]);

  const saveDefault = useCallback(async () => {
    const n = Number(defaultPercent);
    if (!Number.isFinite(n) || n < 0 || n >= 100) {
      setPageError("Default percent must be in [0, 100)");
      return;
    }
    setDefaultState("saving");
    setPageError(null);
    try {
      const res = await fetch("/api/admin/commission/default", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent: n, reason: defaultReason.trim() || undefined }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Save failed");
      setDefaultState("saved");
      setDefaultReason("");
      setTimeout(() => setDefaultState("idle"), 2000);
    } catch (e) {
      setPageError((e as Error).message);
      setDefaultState("error");
    }
  }, [defaultPercent, defaultReason]);

  const savePlan = useCallback(
    async (planId: number) => {
      const edit = planEdits[planId];
      if (!edit) return;
      const percentTrim = edit.percent.trim();
      const percentVal = percentTrim === "" ? null : Number(percentTrim);
      if (percentVal != null && (!Number.isFinite(percentVal) || percentVal < 0 || percentVal >= 100)) {
        setPageError("Plan percent must be empty or in [0, 100)");
        return;
      }
      setPlanStates((s) => ({ ...s, [planId]: "saving" }));
      try {
        const res = await fetch(`/api/admin/commission/plans/${planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commissionPercentOverride: percentVal,
            benefitActive: edit.active,
          }),
        });
        const json = await res.json();
        if (!json?.success) throw new Error(json?.error || "Save failed");
        setPlanStates((s) => ({ ...s, [planId]: "saved" }));
        setTimeout(() => setPlanStates((s) => ({ ...s, [planId]: "idle" })), 2000);
        await loadGlobal();
      } catch (e) {
        setPageError((e as Error).message);
        setPlanStates((s) => ({ ...s, [planId]: "error" }));
      }
    },
    [planEdits, loadGlobal],
  );

  const sample = useMemo(() => {
    const pct = Number(defaultPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return null;
    const customer = (150 * 100) / (100 - pct);
    return {
      pct,
      customer: Math.round(customer),
      exact: customer.toFixed(2),
      platformEarning: Math.round(customer) - 150,
    };
  }, [defaultPercent]);

  /* Per-store */
  const loadStore = useCallback(async (idOrCode: string) => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const url = `/api/admin/commission/stores/${encodeURIComponent(idOrCode.trim())}`;
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Failed to load store");
      setStoreState({
        storeId: json.storeId,
        store: json.store,
        active: json.active,
        rules: json.rules,
        audit: json.audit,
      });
    } catch (e) {
      setStoreError((e as Error).message);
      setStoreState(null);
    } finally {
      setStoreLoading(false);
    }
  }, []);

  const onSearch = useCallback(() => {
    const v = searchInput.trim();
    if (!v) {
      setStoreError("Enter a store id (numeric) or code (e.g. GMMC1015)");
      return;
    }
    void loadStore(v);
  }, [searchInput, loadStore]);

  const createRule = useCallback(async () => {
    if (!storeState) return;
    const pct = Number(newPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
      setStoreError("Percent must be in [0, 100)");
      return;
    }
    setCreating(true);
    setStoreError(null);
    try {
      const res = await fetch(`/api/admin/commission/stores/${storeState.storeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commissionPercent: pct,
          serviceType: "FOOD",
          effectiveFrom: new Date().toISOString(),
          effectiveTo: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
          sourceKind: newKind,
          priority: Number(newPriority) || 100,
          reason: newReason.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Create failed");
      setNewPercent("");
      setNewReason("");
      setNewExpiresAt("");
      await loadStore(String(storeState.storeId));
    } catch (e) {
      setStoreError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [storeState, newPercent, newKind, newPriority, newExpiresAt, newReason, loadStore]);

  const deactivate = useCallback(
    async (ruleId: number) => {
      if (!storeState) return;
      if (!confirm("Deactivate this rule? It will stop applying immediately.")) return;
      setStoreError(null);
      try {
        const res = await fetch(
          `/api/admin/commission/stores/${storeState.storeId}/rules/${ruleId}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "Admin deactivated from dashboard" }),
          },
        );
        const json = await res.json();
        if (!json?.success) throw new Error(json?.error || "Deactivate failed");
        await loadStore(String(storeState.storeId));
      } catch (e) {
        setStoreError((e as Error).message);
      }
    },
    [storeState, loadStore],
  );

  /* ─────────────────────────── Render ─────────────────────────── */

  if (permLoading || pageLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {pageError ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{pageError}</div>
        </div>
      ) : null}

      {/* ───────────────── 1. PLATFORM DEFAULT ───────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-900">1. Platform default</h2>
        <p className="mb-4 text-sm text-gray-600">
          Fallback used by any store that has no manual override and no active subscription benefit.
          Stored on the singleton <code>store_onboarding_commission_config</code> row.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Default commission %</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              max={99.99}
              step={0.01}
              value={defaultPercent}
              onChange={(e) => setDefaultPercent(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-700">Reason (audit log)</label>
            <input
              className={inputClass}
              type="text"
              placeholder="Why the rate is changing — visible in audit history"
              value={defaultReason}
              onChange={(e) => setDefaultReason(e.target.value)}
            />
          </div>
        </div>
        {sample ? (
          <div className="mt-3 rounded bg-violet-50 px-3 py-2 text-xs text-violet-900">
            Preview at <strong>{sample.pct}%</strong>: a merchant base price of ₹150 displays to the
            customer as <strong>₹{sample.customer}</strong> (exact ₹{sample.exact}), and the platform
            earns ₹{sample.platformEarning} per item.
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveDefault}
            disabled={defaultState === "saving"}
            className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {defaultState === "saving" ? "Saving…" : "Save default"}
          </button>
          {defaultState === "saved" ? <span className="text-xs text-emerald-600">Saved</span> : null}
        </div>
      </section>

      {/* ───────────────── 2. SUBSCRIPTION BENEFITS ───────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
          <Plug className="h-4 w-4 text-violet-500" />
          2. Subscription benefits
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          When a merchant has an <em>active</em> subscription on a plan with the benefit enabled, the
          plan&apos;s commission % beats the platform default but loses to any per-store manual override.
        </p>
        <div className="overflow-hidden rounded-md border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="px-3 py-2 text-left font-medium">Benefit %</th>
                <th className="px-3 py-2 text-left font-medium">Active</th>
                <th className="px-3 py-2 text-right font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-500">
                    No active merchant plans found.
                  </td>
                </tr>
              ) : (
                plans.map((p) => {
                  const edit = planEdits[p.id] ?? { percent: "", active: false };
                  const state = planStates[p.id] ?? "idle";
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-gray-900">
                        <div className="font-medium">{p.planName}</div>
                        <div className="text-xs text-gray-500">{p.planCode}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className={`${inputClass} max-w-[7rem]`}
                          type="number"
                          min={0}
                          max={99.99}
                          step={0.01}
                          placeholder="—"
                          value={edit.percent}
                          onChange={(e) =>
                            setPlanEdits((s) => ({
                              ...s,
                              [p.id]: { ...s[p.id]!, percent: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={edit.active}
                            onChange={(e) =>
                              setPlanEdits((s) => ({
                                ...s,
                                [p.id]: { ...s[p.id]!, active: e.target.checked },
                              }))
                            }
                          />
                          {edit.active ? "On" : "Off"}
                        </label>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => savePlan(p.id)}
                          disabled={state === "saving"}
                          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                        >
                          {state === "saving" ? "…" : "Save"}
                        </button>
                        {state === "saved" ? (
                          <span className="ml-2 text-xs text-emerald-600">✓</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ───────────────── 3. PER-STORE OVERRIDES ───────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
          <StoreIcon className="h-4 w-4 text-violet-500" />
          3. Per-store overrides
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Manual overrides take priority over subscription benefits and the platform default. Use a
          promotional rule for time-boxed reductions (e.g. festival weeks).
        </p>

        {/* Search box — accepts either form */}
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Store ID or code (e.g. <code>45</code> or <code>GMMC1015</code>)
            </label>
            <input
              className={inputClass}
              type="text"
              placeholder="GMMC1015"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
            />
          </div>
          <button
            type="button"
            onClick={onSearch}
            disabled={storeLoading}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {storeLoading ? "Loading…" : "Load"}
          </button>
        </div>

        {storeError ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{storeError}</div>
          </div>
        ) : null}

        {storeState ? (
          <>
            {/* Store identity card — proves we fetched the right store */}
            <div className="mb-4 flex flex-wrap items-start gap-x-6 gap-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                {storeState.store.storeDisplayName || storeState.store.storeName}
              </div>
              <div className="text-xs text-emerald-800">
                <span className="font-mono">{storeState.store.storeId}</span>
                <span className="mx-2 text-emerald-600">•</span>
                <span>internal id #{storeState.store.id}</span>
                {storeState.store.city ? (
                  <>
                    <span className="mx-2 text-emerald-600">•</span>
                    <span>{storeState.store.city}</span>
                  </>
                ) : null}
                {storeState.store.approvalStatus ? (
                  <>
                    <span className="mx-2 text-emerald-600">•</span>
                    <span>{storeState.store.approvalStatus}</span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Active rate */}
            <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs uppercase tracking-wide text-violet-700">Active rate</div>
              <div className="mt-1 text-3xl font-bold text-violet-900">{storeState.active.percent}%</div>
              <div className="mt-1 text-xs text-violet-800">
                Source: <strong>{storeState.active.sourceLabel}</strong>
                {storeState.active.validUntil
                  ? ` (until ${fmtDate(storeState.active.validUntil)})`
                  : ""}
              </div>
            </div>

            {/* Add new rule */}
            <div className="mb-4 rounded-md border border-gray-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Add new rule</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Percent</label>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={99.99}
                    step={0.01}
                    value={newPercent}
                    onChange={(e) => setNewPercent(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Kind</label>
                  <select
                    className={inputClass}
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as "MANUAL_OVERRIDE" | "PROMOTIONAL")}
                  >
                    <option value="MANUAL_OVERRIDE">Manual override (priority 1)</option>
                    <option value="PROMOTIONAL">Promotional (priority 3)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Priority</label>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    step={1}
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Expires (optional)
                  </label>
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Reason</label>
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="audit note"
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={createRule}
                  disabled={creating}
                  className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create rule"}
                </button>
              </div>
            </div>

            {/* Rules table */}
            <div className="mb-4 overflow-hidden rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">%</th>
                    <th className="px-3 py-2 text-left font-medium">Kind</th>
                    <th className="px-3 py-2 text-left font-medium">Priority</th>
                    <th className="px-3 py-2 text-left font-medium">From</th>
                    <th className="px-3 py-2 text-left font-medium">To</th>
                    <th className="px-3 py-2 text-left font-medium">Active</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-right font-medium">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {storeState.rules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-xs text-gray-500">
                        No rules for this store. Resolver falls back to subscription / default.
                      </td>
                    </tr>
                  ) : (
                    storeState.rules.map((r) => (
                      <tr key={r.id} className={!r.isActive ? "opacity-50" : ""}>
                        <td className="px-3 py-2 font-semibold text-gray-900">{r.commissionValue}%</td>
                        <td className="px-3 py-2">{r.sourceKind}</td>
                        <td className="px-3 py-2">{r.priority}</td>
                        <td className="px-3 py-2">{fmtDate(r.effectiveFrom)}</td>
                        <td className="px-3 py-2">{fmtDate(r.effectiveTo)}</td>
                        <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{r.reason ?? "—"}</td>
                        <td className="px-3 py-2 text-right">
                          {r.isActive ? (
                            <button
                              type="button"
                              onClick={() => deactivate(r.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              Deactivate
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Audit log */}
            <div className="rounded-md border border-gray-200 p-3">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-900">
                <Clock className="h-3.5 w-3.5 text-gray-500" />
                Audit log for this store
              </h3>
              {storeState.audit.length === 0 ? (
                <div className="text-xs text-gray-500">No audit entries yet.</div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {storeState.audit.map((a) => (
                    <li key={a.id} className="rounded border border-gray-100 bg-gray-50 p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{a.action}</span>
                        <span className="text-gray-500">{fmtDate(a.createdAt)}</span>
                      </div>
                      {a.reason ? <div className="mt-1 text-gray-700">{a.reason}</div> : null}
                      {a.actorRole ? <div className="text-gray-500">by {a.actorRole}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            Enter a store ID above and press Load to view its commission rules.
          </div>
        )}
      </section>
    </div>
  );
}
