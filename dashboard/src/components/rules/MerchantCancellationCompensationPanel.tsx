"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Info, ChevronDown, ChevronUp, Store } from "lucide-react";
import { readApiJson } from "@/lib/payment/read-api-json";
import { useToast } from "@/context/ToastContext";
import { re } from "@/components/rules/gm-rule-engine-ui";
import {
  readMerchantCompensationCache,
  writeMerchantCompensationCache,
} from "@/components/rules/merchant-compensation-engine-cache";
import {
  EXCLUSION_LABELS,
  SCENARIO_LABELS,
} from "@/lib/merchant-cancellation-compensation";
import type {
  MerchantCompensationEnginePayload,
  MerchantCompensationExclusionCode,
  MerchantCompensationScenarioCode,
} from "@/lib/merchant-cancellation-compensation-engine.types";

type Props = {
  refreshKey?: number;
};

type Draft = {
  isEnabled: boolean;
  orderReadyAccuracyThreshold: string;
  customerCancelGraceSeconds: string;
  policyModalTitle: string;
  scenarios: Record<
    MerchantCompensationScenarioCode,
    {
      isEnabled: boolean;
      compensationPct: string;
      policyTitle: string;
      policyDescription: string;
      ledgerTitle: string;
      ledgerDescription: string;
    }
  >;
  exclusions: Record<
    MerchantCompensationExclusionCode,
    {
      isEnabled: boolean;
      policyTitle: string;
      policyDescription: string;
    }
  >;
};

const SCENARIO_CODES: MerchantCompensationScenarioCode[] = [
  "ORDER_PICKED_UP",
  "ORDER_READY_HIGH_ACCURACY",
  "ORDER_READY_LOW_ACCURACY",
  "NOT_ORDER_READY",
];

const EXCLUSION_CODES: MerchantCompensationExclusionCode[] = [
  "CUSTOMER_CANCEL_WITHIN_GRACE",
  "MERCHANT_ACCEPTED_CANCEL",
];

function draftFromPayload(p: MerchantCompensationEnginePayload): Draft {
  const scenarios = {} as Draft["scenarios"];
  for (const code of SCENARIO_CODES) {
    const row = p.scenarios.find((s) => s.scenarioCode === code);
    scenarios[code] = {
      isEnabled: row?.isEnabled ?? true,
      compensationPct: row != null ? String(row.compensationPct) : "0",
      policyTitle: row?.policyTitle ?? "",
      policyDescription: row?.policyDescription ?? "",
      ledgerTitle: row?.ledgerTitle ?? "",
      ledgerDescription: row?.ledgerDescription ?? "",
    };
  }
  const exclusions = {} as Draft["exclusions"];
  for (const code of EXCLUSION_CODES) {
    const row = p.exclusions.find((e) => e.exclusionCode === code);
    exclusions[code] = {
      isEnabled: row?.isEnabled ?? true,
      policyTitle: row?.policyTitle ?? "",
      policyDescription: row?.policyDescription ?? "",
    };
  }
  return {
    isEnabled: p.settings?.isEnabled ?? true,
    orderReadyAccuracyThreshold: String(p.settings?.orderReadyAccuracyThreshold ?? 80),
    customerCancelGraceSeconds: String(p.settings?.customerCancelGraceSeconds ?? 60),
    policyModalTitle: p.settings?.policyModalTitle ?? "Compensation Policy",
    scenarios,
    exclusions,
  };
}

