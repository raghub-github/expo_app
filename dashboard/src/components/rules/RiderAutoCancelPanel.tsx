"use client";

/**
 * "Auto-cancelled by engine" channel — per-service (Food / Parcel / Person-ride)
 * config for the geo-engine watchdog. Super Admin sets rider-fault thresholds
 * (location off, opposite direction, no movement, off-route), the re-warn cadence,
 * and the flat per-service penalty. Rows ship disabled.
 *
 * Rollout note: detection + rider warnings are live once a service is enabled;
 * automatic cancel + wallet debit ship in Phase C (see banner).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, ShieldAlert } from "lucide-react";

type ServiceType = "food" | "parcel" | "person_ride";

type ServiceConfig = {
  serviceType: ServiceType;
  phase: "pre_pickup" | "post_pickup";
  isEnabled: boolean;
  penaltyAmount: number;
  oppositeDirectionKm: number;
  noMovementMinutes: number;
  locationOffMinutes: number;
  routeDeviationM: number;
  enableLocationOffRule: boolean;
  enableNoMovementRule: boolean;
  enableOppositeDirectionRule: boolean;
  enableRouteDeviationRule: boolean;
  warningIntervalMinutes: number;
  graceMinutes: number;
  ledgerTitle: string;
  ledgerDescription: string;
  reasonCode: string | null;
};

const SERVICE_LABEL: Record<ServiceType, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person ride",
};
const SERVICE_ORDER: ServiceType[] = ["food", "parcel", "person_ride"];

export function RiderAutoCancelPanel() {
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [active, setActive] = useState<ServiceType>("food");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/super-admin/rider-auto-cancel-penalties", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Failed to load");
      setServices(data.services as ServiceConfig[]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = services.find((s) => s.serviceType === active);

  const patch = (key: keyof ServiceConfig, value: unknown) => {
    setServices((prev) =>
      prev.map((s) => (s.serviceType === active ? { ...s, [key]: value } : s))
    );
    setOk(null);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch("/api/super-admin/rider-auto-cancel-penalties", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ services }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "Failed to save");
      setServices(data.services as ServiceConfig[]);
      setOk("Saved");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-slate-200 bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#5D3FD3]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <b>Auto-cancel by engine (pre-pickup, rider fault).</b> When a rider accepts an order then
          turns off location, moves the wrong way, stops, or leaves the route beyond the limits
          below, the system warns them every few minutes and — once enabled — auto-cancels and
          debits a flat per-service penalty. Detection &amp; warnings are live per enabled service;
          automatic cancel + wallet debit activate in the Phase&nbsp;C rollout.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
          role="tablist"
          aria-label="Service"
        >
          {SERVICE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active === s}
              onClick={() => setActive(s)}
              className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                active === s
                  ? "bg-[#5D3FD3] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {SERVICE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {ok && <span className="text-sm font-medium text-emerald-600">{ok}</span>}
          {err && <span className="text-sm font-medium text-red-600">{err}</span>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5D3FD3] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4c33b0] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save engine rules
          </button>
        </div>
      </div>

      {current ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {SERVICE_LABEL[current.serviceType]} — pre-pickup auto-cancel
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Applies after the rider accepts and before pickup. Only this service&apos;s wallet is
                debited.
              </p>
            </div>
            <Toggle
              checked={current.isEnabled}
              onChange={(v) => patch("isEnabled", v)}
              label={current.isEnabled ? "Enabled" : "Disabled"}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
            <NumberField
              label="Penalty amount (₹)"
              hint="Flat amount debited from this service's wallet on auto-cancel."
              value={current.penaltyAmount}
              min={0}
              step={1}
              onChange={(v) => patch("penaltyAmount", v)}
            />
            <NumberField
              label="Re-warn every (minutes)"
              hint="How often the rider is warned while a rule is being breached."
              value={current.warningIntervalMinutes}
              min={1}
              max={60}
              step={1}
              onChange={(v) => patch("warningIntervalMinutes", v)}
            />

            <RuleRow
              title="Location off / app killed"
              hint="No GPS pings received for this long → warn, then auto-cancel."
              enabled={current.enableLocationOffRule}
              onToggle={(v) => patch("enableLocationOffRule", v)}
              field={
                <NumberField
                  label="Minutes with no location"
                  value={current.locationOffMinutes}
                  min={1}
                  step={1}
                  onChange={(v) => patch("locationOffMinutes", v)}
                  compact
                />
              }
            />
            <RuleRow
              title="Opposite direction"
              hint="Rider moves away from pickup by more than this distance."
              enabled={current.enableOppositeDirectionRule}
              onToggle={(v) => patch("enableOppositeDirectionRule", v)}
              field={
                <NumberField
                  label="Distance away (km)"
                  value={current.oppositeDirectionKm}
                  min={0}
                  step={0.5}
                  onChange={(v) => patch("oppositeDirectionKm", v)}
                  compact
                />
              }
            />
            <RuleRow
              title="No movement"
              hint="Rider is stationary this long while still sending location."
              enabled={current.enableNoMovementRule}
              onToggle={(v) => patch("enableNoMovementRule", v)}
              field={
                <NumberField
                  label="Stationary minutes"
                  value={current.noMovementMinutes}
                  min={1}
                  step={1}
                  onChange={(v) => patch("noMovementMinutes", v)}
                  compact
                />
              }
            />
            <RuleRow
              title="Off-route"
              hint="Rider strays from the planned route by more than this distance."
              enabled={current.enableRouteDeviationRule}
              onToggle={(v) => patch("enableRouteDeviationRule", v)}
              field={
                <NumberField
                  label="Deviation (metres)"
                  value={current.routeDeviationM}
                  min={0}
                  step={50}
                  onChange={(v) => patch("routeDeviationM", v)}
                  compact
                />
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 border-t border-slate-100 p-5 sm:grid-cols-2">
            <TextField
              label="Ledger title (shown to rider)"
              value={current.ledgerTitle}
              onChange={(v) => patch("ledgerTitle", v)}
            />
            <TextField
              label="Ledger description (shown to rider)"
              value={current.ledgerDescription}
              onChange={(v) => patch("ledgerDescription", v)}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
    </button>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  compact,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5D3FD3] focus:outline-none focus:ring-1 focus:ring-[#5D3FD3] ${
          compact ? "" : ""
        }`}
      />
      {hint && !compact && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5D3FD3] focus:outline-none focus:ring-1 focus:ring-[#5D3FD3]"
      />
    </label>
  );
}

function RuleRow({
  title,
  hint,
  enabled,
  onToggle,
  field,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  field: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      <div className={`mt-3 ${enabled ? "" : "opacity-50"}`}>{field}</div>
    </div>
  );
}
