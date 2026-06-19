"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Save,
  Package,
  Info,
  ChevronDown,
  ChevronUp,
  UserCog,
} from "lucide-react";
import { readApiJson } from "@/lib/payment/read-api-json";
import { useToast } from "@/context/ToastContext";
import { re } from "@/components/rules/gm-rule-engine-ui";
import {
  readRiderPenaltyCache,
  writeRiderPenaltyCache,
} from "@/components/rules/rider-penalty-engine-cache";
import type {
  PenaltyCatalogChannel,
  PenaltyPartyCode,
  RiderPenaltyAmountBase,
  RiderPenaltyEnginePayload,
  RiderPenaltyScenarioCode,
} from "@/lib/rider-cancellation-penalty-engine.types";

type Props = {
  party: PenaltyPartyCode;
  onPartyChange: (party: PenaltyPartyCode) => void;
  refreshKey?: number;
};

type PenaltyDraft = {
  afterAccept: {
    isEnabled: boolean;
    flatPenaltyAmount: string;
    ledgerTitle: string;
    ledgerDescription: string;
  };
  afterPickup: {
    isEnabled: boolean;
    penaltyTitle: string;
    ledgerDescription: string;
    amountBase: RiderPenaltyAmountBase;
  };
  reasonRules: Record<RiderPenaltyScenarioCode, Record<number, boolean>>;
};

function draftFromPayload(p: RiderPenaltyEnginePayload): PenaltyDraft {
  const accept = p.scenarios.find((s) => s.scenarioCode === "AFTER_ACCEPT_DISPATCH");
  const pickup = p.scenarios.find((s) => s.scenarioCode === "AFTER_MARK_PICKUP");
  const reasonRules: Record<RiderPenaltyScenarioCode, Record<number, boolean>> = {
    AFTER_ACCEPT_DISPATCH: {},
    AFTER_MARK_PICKUP: {},
  };
  for (const rule of p.reasonRules) {
    reasonRules[rule.scenarioCode][rule.catalogReasonId] = rule.appliesPenalty;
  }
  return {
    afterAccept: {
      isEnabled: accept?.isEnabled ?? true,
      flatPenaltyAmount:
        accept?.flatPenaltyAmount != null ? String(accept.flatPenaltyAmount) : "0",
      ledgerTitle: accept?.ledgerTitle ?? "",
      ledgerDescription: accept?.ledgerDescription ?? "",
    },
    afterPickup: {
      isEnabled: pickup?.isEnabled ?? true,
      penaltyTitle: pickup?.penaltyTitle ?? "",
      ledgerDescription: pickup?.ledgerDescription ?? "",
      amountBase: pickup?.amountBase ?? "DELIVERY_FARE",
    },
    reasonRules,
  };
}

const SCENARIO_TOGGLE_LABELS: Record<RiderPenaltyScenarioCode, string> = {
  AFTER_ACCEPT_DISPATCH: "Cancelled after accept",
  AFTER_MARK_PICKUP: "Cancelled after pickup",
};

const SCENARIO_LABELS: Record<RiderPenaltyScenarioCode, string> = {
  AFTER_ACCEPT_DISPATCH: "Cancellation after accept offer",
  AFTER_MARK_PICKUP: "Cancellation after order mark pickup",
};

