"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RiderSubscriptionPlan } from "./RiderSubscriptionPlansAdmin";

const BILLING_CYCLES = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "semi_yearly", label: "Semi-Yearly" },
  { key: "yearly", label: "Yearly" },
] as const;

const DEFAULT_BENEFITS = [
  { benefitKey: "priority_order_boost", benefitValue: "20", displayLabel: "Priority Orders", displayOrder: 1 },
  { benefitKey: "earnings_boost_percent", benefitValue: "20", displayLabel: "Up to 20% Higher Earnings", displayOrder: 2 },
  { benefitKey: "peak_hour_multiplier", benefitValue: "1.25", displayLabel: "Peak Hour Boost", displayOrder: 3 },
  { benefitKey: "faster_payouts", benefitValue: "true", displayLabel: "Faster Payouts", displayOrder: 4 },
  { benefitKey: "penalty_waiver_count", benefitValue: "1", displayLabel: "Monthly Penalty Waiver", displayOrder: 5 },
  { benefitKey: "premium_support", benefitValue: "true", displayLabel: "Premium Rider Support", displayOrder: 6 },
  { benefitKey: "reward_multiplier", benefitValue: "1.5", displayLabel: "Exclusive Rewards & Bonuses", displayOrder: 7 },
];

type PriceRow = { amount: string; gstPercent: string; autoWallet: boolean };

function calcTotal(subtotal: number, gstPercent: number) {
  const gst = Math.round((subtotal * gstPercent) / 100 * 100) / 100;
  return Math.round((subtotal + gst) * 100) / 100;
}

