"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, Headphones, Loader2, Sparkles } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import type { StoreOnboardingCommissionConfigDTO } from "@/lib/db/operations/store-onboarding-commission-config";

type FormState = {
  planName: string;
  showRecommendedBadge: boolean;
  standardOnboardingFee: string;
  discountedOnboardingFee: string;
  discountPercent: string;
  baseServiceFeePercent: string;
  gstPercent: string;
  discountPeriodLabel: string;
  baseServiceFeePeriodLabel: string;
  featuresText: string;
  alertNotice: string;
  footerNote: string;
  supportContact: string;
  payButtonText: string;
};

const inputClass =
  "w-full rounded-md border border-gray-200 bg-transparent px-2.5 py-1.5 text-sm text-gray-900 transition-[border-color,box-shadow] placeholder:text-gray-400 hover:border-gray-300 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30";

const textareaClass = `${inputClass} resize-y min-h-[3rem] leading-snug`;

/** ((standard - discounted) / standard) * 100, clamped 0–100; null if inputs invalid. */
function computedDiscountPercent(standardStr: string, discountedStr: string): string | null {
  const std = parseFloat(String(standardStr).trim());
  const discounted = parseFloat(String(discountedStr).trim());
  if (!Number.isFinite(std) || !Number.isFinite(discounted) || std <= 0) return null;
  const raw = ((std - discounted) / std) * 100;
  if (!Number.isFinite(raw)) return null;
  return Math.min(100, Math.max(0, raw)).toFixed(2);
}

const formGrid =
  "grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-1 block text-[11px] font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function serializeFormState(f: FormState): string {
  return JSON.stringify(f);
}

function dtoToForm(c: StoreOnboardingCommissionConfigDTO): FormState {
  return {
    planName: c.planName,
    showRecommendedBadge: c.showRecommendedBadge,
    standardOnboardingFee: c.standardOnboardingFee,
    discountedOnboardingFee: c.discountedOnboardingFee,
    discountPercent: c.discountPercent,
    baseServiceFeePercent: c.baseServiceFeePercent,
    gstPercent: c.gstPercent ?? "18",
    discountPeriodLabel: c.discountPeriodLabel,
    baseServiceFeePeriodLabel: c.baseServiceFeePeriodLabel,
    featuresText: c.features.join(", "),
    alertNotice: c.alertNotice,
    footerNote: c.footerNote,
    supportContact: c.supportContact,
    payButtonText: c.payButtonText ?? "",
  };
}