export function RiderCancellationPenaltyPanel({ party, onPartyChange, refreshKey = 0 }: Props) {
  const { toast } = useToast();
  const [channel, setChannel] = useState<PenaltyCatalogChannel>("app");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [payload, setPayload] = useState<RiderPenaltyEnginePayload | null>(null);
  const [activeScenario, setActiveScenario] =
    useState<RiderPenaltyScenarioCode>("AFTER_ACCEPT_DISPATCH");
  const [acceptCollapsed, setAcceptCollapsed] = useState(false);
  const [pickupCollapsed, setPickupCollapsed] = useState(false);
  const [draft, setDraft] = useState<PenaltyDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const applyPayload = useCallback((next: RiderPenaltyEnginePayload) => {
    setMigrationRequired(Boolean(next.migrationRequired));
    setPayload(next);
    setDraft(draftFromPayload(next));
    if (!next.migrationRequired) {
      writeRiderPenaltyCache(next);
    }
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent && !draft) setLoading(true);
      try {
        const res = await fetch(
          `/api/super-admin/rider-cancellation-penalties?channel=${channel}`,
          { cache: "no-store" }
        );
        const data = await readApiJson(res);
        if (!res.ok || !data.success) {
          if (!silent) toast(String(data.error ?? "Load failed"), "error");
          return;
        }
        applyPayload(data as RiderPenaltyEnginePayload & { success?: boolean });
      } catch (e) {
        if (!silent) toast(e instanceof Error ? e.message : "Load failed", "error");
      } finally {
        setLoading(false);
      }
    },
    [applyPayload, channel, draft, toast]
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cached = readRiderPenaltyCache(channel);
    if (!cached) {
      setDraft(null);
      setPayload(null);
      setLoading(true);
    } else {
      applyPayload(cached);
      setLoading(false);
    }
    void load({ silent: Boolean(cached) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channel switch
  }, [channel, hydrated]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey only
  }, [refreshKey]);

  const riderReasons = useMemo(
    () => payload?.riderReasons.filter((r) => r.isActive) ?? [],
    [payload?.riderReasons]
  );

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const flatAmount = Number.parseFloat(draft.afterAccept.flatPenaltyAmount);
      const reasonRules = (
        ["AFTER_ACCEPT_DISPATCH", "AFTER_MARK_PICKUP"] as RiderPenaltyScenarioCode[]
      ).flatMap((scenarioCode) =>
        riderReasons
          .map((reason) => {
            const catalogReasonId = Number(reason.id);
            if (!Number.isInteger(catalogReasonId) || catalogReasonId <= 0) return null;
            return {
              scenarioCode,
              catalogReasonId,
              appliesPenalty: Boolean(
                draft.reasonRules[scenarioCode][Number(reason.id)] ?? false
              ),
            };
          })
          .filter((rule): rule is NonNullable<typeof rule> => rule != null)
      );

      const res = await fetch("/api/super-admin/rider-cancellation-penalties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarios: {
            AFTER_ACCEPT_DISPATCH: {
              isEnabled: draft.afterAccept.isEnabled,
              flatPenaltyAmount: Number.isFinite(flatAmount) ? flatAmount : 0,
              ledgerTitle: draft.afterAccept.ledgerTitle.trim(),
              ledgerDescription: draft.afterAccept.ledgerDescription.trim(),
            },
            AFTER_MARK_PICKUP: {
              isEnabled: draft.afterPickup.isEnabled,
              penaltyTitle: draft.afterPickup.penaltyTitle.trim(),
              ledgerDescription: draft.afterPickup.ledgerDescription.trim(),
              amountBase: draft.afterPickup.amountBase,
            },
          },
          reasonRules,
          channel,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        const details = data.details as
          | { fieldErrors?: Record<string, string[] | undefined> }
          | undefined;
        const fieldErrors = details?.fieldErrors;
        const firstField = fieldErrors
          ? Object.entries(fieldErrors).find(([, v]) => v?.length)?.[1]?.[0]
          : undefined;
        toast(firstField ?? String(data.error ?? "Save failed"), "error");
        return;
      }
      const next = data as RiderPenaltyEnginePayload & { success?: boolean };
      applyPayload(next);
      toast("Rider penalty settings saved.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (party !== "RIDER") {
    return (
      <section className={`${re.card} border-dashed p-10 text-center`}>
        <p className="text-lg font-medium text-slate-700">
          {party === "MERCHANT" ? "Merchant" : "Customer"} penalty engine
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Coming soon. Configure rider penalties first — order dashboard integration will follow.
        </p>
        <button
          type="button"
          onClick={() => onPartyChange("RIDER")}
          className={`${re.btnPrimary} mt-4`}
        >
          Open Rider penalties
        </button>
      </section>
    );
  }

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
          <code className="font-mono">backend/drizzle/0270_rider_cancellation_penalty_engine.sql</code>{" "}
          on Supabase SQL editor.
        </div>
      ) : null}

      <div
        className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
        style={{ backgroundColor: re.accentSoft, borderColor: re.accentBorder, color: "#4338CA" }}
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#5D3FD3]" aria-hidden />
        <p>
          Enabled scenarios and checked reasons are live policy — no separate approval step.
          Penalties apply only when the scenario is on and the cancellation reason is enabled below.
          Use the <strong>App</strong> channel for rider-app cancel reasons; toggles sync across
          matching web/app reason labels.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <RiderChannelToggle channel={channel} onChange={setChannel} />
          <RiderScenarioToggle scenario={activeScenario} onChange={setActiveScenario} />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || migrationRequired}
          className={re.btnPrimary}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save rider penalties
        </button>
      </div>

      {activeScenario === "AFTER_ACCEPT_DISPATCH" ? (
        <section className={re.card}>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-900">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F3F0FF] text-[#5D3FD3]">
                  <UserCog className="h-4 w-4" />
                </span>
                <span className="truncate">{SCENARIO_LABELS.AFTER_ACCEPT_DISPATCH}</span>
              </h3>
              <div className="flex shrink-0 items-center gap-3">
                <EnabledToggle
                  enabled={draft.afterAccept.isEnabled}
                  onChange={(isEnabled) =>
                    setDraft((d) =>
                      d ? { ...d, afterAccept: { ...d.afterAccept, isEnabled } } : d
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setAcceptCollapsed((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label={acceptCollapsed ? "Expand section" : "Collapse section"}
                >
                  {acceptCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {!acceptCollapsed ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {channel === "app"
                  ? "Applies when a rider accepts a dispatched offer and cancels from the rider app with a Rider-fault reason."
                  : "Applies when a rider accepts a dispatched offer and the order is cancelled from the dashboard (Rider cancellation) or the rider cancels after accept."}
              </p>
            ) : null}
          </div>

          {!acceptCollapsed ? (
            <>
              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 px-5 pb-5 lg:grid-cols-[minmax(148px,auto)_minmax(0,1fr)_minmax(0,1.75fr)]">
                <label className="block min-w-[148px] text-sm">
                  <span className="mb-1.5 block whitespace-nowrap font-medium text-slate-700">
                    Penalty amount (₹)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.afterAccept.flatPenaltyAmount}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? { ...d, afterAccept: { ...d.afterAccept, flatPenaltyAmount: e.target.value } }
                          : d
                      )
                    }
                    className={re.input}
                  />
                </label>

                <label className="block min-w-0 text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">
                    Ledger title (shown to rider)
                  </span>
                  <input
                    type="text"
                    value={draft.afterAccept.ledgerTitle}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, afterAccept: { ...d.afterAccept, ledgerTitle: e.target.value } } : d
                      )
                    }
                    placeholder="Trip Cancelled After Assignment"
                    className={re.input}
                  />
                </label>

                <label className="block min-w-0 text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">
                    Ledger description (shown to rider)
                  </span>
                  <input
                    type="text"
                    value={draft.afterAccept.ledgerDescription}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              afterAccept: { ...d.afterAccept, ledgerDescription: e.target.value },
                            }
                          : d
                      )
                    }
                    placeholder="A penalty was applied because your ride was cancelled after you accepted the dispatched offer."
                    className={re.input}
                  />
                </label>
              </div>

              <ReasonToggleTable
                embedded
                channel={channel}
                title="Apply penalty for these Rider cancellation reasons"
                subtitle={
                  channel === "app"
                    ? "Reasons from App Cancellation catalog. Only checked reasons charge the penalty above."
                    : "Only enabled reasons with 3PL (Rider) fault will charge the flat penalty above."
                }
                reasons={riderReasons}
                selected={draft.reasonRules.AFTER_ACCEPT_DISPATCH}
                onToggle={(reasonId, applies) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          reasonRules: {
                            ...d.reasonRules,
                            AFTER_ACCEPT_DISPATCH: {
                              ...d.reasonRules.AFTER_ACCEPT_DISPATCH,
                              [reasonId]: applies,
                            },
                          },
                        }
                      : d
                  )
                }
              />
            </>
          ) : null}
        </section>
      ) : (
        <section className={re.card}>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-900">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F3F0FF] text-[#5D3FD3]">
                  <Package className="h-4 w-4" />
                </span>
                <span className="truncate">{SCENARIO_LABELS.AFTER_MARK_PICKUP}</span>
              </h3>
              <div className="flex shrink-0 items-center gap-3">
                <EnabledToggle
                  enabled={draft.afterPickup.isEnabled}
                  onChange={(isEnabled) =>
                    setDraft((d) =>
                      d ? { ...d, afterPickup: { ...d.afterPickup, isEnabled } } : d
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setPickupCollapsed((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label={pickupCollapsed ? "Expand section" : "Collapse section"}
                >
                  {pickupCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {!pickupCollapsed ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {channel === "app"
                  ? "Applies when the rider has marked pickup and cancellation happens from the rider app with a Rider / 3PL fault reason."
                  : "Applies when the rider has marked the order picked up and cancellation happens with a Rider / 3PL fault reason from the order dashboard."}
              </p>
            ) : null}
          </div>

          {!pickupCollapsed ? (
            <>
              <div className="space-y-4 px-5 pb-5">
                <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 lg:grid-cols-[minmax(180px,1fr)_minmax(0,1.75fr)]">
                  <label className="block min-w-0 text-sm">
                    <span className="mb-1.5 block font-medium text-slate-700">
                      Penalty title (ledger)
                    </span>
                    <input
                      type="text"
                      value={draft.afterPickup.penaltyTitle}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, afterPickup: { ...d.afterPickup, penaltyTitle: e.target.value } } : d
                        )
                      }
                      placeholder="Post Pickup Cancellation"
                      className={re.input}
                    />
                  </label>

                  <label className="block min-w-0 text-sm">
                    <span className="mb-1.5 block font-medium text-slate-700">
                      Ledger description (shown to rider)
                    </span>
                    <input
                      type="text"
                      value={draft.afterPickup.ledgerDescription}
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                afterPickup: { ...d.afterPickup, ledgerDescription: e.target.value },
                              }
                            : d
                        )
                      }
                      placeholder="A penalty was applied because the order was cancelled after you marked it picked up."
                      className={re.input}
                    />
                  </label>
                </div>

                <fieldset className="block text-sm">
                  <legend className="mb-1.5 block font-medium text-slate-700">Amount debited type</legend>
                  <AmountBaseRadioGroup
                    value={draft.afterPickup.amountBase}
                    onChange={(amountBase) =>
                      setDraft((d) =>
                        d ? { ...d, afterPickup: { ...d.afterPickup, amountBase } } : d
                      )
                    }
                  />
                </fieldset>
              </div>

              <ReasonToggleTable
                embedded
                channel={channel}
                title="Apply penalty for these Rider cancellation reasons"
                subtitle={
                  channel === "app"
                    ? "App catalog reasons with Rider fault. When enabled, the selected amount type is debited."
                    : "When fault is 3PL / Rider and reason is enabled, the selected amount type is debited from rider wallet."
                }
                reasons={riderReasons}
                selected={draft.reasonRules.AFTER_MARK_PICKUP}
                onToggle={(reasonId, applies) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          reasonRules: {
                            ...d.reasonRules,
                            AFTER_MARK_PICKUP: {
                              ...d.reasonRules.AFTER_MARK_PICKUP,
                              [reasonId]: applies,
                            },
                          },
                        }
                      : d
                  )
                }
              />
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function AmountBaseRadioGroup({
  value,
  onChange,
}: {
  value: RiderPenaltyAmountBase;
  onChange: (value: RiderPenaltyAmountBase) => void;
}) {
  const options: {
    code: RiderPenaltyAmountBase;
    label: string;
    subtext: string;
  }[] = [
    {
      code: "DELIVERY_FARE",
      label: "Delivery fare paid to rider",
      subtext: "Debit the delivery fee component from the customer bill.",
    },
    {
      code: "COMPLETE_ORDER_VALUE",
      label: "Complete order value paid by customer",
      subtext: "Debit the full amount paid by the customer (CTC).",
    },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label="Amount debited type">
      {options.map((opt) => (
        <label
          key={opt.code}
          className={`flex flex-1 cursor-pointer items-start gap-2.5 rounded-lg border px-4 py-3 text-sm transition-colors ${
            value === opt.code
              ? "border-[#5D3FD3] bg-[#F3F0FF] ring-1 ring-[#5D3FD3]"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <input
            type="radio"
            name="amountBase"
            checked={value === opt.code}
            onChange={() => onChange(opt.code)}
            className="mt-0.5 accent-[#5D3FD3]"
          />
          <span className="min-w-0">
            <span className="block font-medium text-slate-900">{opt.label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">{opt.subtext}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function EnabledToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Enabled"
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
      <span className="text-sm font-medium text-slate-700">Enabled</span>
    </div>
  );
}

function ReasonToggleTable({
  title,
  subtitle,
  reasons,
  selected,
  onToggle,
  embedded = false,
  channel = "web",
}: {
  title: string;
  subtitle: string;
  reasons: {
    id: number;
    label: string;
    reasonCode: string;
    serviceType?: string | null;
  }[];
  selected: Record<number, boolean>;
  onToggle: (reasonId: number, applies: boolean) => void;
  embedded?: boolean;
  channel?: PenaltyCatalogChannel;
}) {
  if (reasons.length === 0) {
    return (
      <p className={`text-sm text-amber-700 ${embedded ? "border-t border-slate-100 px-5 py-5" : ""}`}>
        No Rider cancellation reasons in {channel === "app" ? "App" : "Web"} catalog. Add them under
        Super Admin → Cancellation reasons ({channel === "app" ? "App" : "Web"} Cancellation).
      </p>
    );
  }

  const serviceLabel = (v: string | null | undefined) => {
    if (!v) return "All";
    if (v === "person_ride") return "Ride";
    if (v === "food") return "Food";
    if (v === "parcel") return "Parcel";
    return v;
  };

  return (
    <div className={embedded ? "border-t border-slate-100 px-5 py-5" : "pt-1"}>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Reason</th>
              {channel === "app" ? <th className="px-4 py-2.5">Service</th> : null}
              <th className="px-4 py-2.5">Code</th>
              <th className="px-4 py-2.5 text-right">Apply penalty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {reasons.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-800">{r.label}</td>
                {channel === "app" ? (
                  <td className="px-4 py-3 text-xs text-slate-500">{serviceLabel(r.serviceType)}</td>
                ) : null}
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.reasonCode}</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="checkbox"
                    checked={selected[r.id] ?? false}
                    onChange={(e) => onToggle(r.id, e.target.checked)}
                    className={re.checkbox}
                    aria-label={`Apply penalty for ${r.label}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RiderChannelToggle({
  channel,
  onChange,
}: {
  channel: PenaltyCatalogChannel;
  onChange: (channel: PenaltyCatalogChannel) => void;
}) {
  const options: { code: PenaltyCatalogChannel; label: string }[] = [
    { code: "web", label: "Web Cancellation" },
    { code: "app", label: "App Cancellation" },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
      role="tablist"
      aria-label="Cancellation channel"
    >
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          role="tab"
          aria-selected={channel === opt.code}
          onClick={() => onChange(opt.code)}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            channel === opt.code
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function RiderScenarioToggle({
  scenario,
  onChange,
}: {
  scenario: RiderPenaltyScenarioCode;
  onChange: (scenario: RiderPenaltyScenarioCode) => void;
}) {
  const options: RiderPenaltyScenarioCode[] = ["AFTER_ACCEPT_DISPATCH", "AFTER_MARK_PICKUP"];

  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
      role="tablist"
      aria-label="Penalty scenario"
    >
      {options.map((code) => (
        <button
          key={code}
          type="button"
          role="tab"
          aria-selected={scenario === code}
          onClick={() => onChange(code)}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            scenario === code
              ? "bg-[#5D3FD3] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {SCENARIO_TOGGLE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}

export function PenaltyPartyToggle({
  party,
  onChange,
}: {
  party: PenaltyPartyCode;
  onChange: (party: PenaltyPartyCode) => void;
}) {
  const options: { code: PenaltyPartyCode; label: string }[] = [
    { code: "RIDER", label: "Rider" },
    { code: "MERCHANT", label: "Merchant" },
    { code: "CUSTOMER", label: "Customer" },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
      role="tablist"
      aria-label="Penalty party"
    >
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          role="tab"
          aria-selected={party === opt.code}
          onClick={() => onChange(opt.code)}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            party === opt.code
              ? "bg-white text-[#5D3FD3] shadow-sm ring-1 ring-[#5D3FD3]"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
