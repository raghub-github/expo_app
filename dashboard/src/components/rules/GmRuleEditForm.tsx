"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { readApiJson } from "@/lib/payment/read-api-json";
import { gmForm, GmFormSection, GmRuleFormSkeleton, statusPillClass } from "@/components/rules/gm-rule-form-ui";
import {
  defaultGmRuleForm,
  formToApiPayload,
  snapshotToForm,
  type GmRuleFormState,
} from "@/components/rules/gm-rule-form-model";
import { mergeRuleIntoGmRuleEngineCache } from "@/components/rules/gm-rule-engine-cache";
import {
  GmRuleFaultSection,
  GmRuleFinancialMatrixSection,
  GmRuleFundingRecoverySection,
  GmRuleLimitsWalletSection,
  GmRuleRefundSection,
  GmRuleWalletImpactSection,
} from "@/components/rules/GmRuleFinancialSections";

type Catalogs = {
  serviceTypes: { code: string; label: string }[];
  orderStages: { code: string; label: string }[];
  triggeredBy: { code: string; label: string }[];
  cancellationReasons: { id: number; label: string; attribute: string }[];
  scenarioTypes: string[];
  faultBuckets: string[];
  refundRecipients: string[];
  refundFundingSources?: string[];
  merchantPenaltyRecoverySources?: string[];
  riderPenaltyRecoverySources?: string[];
  customerPenaltyRecoverySources?: string[];
  activeStatuses: string[];
};

type Props = {
  ruleId?: number | null;
  catalogs: Catalogs | null;
  initialForm?: GmRuleFormState;
};

const RULE_ENGINE_LIST = "/dashboard/super-admin/rule-engine";