function uniqueBenefitLabels(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  return lines.filter((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function benefitLabelsFromPlan(benefits: RiderSubscriptionPlan["benefits"]): string[] {
  const sorted = [...benefits].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const b of sorted) {
    const label = (b.displayLabel || b.benefitKey).trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function resolveBenefitKey(
  label: string,
  index: number,
  editBenefits: RiderSubscriptionPlan["benefits"]
): string {
  const preset = DEFAULT_BENEFITS.find((b) => b.displayLabel === label);
  if (preset) return preset.benefitKey;
  const existing = editBenefits.find(
    (b) => (b.displayLabel || b.benefitKey).trim().toLowerCase() === label.toLowerCase()
  );
  if (existing?.benefitKey) return existing.benefitKey;
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return `custom_${slug || `line_${index + 1}`}`;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editPlan: RiderSubscriptionPlan | null;
  /** Prefill fields when cloning an existing plan (creates new plan on save). */
  cloneFrom?: RiderSubscriptionPlan | null;
};

export function RiderSubscriptionPlanForm({ isOpen, onClose, onSuccess, editPlan, cloneFrom }: Props) {
  const [code, setCode] = useState("GMITRA_MAX");
  const [name, setName] = useState("GMitra Max");
  const [description, setDescription] = useState("");
  const [badgeText, setBadgeText] = useState("POPULAR");
  const [badgeColor, setBadgeColor] = useState("#7C3AED");
  const [headline, setHeadline] = useState("Earn More. Get Priority. Grow Faster.");
  const [ctaLabel, setCtaLabel] = useState("Subscribe now");
  const [defaultBillingCycle, setDefaultBillingCycle] = useState("monthly");
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState("1");
  const [prices, setPrices] = useState<Record<string, PriceRow>>({
    daily: { amount: "10", gstPercent: "18", autoWallet: true },
    monthly: { amount: "199", gstPercent: "18", autoWallet: false },
    semi_yearly: { amount: "999", gstPercent: "18", autoWallet: false },
    yearly: { amount: "1799", gstPercent: "18", autoWallet: false },
  });
  const [benefitsText, setBenefitsText] = useState(DEFAULT_BENEFITS.map((b) => b.displayLabel).join("\n"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const source = editPlan ?? cloneFrom;
    if (source) {
      setCode(editPlan ? source.code : `${source.code}_COPY`);
      setName(editPlan ? source.name : `${source.name} (Copy)`);
      setDescription(source.description ?? "");
      setBadgeText(source.badgeText ?? "");
      setBadgeColor(source.badgeColor ?? "#7C3AED");
      setHeadline(source.headline ?? "");
      setCtaLabel(source.ctaLabel ?? "Subscribe now");
      setDefaultBillingCycle(source.defaultBillingCycle ?? "monthly");
      setIsActive(cloneFrom && !editPlan ? false : source.isActive);
      setDisplayOrder(String(source.displayOrder ?? 0));
      const priceMap: Record<string, PriceRow> = {
        daily: { amount: "10", gstPercent: "18", autoWallet: true },
        monthly: { amount: "199", gstPercent: "18", autoWallet: false },
        semi_yearly: { amount: "999", gstPercent: "18", autoWallet: false },
        yearly: { amount: "1799", gstPercent: "18", autoWallet: false },
      };
      for (const p of source.prices) {
        priceMap[p.billingCycle] = {
          amount: String(p.amount),
          gstPercent: String(p.gstPercent ?? 18),
          autoWallet: p.autoWalletDeduction,
        };
      }
      setPrices(priceMap);
      setBenefitsText(
        source.benefits.length
          ? benefitLabelsFromPlan(source.benefits).join("\n")
          : DEFAULT_BENEFITS.map((b) => b.displayLabel).join("\n")
      );
    }
  }, [isOpen, editPlan, cloneFrom]);

  if (!isOpen) return null;

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";
  const featured = prices[defaultBillingCycle];
  const featuredSubtotal = Number(featured?.amount) || 0;
  const featuredGst = Number(featured?.gstPercent) || 18;
  const featuredTotal = calcTotal(featuredSubtotal, featuredGst);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const benefitLines = uniqueBenefitLabels(benefitsText);
    const editBenefits = editPlan?.benefits ?? [];
    const benefits = benefitLines.map((label, i) => {
      const preset = DEFAULT_BENEFITS.find((b) => b.displayLabel === label);
      return {
        benefitKey: resolveBenefitKey(label, i, editBenefits),
        benefitValue: preset?.benefitValue ?? "true",
        displayLabel: label,
        displayOrder: i + 1,
      };
    });

    const payload = {
      code,
      name,
      description: description || null,
      badgeText,
      badgeColor,
      headline,
      ctaLabel,
      defaultBillingCycle,
      isActive,
      displayOrder: Number(displayOrder) || 0,
      prices: BILLING_CYCLES.map(({ key }) => ({
        billingCycle: key,
        amount: Number(prices[key]?.amount) || 0,
        gstPercent: Number(prices[key]?.gstPercent) || 18,
        autoWalletDeduction: Boolean(prices[key]?.autoWallet),
        isActive: true,
      })),
      benefits,
    };

    try {
      const url = editPlan ? `/api/subscription-plans/${editPlan.id}` : "/api/subscription-plans";
      const method = editPlan ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">
            {editPlan ? "Edit Rider Plan" : cloneFrom ? "Clone Rider Plan" : "Create Rider Plan"}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error ? <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div> : null}

          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className={labelCls}>Plan Name *</label><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div><label className={labelCls}>Plan Code *</label><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required disabled={!!editPlan} /></div>
          </div>

          <div><label className={labelCls}>Description</label><textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div><label className={labelCls}>Badge Text</label><input className={inputCls} value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="POPULAR" /></div>
            <div><label className={labelCls}>Badge Color</label><input className={inputCls} type="color" value={badgeColor} onChange={(e) => setBadgeColor(e.target.value)} /></div>
            <div><label className={labelCls}>Display Order</label><input className={inputCls} type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} /></div>
          </div>

          <div><label className={labelCls}>Headline (app sheet)</label><input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
          <div><label className={labelCls}>Subscribe Button Text</label><input className={inputCls} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} /></div>

          <div>
            <label className={labelCls}>Default billing cycle (shown in rider app)</label>
            <select
              className={inputCls}
              value={defaultBillingCycle}
              onChange={(e) => setDefaultBillingCycle(e.target.value)}
            >
              {BILLING_CYCLES.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-violet-700 mt-2 font-medium">
              App sheet preview: ₹{featuredSubtotal} + {featuredGst}% GST = ₹{featuredTotal} / {defaultBillingCycle.replace("_", " ")}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Billing Cycles, Subtotal & GST</h3>
            <div className="space-y-3">
              {BILLING_CYCLES.map(({ key, label }) => {
                const row = prices[key];
                const subtotal = Number(row?.amount) || 0;
                const gstPct = Number(row?.gstPercent) || 18;
                const total = calcTotal(subtotal, gstPct);
                return (
                  <div key={key} className="grid grid-cols-[100px_1fr_80px_1fr_auto] gap-2 items-center text-sm">
                    <span className="font-medium capitalize">{label}</span>
                    <input
                      className={inputCls}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Subtotal ₹"
                      value={row?.amount ?? "0"}
                      onChange={(e) =>
                        setPrices((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], amount: e.target.value, gstPercent: prev[key]?.gstPercent ?? "18", autoWallet: prev[key]?.autoWallet ?? false },
                        }))
                      }
                    />
                    <input
                      className={inputCls}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="GST %"
                      value={row?.gstPercent ?? "18"}
                      onChange={(e) =>
                        setPrices((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], gstPercent: e.target.value, amount: prev[key]?.amount ?? "0", autoWallet: prev[key]?.autoWallet ?? false },
                        }))
                      }
                    />
                    <span className="text-xs text-gray-600 font-semibold whitespace-nowrap">Total ₹{total}</span>
                    {key === "daily" ? (
                      <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={prices.daily?.autoWallet ?? false}
                          onChange={(e) =>
                            setPrices((prev) => ({
                              ...prev,
                              daily: { ...prev.daily, amount: prev.daily?.amount ?? "10", gstPercent: prev.daily?.gstPercent ?? "18", autoWallet: e.target.checked },
                            }))
                          }
                        />
                        Auto wallet
                      </label>
                    ) : <span />}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelCls}>Benefits (one per line — shown in rider app)</label>
            <textarea className={inputCls} rows={7} value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
          <button type="submit" onClick={handleSubmit} disabled={loading} className="px-4 py-2 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">
            {loading ? "Saving…" : editPlan ? "Update Plan" : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
