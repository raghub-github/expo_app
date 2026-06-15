"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Truck } from "lucide-react";
import { toast } from "sonner";

type Config = {
  fallbackBaseInr: number;
  fallbackPerKmInr: number;
  minFeeInr: number;
  updatedAt: string | null;
};

const inputClass =
  "w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30";

export function DeliveryFallbackPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseInr, setBaseInr] = useState("25");
  const [perKmInr, setPerKmInr] = useState("5");
  const [minFeeInr, setMinFeeInr] = useState("0");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/delivery-fallback-rates", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Load failed");
      const c = json.config as Config;
      setBaseInr(String(c.fallbackBaseInr));
      setPerKmInr(String(c.fallbackPerKmInr));
      setMinFeeInr(String(c.minFeeInr));
      setUpdatedAt(c.updatedAt);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previewFee = (() => {
    const base = parseFloat(baseInr);
    const perKm = parseFloat(perKmInr);
    const km = 3;
    if (!Number.isFinite(base) || !Number.isFinite(perKm)) return null;
    return (base + km * perKm).toFixed(2);
  })();

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/delivery-fallback-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fallbackBaseInr: parseFloat(baseInr),
          fallbackPerKmInr: parseFloat(perKmInr),
          minFeeInr: parseFloat(minFeeInr),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Save failed");
      toast.success("Delivery fallback rates saved");
      setUpdatedAt(json.config?.updatedAt ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-md shadow-slate-200/30 sm:rounded-2xl sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700 ring-1 ring-teal-600/15">
          <Truck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Fallback delivery charge</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            Used when a drop location has no geo slab, slab config is invalid, or pincode is not mapped.
            Location-specific pricing is still managed under <strong>Delivery slabs</strong> in tree view.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Base fee per order (₹)</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={baseInr}
              onChange={(e) => setBaseInr(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Per km fee (₹)</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={perKmInr}
              onChange={(e) => setPerKmInr(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Minimum delivery fee floor (₹)</label>
            <input
              className={inputClass}
              inputMode="decimal"
              value={minFeeInr}
              onChange={(e) => setMinFeeInr(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Set 0 to disable the floor.</p>
          </div>

          {previewFee ? (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Example at <strong>3 km</strong>: ₹{baseInr} + 3 × ₹{perKmInr} = <strong>₹{previewFee}</strong>
              <div className="mt-1 text-xs text-slate-500">
                Bill modal copy: &quot;₹{baseInr} per order plus ₹{perKmInr} per km&quot;
              </div>
            </div>
          ) : null}

          {updatedAt ? (
            <p className="text-xs text-slate-400">Last updated: {new Date(updatedAt).toLocaleString()}</p>
          ) : null}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
