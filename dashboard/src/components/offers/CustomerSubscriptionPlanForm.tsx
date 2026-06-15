"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CustomerSubscriptionPlan } from "./CustomerSubscriptionPlansAdmin";

const BILLING_CYCLES = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const;

type PriceRow = { amount: string; gstPercent: string; enabled: boolean };

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

function benefitLabelsFromPlan(benefits: CustomerSubscriptionPlan["benefits"]): string[] {
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

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editPlan: CustomerSubscriptionPlan | null;
  cloneFrom?: CustomerSubscriptionPlan | null;
};

export function CustomerSubscriptionPlanForm({ isOpen, onClose, onSuccess, editPlan, cloneFrom }: Props) {
  const [code, setCode] = useState("GMITRA_PLUS");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [badgeText, setBadgeText] = useState("PLUS");
  const [badgeColor, setBadgeColor] = useState("#059669");
  const [headline, setHeadline] = useState("");
  const [ctaLabel, setCtaLabel] = useState("Add Plus");
  const [defaultBillingCycle, setDefaultBillingCycle] = useState("monthly");
  const [isActive, setIsActive] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [displayOrder, setDisplayOrder] = useState("1");
  const [freeDeliveryEnabled, setFreeDeliveryEnabled] = useState(true);
  const [maxFreeDeliveryRadiusKm, setMaxFreeDeliveryRadiusKm] = useState("7");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [cashbackEnabled, setCashbackEnabled] = useState(false);
  const [cashbackPercentage, setCashbackPercentage] = useState("");
  const [prioritySupport, setPrioritySupport] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceRow>>({
    weekly: { amount: "", gstPercent: "18", enabled: false },
    monthly: { amount: "", gstPercent: "18", enabled: false },
    yearly: { amount: "", gstPercent: "18", enabled: false },
  });
  const [benefitsText, setBenefitsText] = useState("");
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
      setBadgeColor(source.badgeColor ?? "#059669");
      setHeadline(source.headline ?? "");
      setCtaLabel(source.ctaLabel ?? "Add Plus");
      setDefaultBillingCycle(source.defaultBillingCycle ?? "monthly");
      setIsActive(cloneFrom && !editPlan ? false : source.isActive);
      setIsFeatured(cloneFrom && !editPlan ? false : source.isFeatured);
      setDisplayOrder(String(source.displayOrder ?? 0));
      setFreeDeliveryEnabled(source.freeDeliveryEnabled);
      setMaxFreeDeliveryRadiusKm(String(source.maxFreeDeliveryRadiusKm ?? 7));
      setDiscountPercentage(source.discountPercentage != null ? String(source.discountPercentage) : "");
      setCashbackEnabled(source.cashbackEnabled);
      setCashbackPercentage(source.cashbackPercentage != null ? String(source.cashbackPercentage) : "");
      setPrioritySupport(source.prioritySupport);
      const priceMap: Record<string, PriceRow> = {
        weekly: { amount: "", gstPercent: "18", enabled: false },
        monthly: { amount: "", gstPercent: "18", enabled: false },
        yearly: { amount: "", gstPercent: "18", enabled: false },
      };
      for (const p of source.prices) {
        priceMap[p.billingCycle] = {
          amount: String(p.amount),
          gstPercent: String(p.gstPercent ?? 18),
          enabled: p.isActive !== false && p.amount > 0,
        };
      }
      setPrices(priceMap);
      setBenefitsText(benefitLabelsFromPlan(source.benefits).join("\n"));
    } else {
      setCode("GMITRA_PLUS");
      setName("");
      setDescription("");
      setBadgeText("PLUS");
      setBadgeColor("#059669");
      setHeadline("Save extra with free delivery & offers");
      setCtaLabel("Add Plus");
      setDefaultBillingCycle("monthly");
      setIsActive(true);
      setIsFeatured(false);
      setDisplayOrder("1");
      setFreeDeliveryEnabled(true);
      setMaxFreeDeliveryRadiusKm("7");
      setDiscountPercentage("");
      setCashbackEnabled(false);
      setCashbackPercentage("");
      setPrioritySupport(false);
      setPrices({
        weekly: { amount: "", gstPercent: "18", enabled: false },
        monthly: { amount: "", gstPercent: "18", enabled: false },
        yearly: { amount: "", gstPercent: "18", enabled: false },
      });
      setBenefitsText("Free delivery on eligible orders\nExclusive member offers\nPriority support");
    }
  }, [isOpen, editPlan, cloneFrom]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const pricePayload = BILLING_CYCLES.filter(({ key }) => prices[key]?.enabled && prices[key]?.amount.trim())
        .map(({ key }) => ({
          billingCycle: key,
          amount: Number(prices[key].amount) || 0,
          gstPercent: Number(prices[key].gstPercent) || 18,
          isActive: true,
        }));

      if (pricePayload.length === 0) {
        throw new Error("Add at least one billing cycle price (weekly, monthly, or yearly)");
      }

      const labels = uniqueBenefitLabels(benefitsText);
      const benefits = labels.map((label, index) => ({
        benefitKey: `benefit_${index + 1}`,
        benefitValue: "true",
        displayLabel: label,
        displayOrder: index + 1,
      }));

      const payload = {
        code,
        name,
        description: description || null,
        badgeText: badgeText || null,
        badgeColor,
        headline: headline || null,
        ctaLabel,
        isActive,
        isFeatured,
        displayOrder: Number(displayOrder) || 0,
        defaultBillingCycle,
        freeDeliveryEnabled,
        maxFreeDeliveryRadiusKm: Number(maxFreeDeliveryRadiusKm) || 7,
        discountPercentage: discountPercentage.trim() ? Number(discountPercentage) : null,
        cashbackEnabled,
        cashbackPercentage: cashbackPercentage.trim() ? Number(cashbackPercentage) : null,
        prioritySupport,
        prices: pricePayload,
        benefits,
      };

      const url = editPlan ? `/api/customer-subscription-plans/${editPlan.id}` : "/api/customer-subscription-plans";
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editPlan ? "Edit customer plan" : cloneFrom ? "Duplicate customer plan" : "New customer plan"}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error ? <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p> : null}

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Plan code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" required disabled={!!editPlan} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Plan name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" required />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Headline (checkout promo)</span>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">CTA label</span>
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Badge text</span>
              <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Badge color</span>
              <input type="color" value={badgeColor} onChange={(e) => setBadgeColor(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Display order</span>
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Pricing — only enabled cycles appear in the Customer App</p>
            {BILLING_CYCLES.map(({ key, label }) => (
              <div key={key} className="flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 min-w-[100px]">
                  <input
                    type="checkbox"
                    checked={prices[key]?.enabled ?? false}
                    onChange={(e) => setPrices((p) => ({ ...p, [key]: { ...p[key], enabled: e.target.checked } }))}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount ₹"
                  value={prices[key]?.amount ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [key]: { ...p[key], amount: e.target.value, enabled: true } }))}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="GST %"
                  value={prices[key]?.gstPercent ?? "18"}
                  onChange={(e) => setPrices((p) => ({ ...p, [key]: { ...p[key], gstPercent: e.target.value } }))}
                  className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            ))}
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Default billing cycle</span>
              <select value={defaultBillingCycle} onChange={(e) => setDefaultBillingCycle(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {BILLING_CYCLES.map(({ key, label }) => (
                  <option key={key} value={key} disabled={!prices[key]?.enabled || !prices[key]?.amount.trim()}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Benefits & delivery</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={freeDeliveryEnabled} onChange={(e) => setFreeDeliveryEnabled(e.target.checked)} />
              <span className="text-sm">Free delivery enabled</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Max free delivery radius (km)</span>
              <input type="number" min="0" step="0.1" value={maxFreeDeliveryRadiusKm} onChange={(e) => setMaxFreeDeliveryRadiusKm(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Discount % (optional)</span>
                <input type="number" min="0" max="100" value={discountPercentage} onChange={(e) => setDiscountPercentage(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={cashbackEnabled} onChange={(e) => setCashbackEnabled(e.target.checked)} />
                <span className="text-sm">Cashback enabled</span>
              </label>
            </div>
            {cashbackEnabled ? (
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Cashback %</span>
                <input type="number" min="0" max="100" value={cashbackPercentage} onChange={(e) => setCashbackPercentage(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
            ) : null}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={prioritySupport} onChange={(e) => setPrioritySupport(e.target.checked)} />
              <span className="text-sm">Priority support</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Benefit bullets (one per line)</span>
              <textarea value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono" />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className="text-sm font-medium">Active (visible to customers)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
              <span className="text-sm font-medium">Featured (only one globally)</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {loading ? "Saving…" : editPlan ? "Update plan" : "Create plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