export function GmRuleEditForm({ ruleId, catalogs, initialForm }: Props) {
  const router = useRouter();
  const isEdit = ruleId != null && ruleId > 0;
  const [form, setForm] = useState<GmRuleFormState>(initialForm ?? defaultGmRuleForm());
  const [loading, setLoading] = useState(isEdit && !initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isEdit || !ruleId || initialForm) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/super-admin/gm-rules/${ruleId}`, { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) throw new Error(String(data.error ?? "Load failed"));
      setForm(snapshotToForm((data.row as Record<string, unknown>) ?? {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [isEdit, ruleId, initialForm]);

  useEffect(() => {
    router.prefetch(RULE_ENGINE_LIST);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!isEdit && !form.rule_code.trim()) {
        throw new Error("Rule code is required");
      }
      if (!form.rule_name.trim()) {
        throw new Error("Rule name is required");
      }

      const payload = formToApiPayload(form, isEdit);
      const res = await fetch(
        isEdit ? `/api/super-admin/gm-rules/${ruleId}` : "/api/super-admin/gm-rules",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        const details =
          data.details && typeof data.details === "object"
            ? JSON.stringify(data.details)
            : "";
        throw new Error(
          details ? `${String(data.error ?? "Save failed")}: ${details}` : String(data.error ?? "Save failed")
        );
      }
      toast.success(
        isEdit
          ? `"${form.rule_name}" saved successfully`
          : `"${form.rule_name}" created successfully`
      );
      if (data.row && typeof data.row === "object") {
        mergeRuleIntoGmRuleEngineCache(data.row as Record<string, unknown>);
      }
      router.replace(RULE_ENGINE_LIST);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof GmRuleFormState>(key: K, value: GmRuleFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (loading) {
    return <GmRuleFormSkeleton />;
  }

  const pageTitle = isEdit ? `Edit · ${form.rule_code || "Rule"}` : "Create financial rule";
  const pageSubtitle = isEdit
    ? "Update refund, liability, funding, and wallet settings for this rule."
    : "Define when this rule applies and how money moves across customer, merchant, rider, and platform.";

  return (
    <div className={gmForm.page}>
      {error && <div className={gmForm.error}>{error}</div>}

      <div className={gmForm.shell}>
        <div className={gmForm.hero}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                <Sparkles className="h-3.5 w-3.5" />
                Financial rule engine
              </p>
              <h1 className={gmForm.heroTitle}>{pageTitle}</h1>
              <p className={gmForm.heroSub}>{pageSubtitle}</p>
            </div>
            <div className={gmForm.heroBadges}>
              <span className={`${gmForm.pill} ${gmForm.pillScenario}`}>{form.scenario_type}</span>
              <span className={`${gmForm.pill} ${statusPillClass(form.active_status)}`}>
                {form.active_status}
              </span>
              <span className={`${gmForm.pill} ${gmForm.pillInactive}`}>Priority {form.priority}</span>
            </div>
          </div>
        </div>

        <div className={gmForm.body}>
          <GmFormSection title="Rule details">
            <div className={gmForm.grid}>
            <label className={gmForm.label}>
              Rule code
              <input
                className={`${gmForm.input} font-mono text-xs`}
                value={form.rule_code}
                disabled={isEdit}
                onChange={(e) => set("rule_code", e.target.value.toUpperCase())}
              />
            </label>
            <label className={gmForm.label}>
              Rule name
              <input
                className={gmForm.input}
                value={form.rule_name}
                onChange={(e) => set("rule_name", e.target.value)}
              />
            </label>
            <label className={`${gmForm.label} col-span-2 md:col-span-2 lg:col-span-2 xl:col-span-2`}>
              Description
              <input
                className={gmForm.input}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className={gmForm.label}>
              Scenario
              <select
                className={gmForm.input}
                value={form.scenario_type}
                onChange={(e) => set("scenario_type", e.target.value)}
              >
                {(catalogs?.scenarioTypes ?? []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={gmForm.label}>
              Status
              <select
                className={gmForm.input}
                value={form.active_status}
                onChange={(e) => set("active_status", e.target.value)}
              >
                {(catalogs?.activeStatuses ?? ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={gmForm.label}>
              Priority
              <input
                type="number"
                className={gmForm.input}
                value={form.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
              />
            </label>
            </div>
          </GmFormSection>

          <GmFormSection title="Conditions">
            <div className={gmForm.grid4}>
              <label className={gmForm.label}>
                Service type
                <select
                  className={gmForm.input}
                  value={form.conditions.service_type}
                  onChange={(e) =>
                    set("conditions", { ...form.conditions, service_type: e.target.value })
                  }
                >
                  {(catalogs?.serviceTypes ?? []).map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={gmForm.label}>
                Order stage
                <select
                  className={gmForm.input}
                  value={form.conditions.order_stage}
                  onChange={(e) =>
                    set("conditions", { ...form.conditions, order_stage: e.target.value })
                  }
                >
                  {(catalogs?.orderStages ?? []).map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={gmForm.label}>
                Triggered by
                <select
                  className={gmForm.input}
                  value={form.conditions.triggered_by ?? ""}
                  onChange={(e) =>
                    set("conditions", {
                      ...form.conditions,
                      triggered_by: e.target.value ? e.target.value : null,
                    })
                  }
                >
                  <option value="">Any (all parties)</option>
                  {(catalogs?.triggeredBy ?? []).map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={gmForm.label}>
                Cancellation reason
                <select
                  className={gmForm.input}
                  value={form.conditions.cancellation_reason_id ?? ""}
                  onChange={(e) =>
                    set("conditions", {
                      ...form.conditions,
                      cancellation_reason_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Any</option>
                  {(catalogs?.cancellationReasons ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.attribute}: {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </GmFormSection>

          <GmRuleRefundSection form={form} catalogs={catalogs} setForm={setForm} />
          <GmRuleFundingRecoverySection form={form} catalogs={catalogs} setForm={setForm} />
          <GmRuleFaultSection form={form} catalogs={catalogs} setForm={setForm} />
          <GmRuleFinancialMatrixSection form={form} setForm={setForm} />
          <GmRuleWalletImpactSection form={form} setForm={setForm} />
          <GmRuleLimitsWalletSection form={form} setForm={setForm} />

          <GmFormSection title="Audit">
            <label className={gmForm.label}>
              Change reason
              <input
                className={gmForm.input}
                value={form.change_reason}
                onChange={(e) => set("change_reason", e.target.value)}
                placeholder="Required when editing"
              />
            </label>
          </GmFormSection>
        </div>

        <div className={gmForm.footer}>
          <p className="hidden text-xs text-slate-500 sm:block">
            {isEdit ? "Changes are versioned in the audit log." : "New rules start as DRAFT until activated."}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Link href={RULE_ENGINE_LIST} className={gmForm.btnSecondary}>
              Cancel
            </Link>
            <button
              type="button"
              disabled={saving}
              className={gmForm.btnPrimary}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create rule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