export function MerchantCancellationCompensationPanel({ refreshKey = 0 }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  const applyPayload = useCallback((next: MerchantCompensationEnginePayload) => {
    setMigrationRequired(Boolean(next.migrationRequired));
    setDraft(draftFromPayload(next));
    if (!next.migrationRequired) writeMerchantCompensationCache(next);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent && !draft) setLoading(true);
      try {
        const res = await fetch("/api/super-admin/merchant-cancellation-compensation", {
          cache: "no-store",
        });
        const data = await readApiJson(res);
        if (!res.ok || !data.success) {
          toast(String(data.error ?? "Load failed"), "error");
          return;
        }
        applyPayload(data as MerchantCompensationEnginePayload & { success?: boolean });
      } catch (e) {
        if (!silent) toast(e instanceof Error ? e.message : "Load failed", "error");
      } finally {
        setLoading(false);
      }
    },
    [applyPayload, draft, toast]
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cached = readMerchantCompensationCache();
    if (!cached) {
      setDraft(null);
      setLoading(true);
    } else {
      applyPayload(cached);
      setLoading(false);
    }
    void load({ silent: Boolean(cached) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, [hydrated]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey only
  }, [refreshKey]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const threshold = Number.parseFloat(draft.orderReadyAccuracyThreshold);
      const grace = Number.parseInt(draft.customerCancelGraceSeconds, 10);
      const scenarios = Object.fromEntries(
        SCENARIO_CODES.map((code) => {
          const s = draft.scenarios[code];
          const pct = Number.parseFloat(s.compensationPct);
          return [
            code,
            {
              isEnabled: s.isEnabled,
              compensationPct: Number.isFinite(pct) ? pct : 0,
              policyTitle: s.policyTitle.trim(),
              policyDescription: s.policyDescription.trim(),
              ledgerTitle: s.ledgerTitle.trim(),
              ledgerDescription: s.ledgerDescription.trim(),
            },
          ];
        })
      );
      const exclusions = Object.fromEntries(
        EXCLUSION_CODES.map((code) => {
          const e = draft.exclusions[code];
          return [
            code,
            {
              isEnabled: e.isEnabled,
              policyTitle: e.policyTitle.trim(),
              policyDescription: e.policyDescription.trim(),
            },
          ];
        })
      );

      const res = await fetch("/api/super-admin/merchant-cancellation-compensation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            isEnabled: draft.isEnabled,
            orderReadyAccuracyThreshold: Number.isFinite(threshold) ? threshold : 80,
            customerCancelGraceSeconds: Number.isFinite(grace) ? grace : 60,
            policyModalTitle: draft.policyModalTitle.trim(),
          },
          scenarios,
          exclusions,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        toast(String(data.error ?? "Save failed"), "error");
        return;
      }
      applyPayload(data as MerchantCompensationEnginePayload & { success?: boolean });
      toast("Merchant compensation settings saved.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft) {
    return (
      <div className={`flex min-h-[280px] items-center justify-center ${re.card}`}>
        <Loader2 className="h-8 w-8 animate-spin text-[#5D3FD3]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Run migration{" "}
          <code className="font-mono">
            dashboard/drizzle/0271_merchant_cancellation_compensation_engine.sql
          </code>{" "}
          on your database.
        </div>
      ) : null}

      <div
        className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
        style={{ backgroundColor: re.accentSoft, borderColor: re.accentBorder, color: "#4338CA" }}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5D3FD3]" aria-hidden />
        <p>
          Configure what % of net order value merchants keep when an order is cancelled (Zomato-style
          compensation). Exclusions apply first; then scenario tiers based on pickup, order-ready
          status, and previous-week marking accuracy. Changes are live — no separate approval step.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <EnabledToggle
          enabled={draft.isEnabled}
          onChange={(isEnabled) => setDraft((d) => (d ? { ...d, isEnabled } : d))}
          label="Engine enabled"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || migrationRequired}
          className={re.btnPrimary}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save merchant compensation
        </button>
      </div>

      <section className={re.card}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Global settings</h3>
          <p className="mt-1 text-sm text-slate-500">
            Thresholds used when resolving compensation on cancelled orders.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">
              Order ready accuracy threshold (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={draft.orderReadyAccuracyThreshold}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, orderReadyAccuracyThreshold: e.target.value } : d
                )
              }
              className={re.input}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">
              Customer cancel grace (seconds)
            </span>
            <input
              type="number"
              min={0}
              max={3600}
              step={1}
              value={draft.customerCancelGraceSeconds}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, customerCancelGraceSeconds: e.target.value } : d
                )
              }
              className={re.input}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-slate-700">Policy modal title</span>
            <input
              type="text"
              value={draft.policyModalTitle}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, policyModalTitle: e.target.value } : d))
              }
              className={re.input}
            />
          </label>
        </div>
      </section>

      {SCENARIO_CODES.map((code) => {
        const s = draft.scenarios[code];
        const isCollapsed = collapsed[code] ?? false;
        return (
          <section key={code} className={re.card}>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-900">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F3F0FF] text-[#5D3FD3]">
                    <Store className="h-4 w-4" />
                  </span>
                  <span className="truncate">{SCENARIO_LABELS[code]}</span>
                </h3>
                <div className="flex shrink-0 items-center gap-3">
                  <EnabledToggle
                    enabled={s.isEnabled}
                    onChange={(isEnabled) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              scenarios: {
                                ...d.scenarios,
                                [code]: { ...d.scenarios[code], isEnabled },
                              },
                            }
                          : d
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [code]: !isCollapsed }))}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                  >
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            {!isCollapsed ? (
              <div className="space-y-4 border-t border-slate-100 px-5 py-5">
                <label className="block max-w-[200px] text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">
                    Merchant keeps (% of net order value)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={s.compensationPct}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              scenarios: {
                                ...d.scenarios,
                                [code]: { ...d.scenarios[code], compensationPct: e.target.value },
                              },
                            }
                          : d
                      )
                    }
                    className={re.input}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">
                    Policy title (merchant app)
                  </span>
                  <input
                    type="text"
                    value={s.policyTitle}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              scenarios: {
                                ...d.scenarios,
                                [code]: { ...d.scenarios[code], policyTitle: e.target.value },
                              },
                            }
                          : d
                      )
                    }
                    className={re.input}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">
                    Policy description (merchant app modal)
                  </span>
                  <textarea
                    rows={2}
                    value={s.policyDescription}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              scenarios: {
                                ...d.scenarios,
                                [code]: {
                                  ...d.scenarios[code],
                                  policyDescription: e.target.value,
                                },
                              },
                            }
                          : d
                      )
                    }
                    className={`${re.input} min-h-[72px] resize-y`}
                  />
                </label>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-slate-700">Ledger title</span>
                    <input
                      type="text"
                      value={s.ledgerTitle}
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                scenarios: {
                                  ...d.scenarios,
                                  [code]: { ...d.scenarios[code], ledgerTitle: e.target.value },
                                },
                              }
                            : d
                        )
                      }
                      className={re.input}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium text-slate-700">
                      Ledger description
                    </span>
                    <input
                      type="text"
                      value={s.ledgerDescription}
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                scenarios: {
                                  ...d.scenarios,
                                  [code]: {
                                    ...d.scenarios[code],
                                    ledgerDescription: e.target.value,
                                  },
                                },
                              }
                            : d
                        )
                      }
                      className={re.input}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      <section className={re.card}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">No compensation exclusions</h3>
          <p className="mt-1 text-sm text-slate-500">
            When enabled, merchant receives 0% regardless of scenario tier.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {EXCLUSION_CODES.map((code) => {
            const e = draft.exclusions[code];
            return (
              <div key={code} className="space-y-3 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-slate-900">{EXCLUSION_LABELS[code]}</p>
                  <EnabledToggle
                    enabled={e.isEnabled}
                    onChange={(isEnabled) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              exclusions: {
                                ...d.exclusions,
                                [code]: { ...d.exclusions[code], isEnabled },
                              },
                            }
                          : d
                      )
                    }
                  />
                </div>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Policy title</span>
                  <input
                    type="text"
                    value={e.policyTitle}
                    onChange={(ev) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              exclusions: {
                                ...d.exclusions,
                                [code]: { ...d.exclusions[code], policyTitle: ev.target.value },
                              },
                            }
                          : d
                      )
                    }
                    className={re.input}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Policy description</span>
                  <textarea
                    rows={2}
                    value={e.policyDescription}
                    onChange={(ev) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              exclusions: {
                                ...d.exclusions,
                                [code]: {
                                  ...d.exclusions[code],
                                  policyDescription: ev.target.value,
                                },
                              },
                            }
                          : d
                      )
                    }
                    className={`${re.input} min-h-[72px] resize-y`}
                  />
                </label>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function EnabledToggle({
  enabled,
  onChange,
  label = "Enabled",
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/30 focus:ring-offset-1 ${
          enabled ? "bg-[#5D3FD3]" : "bg-slate-200"
        }`}
      >
        <span
          className={`pointer-events-none mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </div>
  );
}
