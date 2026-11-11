"use client";

import { useCallback, useEffect, useState } from "react";
import { Gauge, Save, Store, Bike } from "lucide-react";
import { toast } from "sonner";
import { readApiJson } from "@/lib/payment/read-api-json";
import { formatInr } from "@/lib/format-inr";

type PayoutRuleRow = {
  id: number;
  party_type?: string;
  min_payout_amount?: number | string;
  max_payout_amount?: number | string | null;
  rule_name?: string;
  is_active?: boolean;
};

type DraftLimits = {
  id: number | null;
  min: string;
  max: string;
};

function pickRule(rules: PayoutRuleRow[], party: "MERCHANT" | "RIDER"): PayoutRuleRow | null {
  const active = rules.filter(
    (r) => String(r.party_type ?? "").toUpperCase() === party && r.is_active !== false
  );
  if (active.length === 0) return null;
  return active.sort((a, b) => Number(b.id) - Number(a.id))[0] ?? null;
}

function toDraft(rule: PayoutRuleRow | null, fallbackMax = 100_000): DraftLimits {
  if (!rule) return { id: null, min: "100", max: String(fallbackMax) };
  const min = Number(rule.min_payout_amount);
  const max = Number(rule.max_payout_amount);
  return {
    id: Number(rule.id),
    min: String(Number.isFinite(min) && min > 0 ? min : 100),
    max: String(Number.isFinite(max) && max > 0 ? max : fallbackMax),
  };
}

function PartyLimitCard({
  title,
  icon,
  draft,
  onChange,
  onSave,
  saving,
}: {
  title: string;
  icon: React.ReactNode;
  draft: DraftLimits;
  onChange: (next: DraftLimits) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const minN = Number(draft.min);
  const maxN = Number(draft.max);
  const invalid =
    !Number.isFinite(minN) ||
    !Number.isFinite(maxN) ||
    minN < 1 ||
    maxN < minN ||
    draft.id == null;

  return (
    <div className="rounded-md border-[0.5px] border-[#121212]/40 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#F7F7F7] text-[#121212]">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#121212]">{title}</h3>
          <p className="text-xs text-[#121212]/50">Manual withdrawal amount limits</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
          Min withdrawal (₹)
          <input
            type="number"
            min={1}
            step="1"
            value={draft.min}
            onChange={(e) => onChange({ ...draft, min: e.target.value })}
            className="h-9 rounded-md border border-[#121212]/12 px-3 text-sm font-medium text-[#121212] outline-none focus:border-[#121212]/35"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
          Max withdrawal (₹)
          <input
            type="number"
            min={1}
            step="1"
            value={draft.max}
            onChange={(e) => onChange({ ...draft, max: e.target.value })}
            className="h-9 rounded-md border border-[#121212]/12 px-3 text-sm font-medium text-[#121212] outline-none focus:border-[#121212]/35"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-[#121212]/50">
        Preview: {formatInr(Number.isFinite(minN) ? minN : 0)} –{" "}
        {formatInr(Number.isFinite(maxN) ? maxN : 0)} per request
      </p>

      {draft.id == null ? (
        <p className="mt-3 rounded-md border-[0.5px] border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No active payout rule found for this party. Run payment migrations (0239 / 0351 / 0465), then
          refresh.
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving || invalid}
        onClick={onSave}
        className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-[#121212] px-4 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save limits"}
      </button>
    </div>
  );
}

export function PaymentThresholdPanel() {
  const [merchant, setMerchant] = useState<DraftLimits>({ id: null, min: "100", max: "100000" });
  const [rider, setRider] = useState<DraftLimits>({ id: null, min: "100", max: "100000" });
  const [loading, setLoading] = useState(true);
  const [savingParty, setSavingParty] = useState<"MERCHANT" | "RIDER" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/payment-config", { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        toast.error(String(data.error ?? "Failed to load thresholds"));
        return;
      }
      const rules = (data.payoutRules as PayoutRuleRow[]) ?? [];
      setMerchant(toDraft(pickRule(rules, "MERCHANT")));
      setRider(toDraft(pickRule(rules, "RIDER")));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load thresholds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (party: "MERCHANT" | "RIDER", draft: DraftLimits) => {
    if (draft.id == null) {
      toast.error("Missing payout rule id");
      return;
    }
    const min = Number(draft.min);
    const max = Number(draft.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min) {
      toast.error("Min must be ≥ 1 and max must be ≥ min");
      return;
    }
    setSavingParty(party);
    try {
      const res = await fetch("/api/super-admin/payment-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "payment_payout_rules",
          id: draft.id,
          payload: {
            min_payout_amount: min,
            max_payout_amount: max,
          },
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        toast.error(String(data.error ?? "Save failed"));
        return;
      }
      const rules = (data.payoutRules as PayoutRuleRow[]) ?? [];
      setMerchant(toDraft(pickRule(rules, "MERCHANT")));
      setRider(toDraft(pickRule(rules, "RIDER")));
      toast.success(`${party === "MERCHANT" ? "Merchant" : "Rider"} limits saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingParty(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-md border-[0.5px] border-[#121212]/40 bg-white text-sm text-[#121212]/45">
        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[#121212]/30 border-t-[#121212]" />
        Loading thresholds…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#121212]/55">
        <Gauge className="mr-1.5 inline-block h-3.5 w-3.5 align-text-bottom text-[#121212]/45" />
        Set minimum and maximum manual withdrawal amounts for Merchant and Rider apps (and Partner
        Site). Requests outside this range are blocked.
      </p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PartyLimitCard
          title="Merchant"
          icon={<Store className="h-4 w-4" />}
          draft={merchant}
          onChange={setMerchant}
          saving={savingParty === "MERCHANT"}
          onSave={() => void save("MERCHANT", merchant)}
        />
        <PartyLimitCard
          title="Rider"
          icon={<Bike className="h-4 w-4" />}
          draft={rider}
          onChange={setRider}
          saving={savingParty === "RIDER"}
          onSave={() => void save("RIDER", rider)}
        />
      </div>
    </div>
  );
}