export default function StoreOnboardingFeePage() {
  const router = useRouter();
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store-onboarding-commission", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        setForm(null);
        setSavedSnapshot(null);
        return;
      }
      const config = data.config as StoreOnboardingCommissionConfigDTO;
      const next = dtoToForm(config);
      setForm(next);
      setSavedSnapshot(serializeFormState(next));
      setUpdatedAt(config.updatedAt);
    } catch {
      setError("Failed to load");
      setForm(null);
      setSavedSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!permLoading && !isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [permLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, load]);

  const patchFeesAndMaybeDiscount = useCallback(
    (patch: Partial<Pick<FormState, "standardOnboardingFee" | "discountedOnboardingFee">>) => {
      setForm((f) => {
        if (!f) return f;
        const next = { ...f, ...patch };
        const pct = computedDiscountPercent(next.standardOnboardingFee, next.discountedOnboardingFee);
        if (pct !== null) next.discountPercent = pct;
        return next;
      });
    },
    [],
  );

  const previewSummary = useMemo(() => {
    if (!form) return "";
    const std = form.standardOnboardingFee;
    const cur = form.discountedOnboardingFee;
    const pct = form.discountPercent;
    const svc = form.baseServiceFeePercent;
    const gst = Math.max(0, Math.min(100, parseFloat(form.gstPercent) || 0));
    const dlab = form.discountPeriodLabel;
    const subP = Math.max(0, Math.round((parseFloat(cur) || 0) * 100));
    const gstP = Math.round((subP * gst) / 100);
    const total = (subP + gstP) / 100;
    const totalStr = Number.isInteger(total) ? String(total) : total.toFixed(2);
    const gstBit =
      gst > 0 ? ` · GST ${gst}% on ₹${cur} → checkout total ₹${totalStr}` : " · GST 0% (no tax on onboarding fee)";
    return `Onboarding fee: ₹${cur} out of ₹${std} — ${pct}% off ${dlab} (standard ₹${std}) Base service fee ${svc}%${gstBit}`;
  }, [form]);

  const isDirty = useMemo(() => {
    if (!form || savedSnapshot === null) return false;
    return serializeFormState(form) !== savedSnapshot;
  }, [form, savedSnapshot]);

  useEffect(() => {
    if (isDirty) setInfo(null);
  }, [isDirty]);

  const save = async () => {
    if (!form || !isDirty) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const features = form.featuresText
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/store-onboarding-commission", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planName: form.planName,
          showRecommendedBadge: form.showRecommendedBadge,
          standardOnboardingFee: form.standardOnboardingFee,
          discountedOnboardingFee: form.discountedOnboardingFee,
          discountPercent: form.discountPercent,
          baseServiceFeePercent: form.baseServiceFeePercent,
          gstPercent: form.gstPercent,
          discountPeriodLabel: form.discountPeriodLabel,
          baseServiceFeePeriodLabel: form.baseServiceFeePeriodLabel,
          features,
          alertNotice: form.alertNotice,
          footerNote: form.footerNote,
          supportContact: form.supportContact,
          payButtonText: form.payButtonText.trim() === "" ? null : form.payButtonText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      const config = data.config as StoreOnboardingCommissionConfigDTO;
      const next = dtoToForm(config);
      setForm(next);
      setSavedSnapshot(serializeFormState(next));
      setUpdatedAt(config.updatedAt);
      setInfo("Saved.");
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (permLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="w-full min-w-0 max-w-6xl pb-20 text-gray-900">
      {error ? (
        <div className="mt-2 flex items-start gap-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {info ? <p className="mt-2 text-xs font-medium text-emerald-700">{info}</p> : null}

      {loading ? (
        <div className="flex justify-center py-10 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : !form ? (
        <p className="mt-3 text-sm text-gray-600">No configuration found. Apply migrations 0189 and 0191, then reload.</p>
      ) : (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className={formGrid}>
            <Field label="Plan name">
              <input
                value={form.planName}
                onChange={(e) => setForm((f) => (f ? { ...f, planName: e.target.value } : f))}
                className={inputClass}
              />
            </Field>

            <Field label="Recommended">
              <label className="flex h-[34px] cursor-pointer items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={form.showRecommendedBadge}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, showRecommendedBadge: e.target.checked } : f))
                  }
                  className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Show badge
              </label>
            </Field>

            <Field label="Standard fee (₹)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.standardOnboardingFee}
                onChange={(e) => patchFeesAndMaybeDiscount({ standardOnboardingFee: e.target.value })}
                className={inputClass}
              />
            </Field>

            <Field label="Discounted fee (₹)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.discountedOnboardingFee}
                onChange={(e) => patchFeesAndMaybeDiscount({ discountedOnboardingFee: e.target.value })}
                className={inputClass}
              />
            </Field>

            <Field label="Discount (%)">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.discountPercent}
                onChange={(e) => setForm((f) => (f ? { ...f, discountPercent: e.target.value } : f))}
                className={`${inputClass} bg-violet-50/40`}
                title="Auto-filled from standard vs discounted fee; editable if needed."
              />
            </Field>

            <Field label="Base service fee (%)">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.baseServiceFeePercent}
                onChange={(e) => setForm((f) => (f ? { ...f, baseServiceFeePercent: e.target.value } : f))}
                className={inputClass}
              />
            </Field>

            <Field label="GST on onboarding fee (%)">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.gstPercent}
                onChange={(e) => setForm((f) => (f ? { ...f, gstPercent: e.target.value } : f))}
                className={inputClass}
                title="Applied on the discounted onboarding fee at checkout (0 = no GST)."
              />
            </Field>

            <Field label="Discount period label">
              <input
                value={form.discountPeriodLabel}
                onChange={(e) => setForm((f) => (f ? { ...f, discountPeriodLabel: e.target.value } : f))}
                className={inputClass}
              />
            </Field>

            <Field label="Base service period label">
              <input
                value={form.baseServiceFeePeriodLabel}
                onChange={(e) => setForm((f) => (f ? { ...f, baseServiceFeePeriodLabel: e.target.value } : f))}
                className={inputClass}
              />
            </Field>

            <Field label="Pay button label">
              <div className="relative w-full max-w-full min-w-0">
                <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.payButtonText}
                  onChange={(e) => setForm((f) => (f ? { ...f, payButtonText: e.target.value } : f))}
                  className={`${inputClass} box-border w-full min-w-0 pl-8 pr-3`}
                  title={form.payButtonText}
                />
              </div>
            </Field>

            <Field label="Feature bullets (comma-separated)" className="col-span-full xl:col-span-5">
              <textarea
                value={form.featuresText}
                onChange={(e) => setForm((f) => (f ? { ...f, featuresText: e.target.value } : f))}
                rows={2}
                placeholder="First feature, second feature, third feature"
                className={textareaClass}
              />
            </Field>

            <Field label="Alert banner" className="col-span-full xl:col-span-5">
              <textarea
                value={form.alertNotice}
                onChange={(e) => setForm((f) => (f ? { ...f, alertNotice: e.target.value } : f))}
                rows={2}
                className={textareaClass}
              />
            </Field>

            <Field label="Footer note" className="col-span-full xl:col-span-5">
              <textarea
                value={form.footerNote}
                onChange={(e) => setForm((f) => (f ? { ...f, footerNote: e.target.value } : f))}
                rows={2}
                className={textareaClass}
              />
            </Field>

            <div className="col-span-full flex flex-nowrap items-start gap-3 xl:col-span-5">
              <span className="w-28 shrink-0 pt-2 text-[11px] font-medium leading-tight text-gray-700 sm:w-32">
                Support contact
              </span>
              <div className="relative min-w-0 flex-1">
                <Headphones className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <textarea
                  value={form.supportContact}
                  onChange={(e) => setForm((f) => (f ? { ...f, supportContact: e.target.value } : f))}
                  rows={3}
                  className={`${inputClass} min-h-[5rem] w-full resize-y py-2 pl-8 pr-2.5 leading-normal`}
                />
              </div>
            </div>
          </div>

          <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">{previewSummary}</p>

          <div className="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
            <p className="text-[10px] text-gray-500">
              {updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString()}` : "\u00a0"}
            </p>
            <button
              type="submit"
              disabled={saving || !isDirty}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
